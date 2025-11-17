from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
import argparse
import json
import boto3


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--db-secret-arn", required=True, help="Secrets Manager ARN with MySQL credentials")
    p.add_argument("--clicks-table", default="clicks", help="MySQL table holding click interactions")
    p.add_argument("--output", help="optional path (e.g., s3://...) to write Parquet recommendations for auditing")
    p.add_argument("--topn", type=int, default=20)
    p.add_argument("--db-table", default="recommendations", help="MySQL table for recommender output")
    return p.parse_args()


def load_db_credentials(secret_arn: str) -> dict:
    client = boto3.client("secretsmanager")
    resp = client.get_secret_value(SecretId=secret_arn)
    secret_str = resp.get("SecretString")
    if not secret_str:
        raise ValueError("SecretString missing from DB credentials secret")
    data = json.loads(secret_str)
    required_keys = ["username", "password", "host", "port", "dbname"]
    missing = [k for k in required_keys if k not in data]
    if missing:
        raise ValueError(f"DB secret is missing keys: {', '.join(missing)}")
    return data


def main():
    args = parse_args()
    spark = (
        SparkSession.builder.appName("poi-recommender-covisitation")
        .getOrCreate()
    )

    db_cfg = load_db_credentials(args.db_secret_arn)
    jdbc_url = f"jdbc:mysql://{db_cfg['host']}:{db_cfg['port']}/{db_cfg['dbname']}"

    # Load interactions directly from RDS (clicks table)
    interactions = (
        spark.read.format("jdbc")
        .option("url", jdbc_url)
        .option("dbtable", args.clicks_table)
        .option("user", db_cfg["username"])
        .option("password", db_cfg["password"])
        .option("driver", "com.mysql.cj.jdbc.Driver")
        .load()
    )

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
    # user: user_id | account_id
    # item: item_id | place_id
    # ts  : timestamp | clicked_at
    interactions = interactions.withColumn(
        "user",
        pick_coalesce(interactions, ["user_id", "account_id"]).cast("string")
    ).withColumn(
        "item",
        pick_coalesce(interactions, ["item_id", "place_id"]).cast("string")
    ).withColumn(
        "ts",
        F.unix_timestamp(
            pick_coalesce(interactions, ["timestamp", "clicked_at"]).cast("timestamp")
        ).cast("long")
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

    # Convert to similarity score (co_visits normalized by sqrt(freq(i1)*freq(i2)))
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

    # Optional Parquet output (e.g., audit trail)
    if args.output:
        recs.coalesce(1).write.mode("overwrite").parquet(args.output)

    # Persist to MySQL for serving
    (
        recs.write.format("jdbc")
        .option("url", jdbc_url)
        .option("dbtable", args.db_table)
        .option("user", db_cfg["username"])
        .option("password", db_cfg["password"])
        .option("driver", "com.mysql.cj.jdbc.Driver")
        .mode("overwrite")
        .save()
    )

    spark.stop()


if __name__ == "__main__":
    main()
