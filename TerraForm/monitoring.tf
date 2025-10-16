# --- 13. CloudWatch Dashboard ---

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-Dashboard"

  # The dashboard_body is a JSON object that defines the layout and widgets.
  dashboard_body = jsonencode({
    widgets = [
      # --- Production Health Overview ---
      {
        type   = "text",
        x      = 0,
        y      = 0,
        width  = 24,
        height = 1,
        properties = {
          markdown = "# Production Environment Health"
        }
      },
      {
        type   = "metric",
        x      = 0,
        y      = 1,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.main[0].arn_suffix, "LoadBalancer", aws_lb.main[0].arn_suffix],
            ["AWS/ApplicationELB", "UnHealthyHostCount", "TargetGroup", aws_lb_target_group.main[0].arn_suffix, "LoadBalancer", aws_lb.main[0].arn_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.main[0].arn_suffix, { "stat": "Sum" }],
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main[0].arn_suffix, { "stat": "Sum", "yAxis": "right" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "LoadBalancer", aws_lb.main[0].arn_suffix, { "stat": "Sum" }]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "ALB: Healthy Hosts & 5XX Errors"
        }
      },
      {
        type   = "metric",
        x      = 12,
        y      = 1,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main[0].arn_suffix, { "stat": "Average" }]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "ALB: Average Response Time"
        }
      },

      # --- Production Compute & Database ---
      {
        type   = "metric",
        x      = 0,
        y      = 7,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", aws_autoscaling_group.main[0].name],
            ["CWAgent", "mem_used_percent", "Environment", "prod", "AutoScalingGroupName", aws_autoscaling_group.main[0].name]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "PROD ASG: CPU & Memory"
        }
      },
      {
        type   = "metric",
        x      = 0,
        y      = 13,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["CWAgent", "disk_used_percent", "Environment", "prod", "path", "/", "AutoScalingGroupName", aws_autoscaling_group.main[0].name],
            ["AWS/EC2", "NetworkIn", "AutoScalingGroupName", aws_autoscaling_group.main[0].name, { "yAxis": "right" }],
            [".", "NetworkOut", ".", ".", { "yAxis": "right" }],
            [".", "StatusCheckFailed", ".", "."]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "PROD ASG: Disk, Network & Health"
        }
      },
      {
        type   = "metric",
        x      = 12,
        y      = 7,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.prod_db[0].identifier],
            [".", "DatabaseConnections", ".", ".", { "yAxis": "right" }],
            [".", "FreeableMemory", ".", "."]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "PROD RDS: CPU, Connections & Memory"
        }
      },
      {
        type   = "metric",
        x      = 12,
        y      = 13,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["AWS/RDS", "ReadLatency", "DBInstanceIdentifier", aws_db_instance.prod_db[0].identifier],
            [".", "WriteLatency", ".", "."],
            [".", "ReadIOPS", ".", ".", { "yAxis": "right" }],
            [".", "WriteIOPS", ".", ".", { "yAxis": "right" }]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "PROD RDS: Latency & IOPS"
        }
      },

      # --- S3 Storage ---
      {
        type   = "text",
        x      = 0,
        y      = 19,
        width  = 24,
        height = 1,
        properties = {
          markdown = "# S3 Storage Health"
        }
      },
      {
        type   = "metric",
        x      = 0,
        y      = 20,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["AWS/S3", "BucketSizeBytes", "BucketName", aws_s3_bucket.main.id, "StorageType", "StandardStorage"],
            [".", "NumberOfObjects", ".", ".", "StorageType", "AllStorageTypes", { "yAxis": "right" }]
          ],
          view   = "timeSeries",
          region = var.aws_region,
          title  = "S3 Bucket: Size & Object Count (Last 7 Days)",
          start  = "-P1W",
          period = 86400
        }
      },

      # --- Development Environment ---
      {
        type   = "text",
        x      = 0,
        y      = 26,
        width  = 24,
        height = 1,
        properties = {
          markdown = "# Development Environment Health"
        }
      },
      {
        type   = "metric",
        x      = 0,
        y      = 27,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.web_server_dev.id],
            ["CWAgent", "mem_used_percent", "Environment", "dev", "InstanceId", aws_instance.web_server_dev.id]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "DEV EC2: CPU & Memory Usage (%)"
        }
      },
      {
        type   = "metric",
        x      = 0,
        y      = 33,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["CWAgent", "disk_used_percent", "Environment", "dev", "path", "/", "InstanceId", aws_instance.web_server_dev.id],
            ["AWS/EC2", "NetworkIn", "InstanceId", aws_instance.web_server_dev.id, { "yAxis": "right" }],
            [".", "NetworkOut", ".", ".", { "yAxis": "right" }],
            [".", "StatusCheckFailed", ".", "."]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "DEV EC2: Disk, Network & Health"
        }
      },
      {
        type   = "metric",
        x      = 12,
        y      = 27,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.dev_db.identifier],
            [".", "DatabaseConnections", ".", ".", { "yAxis": "right" }],
            [".", "FreeableMemory", ".", "."]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "DEV RDS: CPU, Connections & Memory"
        }
      },
      {
        type   = "metric",
        x      = 12,
        y      = 33,
        width  = 12,
        height = 6,
        properties = {
          metrics = [
            ["AWS/RDS", "ReadLatency", "DBInstanceIdentifier", aws_db_instance.dev_db.identifier],
            [".", "WriteLatency", ".", "."],
            [".", "ReadIOPS", ".", ".", { "yAxis": "right" }],
            [".", "WriteIOPS", ".", ".", { "yAxis": "right" }]
          ],
          view    = "timeSeries",
          stacked = false,
          region  = var.aws_region,
          title   = "DEV RDS: Latency & IOPS"
        }
      }
    ]
  })
}

