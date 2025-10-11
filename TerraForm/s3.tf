# --- 10. S3 Bucket ---
resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket" "log_bucket" {
  bucket = "${var.project_name}-log-bucket-${random_string.bucket_suffix.result}"
}

resource "aws_s3_bucket" "main" {
  # Bucket names must be globally unique, so we add a random suffix.
  bucket = "${var.project_name}-bucket-${random_string.bucket_suffix.result}"

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name    = "${var.project_name}-storage"
    Project = var.project_name
  }
}

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_logging" "main" {
  bucket = aws_s3_bucket.main.id

  target_bucket = aws_s3_bucket.log_bucket.id
  target_prefix = "log/"
}