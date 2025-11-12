output "recommender_emr_cluster_name" {
  value       = aws_emr_cluster.recommender.name
  description = "EMR cluster name for the recommender engine"
}

output "recommender_script_s3_path" {
  value       = "s3://${local.data_bucket_name}/${local.s3_prefix_jobs}poi_recommender.py"
  description = "S3 path of the PySpark recommender job"
}

output "recommendations_s3_prefix" {
  value       = "s3://${local.data_bucket_name}/${local.s3_prefix_recommendations}"
  description = "S3 prefix for generated recommendations (Parquet)"
}

output "recommender_athena_db" {
  value       = aws_athena_database.recommender.name
  description = "Athena database name for recommendations"
}

output "recommender_athena_table" {
  value       = aws_glue_catalog_table.recommendations.name
  description = "Glue/Athena table name for recommendations"
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
