variable "aws_region" {
  description = "The AWS region to deploy to"
  default     = "us-east-1"
}

variable "key_pair_name" {
  description = "The name of the pre-existing AWS Key Pair for SSH access"
  type        = string
}

variable "s3_bucket_name" {
  description = "A globally unique name for the S3 bucket"
  type        = string
}