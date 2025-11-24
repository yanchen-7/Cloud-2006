from pyspark.sql import SparkSession
from pyspark.sql.functions import col, lower, regexp_replace, explode, avg, count, current_date, date_sub, expr, length
from pyspark.ml.feature import Tokenizer, StopWordsRemover
import sys

def run_job(input_path, output_path):
    # 1. Initialize Spark Session
    spark = SparkSession.builder \
        .appName("ReviewKeywordExtractor") \
        .getOrCreate()

    print(f"Reading data from: {input_path}")

    # 2. Load the Data
    # inferSchema=true allows Spark to recognize numbers/dates automatically
    df = spark.read.option("header", "true").option("inferSchema", "true").csv(input_path)

    # 3. Pre-Processing (Filter & Clean)
    # Rolling Window: Keep only reviews from the last 365 days
    df_clean = df.filter(
        (col("publish_time") >= date_sub(current_date(), 365)) &
        (col("review_text").isNotNull()) &
        (col("rating").isNotNull())
    )

    # Clean text: Convert to lowercase and remove punctuation (keep only letters)
    df_clean = df_clean.withColumn("clean_text", lower(col("review_text")))
    df_clean = df_clean.withColumn("clean_text", regexp_replace("clean_text", "[^a-z\\s]", ""))

    # 4. Tokenization (Break sentences into list of words)
    tokenizer = Tokenizer(inputCol="clean_text", outputCol="tokens")
    df_tokenized = tokenizer.transform(df_clean)

    # 5. Stop Word Removal (Remove "the", "is", "at", etc.)
    remover = StopWordsRemover(inputCol="tokens", outputCol="filtered_words")
    df_no_stopwords = remover.transform(df_tokenized)

    # 6. Explode (Transform list of words into separate rows)
    # Row(place_id=A, words=[steak, good]) -> Row(place_id=A, word=steak) ...
    df_exploded = df_no_stopwords.select(
        col("place_id"),
        col("rating"),
        explode(col("filtered_words")).alias("word")
    )

    # Filter out empty strings or very short words
    df_exploded = df_exploded.filter(length(col("word")) > 2)

    # 7. Aggregation (The Core Logic)
    # For each Place + Word combination, calculate Frequency and Avg Rating
    keyword_stats = df_exploded.groupBy("place_id", "word").agg(
        count("*").alias("frequency"),
        avg("rating").alias("avg_sentiment")
    )

    # 8. Significant Filter (Noise Reduction)
    # Only keep keywords that appear at least 3 times for that place
    significant_keywords = keyword_stats.filter(col("frequency") >= 3)

    # 9. Assign Labels (Good vs Bad) based on the Avg Rating
    # If avg rating > 4.0 -> Positive, < 2.5 -> Negative
    final_insights = significant_keywords.withColumn("sentiment_label",
        expr("CASE WHEN avg_sentiment >= 4.0 THEN 'positive' " +
             "WHEN avg_sentiment <= 2.5 THEN 'negative' " +
             "ELSE 'neutral' END")
    )

    # 10. Write Result to S3
    # We use 'overwrite' so the rolling window always replaces old data
    print(f"Writing output to: {output_path}")
    final_insights.write.mode("overwrite").parquet(output_path)

    print("Job completed successfully.")
    spark.stop()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: keyword_extractor.py <s3_input_path> <s3_output_path>")
        sys.exit(1)

    input_s3_path = sys.argv[1]
    output_s3_path = sys.argv[2]

    run_job(input_s3_path, output_s3_path)