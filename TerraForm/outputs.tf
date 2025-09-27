output "dev_instance_public_ip" {
  description = "Static Public IP address (Elastic IP) of the development EC2 instance."
  value       = aws_eip.dev_eip.public_ip
}

output "prod_load_balancer_dns" {
  description = "DNS name of the production Application Load Balancer."
  value       = aws_lb.main.dns_name
}

output "rds_database_endpoint" {
  description = "Endpoint of the RDS database instance."
  value       = aws_db_instance.main.endpoint
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket."
  value       = aws_s3_bucket.main.id
}

output "key_pair_name" {
  description = "Name of the created EC2 key pair."
  value       = aws_key_pair.key_pair.key_name
}

output "private_key_filename" {
  description = "The private key is saved to this file. Keep it secure."
  value       = local_file.private_key_pem.filename
}