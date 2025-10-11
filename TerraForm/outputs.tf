output "dev_instance_public_ip" {
  description = "Static Public IP address (Elastic IP) of the development EC2 instance."
  value       = aws_eip.dev_eip.public_ip
}

output "prod_load_balancer_dns" {
  description = "DNS name of the production Application Load Balancer."
  value       = var.enable_prod_env ? aws_lb.main[0].dns_name : "Production environment (ALB/ASG) is not enabled."
}

output "dev_rds_details" {
  description = "Connection details for the Development RDS database."
  value = {
    endpoint = aws_db_instance.main.endpoint
    address  = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    username = aws_db_instance.main.username
    db_name  = aws_db_instance.main.db_name
  }
  sensitive = true
}

output "prod_rds_details" {
  description = "Connection details for the Production RDS database."
  value = var.enable_prod_env ? {
    endpoint = aws_db_instance.prod_db[0].endpoint
    address  = aws_db_instance.prod_db[0].address
    port     = aws_db_instance.prod_db[0].port
    # The username is inherited from the snapshot.
    username = aws_db_instance.main.username
    # The database name(s) are also inherited from the snapshot.
    # The `db_name` attribute is not available on snapshot-restored instances.
    db_name = "Databases are inherited from the snapshot (e.g., '${aws_db_instance.main.db_name}')"
  } : {
    endpoint = "Production RDS is not enabled."
  }
  sensitive = true
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