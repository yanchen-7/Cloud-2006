# --- 10. S3 Bucket ---
resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket" "main" {
  # Bucket names must be globally unique, so we add a random suffix.
  bucket = "${var.project_name}-bucket-${random_string.bucket_suffix.result}"

  tags = {
    Name    = "${var.project_name}-storage"
    Project = var.project_name
  }
}