# --- 13. CloudWatch Monitoring (Production) ---

# A log group for the production application logs.
# Your application on the EC2 instances should be configured to send logs here.
resource "aws_cloudwatch_log_group" "prod_app_logs" {
  count = var.enable_prod_env ? 1 : 0

  name              = "/${var.project_name}/prod/app"
  retention_in_days = 30 # Keep logs for 30 days

  tags = {
    Name = "${var.project_name}-prod-app-logs"
  }
}

# A CloudWatch alarm that triggers if the average CPU utilization of the ASG is too high.
resource "aws_cloudwatch_metric_alarm" "prod_high_cpu" {
  count = var.enable_prod_env ? 1 : 0

  alarm_name          = "${var.project_name}-prod-high-cpu"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "120" # 2 minutes
  statistic           = "Average"
  threshold           = "80" # 80%
  alarm_description   = "This alarm triggers if the average CPU utilization of the production ASG exceeds 80% for 4 minutes."

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.main[0].name
  }
}