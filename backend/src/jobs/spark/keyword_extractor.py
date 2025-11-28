from pyspark.sql import SparkSession
from pyspark.sql.functions import col, lower, regexp_replace, explode, avg, count, expr, length, current_date, date_sub
from pyspark.ml.feature import Tokenizer, StopWordsRemover, NGram
import sys

def run_job(input_path, output_path):
    # 1. Initialize Spark (Standard)
    spark = SparkSession.builder.appName("NativeReviewAnalytics").getOrCreate()

    print(f"Reading data from: {input_path}")

    # 2. Load Data
    df = spark.read.option("header", "true").option("inferSchema", "true").csv(input_path)
    
    # 3. Filter (VALIDATION + ROLLING WINDOW)
    # We filter for valid reviews AND ensure they are from the last 365 days
    df_clean = df.filter(
        (col("publish_time") >= date_sub(current_date(), 365)) & 
        (col("review_text").isNotNull()) & 
        (col("rating").isNotNull())
    )

    # 4. Clean Text
    # Lowercase and remove anything that isn't a letter or space
    df_clean = df_clean.withColumn("clean_text", lower(col("review_text")))
    df_clean = df_clean.withColumn("clean_text", regexp_replace(col("clean_text"), "[^a-z\\s]", ""))

    # 5. Tokenize (Split into words)
    tokenizer = Tokenizer(inputCol="clean_text", outputCol="tokens")
    df_tokenized = tokenizer.transform(df_clean)

    # 6. Remove Stop Words (the, and, is, etc.)
    remover = StopWordsRemover(inputCol="tokens", outputCol="filtered_words")
    df_no_stopwords = remover.transform(df_tokenized)

    # 7. Generate Bigrams (The Native Enhancement!)
    # This turns ["great", "customer", "service"] into ["great customer", "customer service"]
    ngram = NGram(n=2, inputCol="filtered_words", outputCol="bigrams")
    df_bigrams = ngram.transform(df_no_stopwords)

    # 8. Explode & Aggregate
    # We use 'bigrams' column to get 2-word phrases.
    df_exploded = df_bigrams.select(
        col("place_id"),
        col("rating"),
        explode(col("bigrams")).alias("word")
    )

    # Filter out empty or super short noise
    df_exploded = df_exploded.filter(length(col("word")) > 2)

    # 9. Calculate Statistics
    # We use the USER RATING to determine sentiment (Avg of 1-5 stars)
    keyword_stats = df_exploded.groupBy("place_id", "word").agg(
        count("*").alias("frequency"),
        avg("rating").alias("avg_sentiment")
    )

    # 10. Filter Significance
    significant_keywords = keyword_stats.filter(col("frequency") >= 3)

    # 11. Assign Labels
    final_insights = significant_keywords.withColumn("sentiment_label",
        expr("CASE WHEN avg_sentiment >= 4.2 THEN 'positive' " +
             "WHEN avg_sentiment <= 2.5 THEN 'negative' " +
             "ELSE 'neutral' END")
    )

    # 12. Write to S3
    print(f"Writing output to: {output_path}")
    final_insights.write.mode("overwrite").parquet(output_path)
    spark.stop()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: keyword_extractor.py <s3_input_path> <s3_output_path>")
        sys.exit(1)
    run_job(sys.argv[1], sys.argv[2])