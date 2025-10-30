from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
import argparse


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--raw", required=True, help="s3 path to raw/ (contains interactions/ and poi/)")
    p.add_argument("--poi", required=True, help="s3 path to raw poi metadata folder")
    p.add_argument("--output", required=True, help="s3 path to curated/recommendations/")
    p.add_argument("--topn", type=int, default=20)
    return p.parse_args()


def main():
    args = parse_args()
    spark = (
        SparkSession.builder.appName("poi-recommender-covisitation")
        .getOrCreate()
    )

    # Load interactions (schema: user_id, item_id, timestamp, event_type)
    interactions_path = f"{args.raw.rstrip('/')}/interactions/"
    poi_path = args.poi.rstrip('/') + "/"

    # Robust loader: try JSON, but fall back to CSV if only _corrupt_record exists
    def load_interactions(path: str):
        df_json = None
        try:
            tmp = spark.read.json(path)
            # If JSON reader produced only _corrupt_record or empty schema, treat as failure
            non_trivial_cols = [c for c in tmp.columns if c != "_corrupt_record"]
            if len(non_trivial_cols) > 0:
                df_json = tmp
        except Exception:
            df_json = None
        if df_json is not None:
            return df_json
        # Fallback to CSV with header
        return spark.read.option("header", True).csv(path)

    interactions = load_interactions(interactions_path)

    # Normalize column casing to avoid case-sensitivity surprises
    interactions = interactions.toDF(*[c.lower() for c in interactions.columns])

    def pick_coalesce(df, names, default=None):
        exprs = [F.col(n) for n in names if n in df.columns]
        if not exprs:
            return default if default is not None else F.lit(None)
        if len(exprs) == 1:
            return exprs[0]
        return F.coalesce(*exprs)

    # Coalesce common variants from different exports
    # user: user_id | USER_ID | account_id | ACCOUNT_ID
    # item: item_id | ITEM_ID | place_id   | PLACE_ID
    # ts  : timestamp | TIMESTAMP | clicked_at | CLICKED_AT
    # event_type: event_type | EVENT_TYPE | default 'CLICK'
    interactions = interactions.withColumn(
        "user",
        pick_coalesce(interactions, ["user_id", "account_id"]).cast("string")
    ).withColumn(
        "item",
        pick_coalesce(interactions, ["item_id", "place_id"]).cast("string")
    ).withColumn(
        "ts",
        pick_coalesce(interactions, ["timestamp", "clicked_at"]).cast("long")
    ).withColumn(
        "event_type",
        pick_coalesce(interactions, ["event_type"], default=F.lit("CLICK"))
    )

    interactions = interactions.dropna(subset=["user", "item"])
    interactions = interactions.dropDuplicates(["user", "item", "ts"])

    # Basic co-visitation: for each user, get pairs of items they interacted with
    user_items = interactions.select("user", "item").distinct()

    ui1 = user_items.withColumnRenamed("item", "i1")
    ui2 = user_items.withColumnRenamed("item", "i2")
    pairs = ui1.join(ui2, on="user").where(F.col("i1") != F.col("i2"))

    # Count co-occurrences (i1, i2)
    co_counts = pairs.groupBy("i1", "i2").count().withColumnRenamed("count", "co_visits")

    # Convert to similarity score (here: co_visits normalized by sqrt(freq(i1)*freq(i2)))
    item_freq = user_items.groupBy("item").count().withColumnRenamed("count", "freq")
    co = co_counts.join(item_freq.withColumnRenamed("item", "i1"), "i1")\
                   .withColumnRenamed("freq", "f1")\
                   .join(item_freq.withColumnRenamed("item", "i2"), "i2")\
                   .withColumnRenamed("freq", "f2")

    co = co.withColumn("score", F.col("co_visits")/F.sqrt(F.col("f1")*F.col("f2")))

    # Top-N recommendations per item (neighbors)
    w = Window.partitionBy("i1").orderBy(F.desc("score"))
    topn = co.withColumn("rn", F.row_number().over(w)).where(F.col("rn") <= args.topn)

    recs = topn.select(
        F.col("i1").alias("item_id"),
        F.col("i2").alias("rec_item_id"),
        F.col("score").cast("double")
    )

    # Write parquet (coalesce small files)
    recs.coalesce(1).write.mode("overwrite").parquet(args.output)

    spark.stop()


if __name__ == "__main__":
    main()
