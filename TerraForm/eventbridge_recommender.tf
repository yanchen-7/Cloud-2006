############################################
# EventBridge Scheduler to run daily EMR step at 1 AM SGT (17:00 UTC)
############################################

resource "aws_scheduler_schedule" "recommender_daily" {
  name        = "${var.project_name}-recommender-daily"
  description = "Daily recommender Spark job on EMR at 01:00 SGT"

  schedule_expression_timezone = "UTC"
  schedule_expression          = "cron(0 ${var.recommender_step_hour_utc} * * ? *)"
  flexible_time_window { mode  = "OFF" }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:emr:addJobFlowSteps"
    role_arn = aws_iam_role.scheduler_emr_role.arn
    input    = jsonencode({
      JobFlowId = aws_emr_cluster.recommender.id,
      Steps     = [
        {
          Name = "poi-recommender-spark",
          ActionOnFailure = "CONTINUE",
          HadoopJarStep = {
            Jar  = "command-runner.jar",
            Args = [
              "spark-submit",
              "s3://${local.data_bucket_name}/${local.s3_prefix_jobs}poi_recommender.py",
              "--raw",        "s3://${local.data_bucket_name}/${local.s3_prefix_raw}",
              "--poi",        "s3://${local.data_bucket_name}/${local.s3_prefix_raw}poi/",
              "--output",     "s3://${local.data_bucket_name}/${local.s3_prefix_recommendations}",
              "--topn",       "20",
              "--db-secret-arn", local.recommender_db_secret_arn,
              "--db-table",   var.recommender_db_table
            ]
          }
        }
      ]
    })
  }

  
}
