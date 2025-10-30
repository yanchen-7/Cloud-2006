# Extend the existing main bucket with lifecycle for logs and placeholders for prefixes

resource "aws_s3_bucket_lifecycle_configuration" "main_recommender" {
  bucket = aws_s3_bucket.main.id

  rule {
    id     = "expire-logs-30-days"
    status = "Enabled"
    filter { prefix = "log/" }
    expiration { days = 30 }
  }
}

# Placeholders to ensure prefixes exist (optional)
resource "aws_s3_object" "prefix_raw" {
  bucket = aws_s3_bucket.main.id
  key    = local.s3_prefix_raw
  content= ""
}

resource "aws_s3_object" "prefix_curated" {
  bucket = aws_s3_bucket.main.id
  key    = local.s3_prefix_curated
  content= ""
}

resource "aws_s3_object" "prefix_recs" {
  bucket = aws_s3_bucket.main.id
  key    = local.s3_prefix_recommendations
  content= ""
}

resource "aws_s3_object" "prefix_athena_results" {
  bucket = aws_s3_bucket.main.id
  key    = local.s3_prefix_athena_results
  content= ""
}

