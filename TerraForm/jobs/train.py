from pyspark.sql import SparkSession
from pyspark.ml import Pipeline
from pyspark.ml.feature import Tokenizer, HashingTF, IDF, StringIndexer
from pyspark.ml.classification import NaiveBayes
from pyspark.sql.functions import lower, col

spark = SparkSession.builder.appName("TourismModelTrainer").getOrCreate()

BUCKET_NAME = "cloud-2006-bucket-vf6xtl9u"
HISTORICAL_PATH = f"s3://{BUCKET_NAME}/historical-data/"
MODEL_OUTPUT_PATH = f"s3://{BUCKET_NAME}/models/sentiment_v1/"

# 1. Load Data
df = spark.read.option("header", "true").csv(HISTORICAL_PATH)

# 2. Clean Labels (Normalize to lowercase to avoid "Positive" vs "positive")
df = df.withColumn("sentiment_label", lower(col("sentiment_label")))

# 3. Define Pipeline Stages
# Stage 0: Convert text label to number (Indices will be saved in the model)
indexer = StringIndexer(inputCol="sentiment_label", outputCol="label")

# Stage 1-3: NLP Features
tokenizer = Tokenizer(inputCol="review_text", outputCol="words")
hashingTF = HashingTF(inputCol="words", outputCol="rawFeatures", numFeatures=10000)
idf = IDF(inputCol="rawFeatures", outputCol="features")

# Stage 4: Classifier
nb = NaiveBayes(featuresCol="features", labelCol="label")

# 4. Create and Fit Pipeline
# IMPORTANT: We include 'indexer' here so 'score.py' can retrieve the label list later
pipeline = Pipeline(stages=[indexer, tokenizer, hashingTF, idf, nb])

print("Training model...")
model = pipeline.fit(df)

# 5. Save
model.write().overwrite().save(MODEL_OUTPUT_PATH)

print(f"Model saved to {MODEL_OUTPUT_PATH}")

spark.stop()
