output "recommender_emr_cluster_name" {
  value       = aws_emr_cluster.recommender.name
  description = "EMR cluster name for the recommender engine"
}

output "clicks_export_lambda_name" {
  value       = try(aws_lambda_function.clicks_export[0].function_name, null)
  description = "Lambda function name for nightly clicks export"
}

output "recommender_db_table" {
  value       = var.recommender_db_table
  description = "MySQL table the recommender writes into"
}

output "recommender_db_secret_arn" {
  value       = local.recommender_db_secret_arn
  description = "Secrets Manager ARN containing DB credentials for the recommender job"
}
