output "dev_instance_public_ip" {
  description = "Static Public IP address (Elastic IP) of the development EC2 instance."
  value       = aws_eip.dev_eip.public_ip
}

output "prod_load_balancer_dns" {
  description = "DNS name of the production Application Load Balancer."
  value       = var.enable_prod_env ? aws_lb.main[0].dns_name : "Production environment (ALB/ASG) is not enabled."
}

output "prod_api_gateway_url" {
  description = "The invocation URL for the production HTTP API Gateway."
  value       = var.enable_prod_env ? aws_apigatewayv2_api.main[0].api_endpoint : "Production API Gateway is not enabled."
}

output "dev_rds_details" {
  description = "Connection details for the Development RDS database."
  value = {
    endpoint = aws_db_instance.dev_db.endpoint
    address  = aws_db_instance.dev_db.address
    port     = aws_db_instance.dev_db.port
    username = aws_db_instance.dev_db.username
    db_name  = aws_db_instance.dev_db.db_name
  }
  sensitive = true
}

output "prod_rds_details" {
  description = "Connection details for the Production RDS database."
  value = var.enable_prod_env ? {
    endpoint = aws_db_instance.prod_db[0].endpoint
    address  = aws_db_instance.prod_db[0].address
    port     = aws_db_instance.prod_db[0].port
    username = aws_db_instance.dev_db.username
    db_name  = "Databases are inherited from the snapshot (e.g., '${aws_db_instance.dev_db.db_name}')"
    secret_name = aws_secretsmanager_secret.prod_db_credentials[0].name
  } : {
    endpoint = "Production RDS is not enabled."
  }
  sensitive = true
}

output "prod_cache_details" {
  description = "Connection details for the Production ElastiCache for Redis cluster."
  value = var.enable_prod_env ? {
    endpoint = aws_elasticache_cluster.prod_cache[0].cache_nodes[0].address
    port     = aws_elasticache_cluster.prod_cache[0].cache_nodes[0].port
  } : {
    endpoint = "Production Cache is not enabled."
  }
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

# --- Outputs for CloudFront URLs ---
output "cloudfront_prod_url" {
  description = "The URL for the production CloudFront distribution."
  value       = var.enable_prod_env ? "https://${aws_cloudfront_distribution.prod_distribution[0].domain_name}" : "Production environment is disabled."
}

output "cloudfront_dev_url" {
  description = "The URL for the development CloudFront distribution."
  value       = "https://${aws_cloudfront_distribution.dev_distribution.domain_name}"
}