# --- 14. CloudWatch Alarms ---

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

# Alarm for high CPU on the production Auto Scaling Group
resource "aws_cloudwatch_metric_alarm" "prod_asg_high_cpu" {
  count = var.enable_prod_env ? 1 : 0

  alarm_name          = "${var.project_name}-prod-asg-high-cpu"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "300" # 5 minutes
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This alarm fires when the average CPU utilization of the production ASG is >= 80% for 10 minutes."
  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.main[0].name
  }
}

# Alarm for 5XX errors on the Application Load Balancer
resource "aws_cloudwatch_metric_alarm" "prod_alb_5xx_errors" {
  count = var.enable_prod_env ? 1 : 0

  alarm_name          = "${var.project_name}-prod-alb-5xx-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "60" # 1 minute
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "This alarm fires when there are 5 or more 5XX errors in a 1-minute period."
  dimensions = {
    LoadBalancer = aws_lb.main[0].arn_suffix
  }
}

# Alarm for unhealthy hosts in the production target group
resource "aws_cloudwatch_metric_alarm" "prod_tg_unhealthy_hosts" {
  count = var.enable_prod_env ? 1 : 0

  alarm_name          = "${var.project_name}-prod-tg-unhealthy-hosts"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "2"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "60" # 1 minute
  statistic           = "Maximum"
  threshold           = "1"
  alarm_description   = "This alarm fires when there is at least one unhealthy host for 2 consecutive minutes."
  dimensions = {
    TargetGroup  = aws_lb_target_group.main[0].arn_suffix
    LoadBalancer = aws_lb.main[0].arn_suffix
  }
}

# Alarm for high CPU on the production RDS instance
resource "aws_cloudwatch_metric_alarm" "prod_rds_high_cpu" {
  count = var.enable_prod_env ? 1 : 0

  alarm_name          = "${var.project_name}-prod-rds-high-cpu"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "3"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300" # 5 minutes
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This alarm fires when the production RDS CPU is >= 80% for 15 minutes."
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.prod_db[0].identifier
  }
}