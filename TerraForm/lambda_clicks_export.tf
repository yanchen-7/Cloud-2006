############################################
# Lambda: Clicks Exporter (MySQL -> S3 raw/interactions/)
############################################

locals {
  clicks_export_tags = {
    Project     = var.project_name
    Environment = lookup(local.recommender_tags, "Environment", "prod")
    Owner       = lookup(local.recommender_tags, "Owner", "unknown")
  }
}

data "archive_file" "clicks_export_zip" {
  count       = var.enable_clicks_export ? 1 : 0
  type        = "zip"
  output_path = "${path.module}/clicks_export.zip"
  source {
    content  = file("${path.module}/lambda_code/clicks_export/lambda_function.py")
    filename = "lambda_function.py"
  }
}

data "aws_iam_policy_document" "lambda_clicks_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_clicks" {
  count              = var.enable_clicks_export ? 1 : 0
  name               = "${var.project_name}-lambda-clicks-export-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_clicks_assume.json
  tags               = local.clicks_export_tags
}

data "aws_iam_policy_document" "lambda_clicks" {
  statement {
    sid     = "Logs"
    effect  = "Allow"
    actions = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["*"]
  }
  statement {
    sid     = "S3WriteRaw"
    effect  = "Allow"
    actions = ["s3:PutObject", "s3:AbortMultipartUpload", "s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.main.arn, "${aws_s3_bucket.main.arn}/*"]
  }
  statement {
    sid     = "SecretsOptional"
    effect  = "Allow"
    actions = ["secretsmanager:GetSecretValue"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "lambda_clicks" {
  count  = var.enable_clicks_export ? 1 : 0
  name   = "${var.project_name}-lambda-clicks-export"
  policy = data.aws_iam_policy_document.lambda_clicks.json
}

resource "aws_iam_role_policy_attachment" "lambda_clicks_logs" {
  count      = var.enable_clicks_export ? 1 : 0
  role       = aws_iam_role.lambda_clicks[0].name
  policy_arn = aws_iam_policy.lambda_clicks[0].arn
}

resource "aws_iam_role_policy_attachment" "lambda_clicks_vpc" {
  count      = var.enable_clicks_export ? 1 : 0
  role       = aws_iam_role.lambda_clicks[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_security_group" "lambda_clicks_sg" {
  count       = var.enable_clicks_export ? 1 : 0
  name        = "${var.project_name}-lambda-clicks-sg"
  description = "Security group for clicks export Lambda"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.clicks_export_tags
}

# Allow Lambda to reach DB on 3306
resource "aws_security_group_rule" "db_ingress_from_clicks_lambda" {
  count                    = var.enable_clicks_export ? 1 : 0
  type                     = "ingress"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda_clicks_sg[0].id
  security_group_id        = aws_security_group.db_sg.id
}

resource "aws_lambda_function" "clicks_export" {
  count         = var.enable_clicks_export ? 1 : 0
  function_name = "${var.project_name}-clicks-export"
  role          = aws_iam_role.lambda_clicks[0].arn
  handler       = "lambda_function.handler"
  runtime       = "python3.12"
  filename      = data.archive_file.clicks_export_zip[0].output_path
  timeout       = 300
  memory_size   = 512

  vpc_config {
    subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_group_ids = [aws_security_group.lambda_clicks_sg[0].id]
  }

  layers = length(var.clicks_export_pymysql_layer_arn) > 0 ? [var.clicks_export_pymysql_layer_arn] : []

  environment {
    variables = {
      DATA_BUCKET = aws_s3_bucket.main.id
      DB_SECRET_NAME = var.clicks_db_secret_name != "" ? var.clicks_db_secret_name : aws_secretsmanager_secret.dev_db_credentials.name
    }
  }

  tags = local.clicks_export_tags
}

# 00:30 SGT (16:30 UTC): export clicks to S3
resource "aws_scheduler_schedule" "clicks_export_0030sgt" {
  count       = var.enable_clicks_export ? 1 : 0
  name        = "${var.project_name}-clicks-export-0030sgt"
  description = "Export clicks to S3 at 00:30 SGT"

  schedule_expression_timezone = "UTC"
  schedule_expression          = "cron(30 16 * * ? *)"
  flexible_time_window { mode  = "OFF" }

  target {
    arn      = aws_lambda_function.clicks_export[0].arn
    role_arn = aws_iam_role.scheduler_emr_role.arn
    input    = jsonencode({})
  }
}
