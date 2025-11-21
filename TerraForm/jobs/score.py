# score.py
import sys
from pyspark.sql import SparkSession
from pyspark.ml import PipelineModel
from pyspark.sql.functions import col, udf, current_timestamp, lit
from pyspark.sql.types import FloatType
from pyspark.ml.feature import IndexToString
from pyspark.sql.utils import AnalysisException

# -------------------------------------------------------------------------
# 0. Input path from EMR controller
# -------------------------------------------------------------------------
# Expect: sys.argv[1] = s3://cloud-2006-bucket-vf6xtl9u/new-data/YYYY-MM-DD/
if len(sys.argv) > 1:
    INPUT_PATH = sys.argv[1]
else:
    # Fallback for manual testing (reads ALL new-data/*)
    INPUT_PATH = "s3://cloud-2006-bucket-vf6xtl9u/new-data/"
    print(" No input path argument provided; defaulting to all new-data/*")

print(f" Scoring reviews from: {INPUT_PATH}")

# -------------------------------------------------------------------------
# 1. Spark session
# -------------------------------------------------------------------------
spark = (
    SparkSession.builder
        .appName("TourismBatchScoring")
        .config("spark.sql.sources.partitionOverwriteMode", "dynamic")
        .getOrCreate()
)

BUCKET_NAME = "cloud-2006-bucket-vf6xtl9u"
MODEL_PATH = f"s3://{BUCKET_NAME}/models/sentiment_v1/"
OUTPUT_PATH = f"s3://{BUCKET_NAME}/outputs/daily_scores/"

# -------------------------------------------------------------------------
# 2. Load model
# -------------------------------------------------------------------------
print(f"Loading model from {MODEL_PATH}...")
loaded_model = PipelineModel.load(MODEL_PATH)

# Stage 0 should be the StringIndexer from training
indexer_model = loaded_model.stages[0]
labels = [x.lower() for x in indexer_model.labels]
print(f"Detected labels from model: {labels}")

try:
    POS_INDEX = labels.index("positive")
    print(f"'positive' probability index: {POS_INDEX}")
except ValueError:
    raise RuntimeError(f"'positive' not found in model labels: {labels}")

# -------------------------------------------------------------------------
# 3. Read new reviews from S3 (only that date folder)
# -------------------------------------------------------------------------
try:
    new_reviews = spark.read.json(INPUT_PATH)
except AnalysisException as e:
    print(f"[WARN] Failed to read JSON at {INPUT_PATH}: {e}")
    print("No data to score. Exiting gracefully.")
    spark.stop()
    sys.exit(0)

if "review_text" not in new_reviews.columns:
    print(f"[WARN] 'review_text' column missing in data at {INPUT_PATH}. Columns: {new_reviews.columns}")
    print("No data to score. Exiting gracefully.")
    spark.stop()
    sys.exit(0)

if new_reviews.rdd.isEmpty():
    print(f"[INFO] No rows found at {INPUT_PATH}. Nothing to score.")
    spark.stop()
    sys.exit(0)

# Add dummy label so StringIndexer has an input column
new_reviews = new_reviews.withColumn("sentiment_label", lit("neutral"))

# -------------------------------------------------------------------------
# 4. Predict
# -------------------------------------------------------------------------
predictions = loaded_model.transform(new_reviews)

# Convert numeric prediction to original label string
label_converter = IndexToString(
    inputCol="prediction",
    outputCol="predicted_label",
    labels=indexer_model.labels
)
predictions = label_converter.transform(predictions)

# Extract probability of "positive" class from the probability vector
get_pos_prob = udf(lambda v: float(v[POS_INDEX]), FloatType())

scored_df = (
    predictions
        .withColumn("ai_score", get_pos_prob(col("probability")))
        .withColumn("processed_date", current_timestamp())
)

# Keep only the useful columns
final_output = scored_df.select(
    "location_id",
    "review_id",
    "predicted_label",
    "ai_score",
    "processed_date"
)

# -------------------------------------------------------------------------
# 5. Save results
# -------------------------------------------------------------------------
print(f"Writing scored reviews to {OUTPUT_PATH}...")
count = final_output.count()
final_output.write.mode("append").parquet(OUTPUT_PATH)

print(f" Scoring complete. Scored {count} reviews.")
spark.stop()
