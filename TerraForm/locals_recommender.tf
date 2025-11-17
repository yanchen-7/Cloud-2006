locals {
  recommender_tags = {
    Project     = var.project_name
    Environment = var.recommender_environment
    Owner       = var.recommender_owner
  }

  # Use the existing main data bucket and log bucket
  data_bucket_name = aws_s3_bucket.main.bucket
  log_bucket_name  = aws_s3_bucket.log_bucket.bucket

  # S3 prefixes for data lake extensions
  s3_prefix_raw            = "raw/"
  s3_prefix_curated        = "curated/"
  s3_prefix_recommendations= "curated/recommendations/"
  s3_prefix_jobs           = "jobs/"

  recommender_db_secret_arn = var.enable_prod_env ? aws_secretsmanager_secret.prod_db_credentials[0].arn : aws_secretsmanager_secret.dev_db_credentials.arn
}
