# --- 14. Serverless Components (SQS, Lambda, API Gateway) ---

# --- SQS Queue for Asynchronous Review Processing ---
resource "aws_sqs_queue" "review_processing_queue" {
  count = var.enable_prod_env ? 1 : 0

  name                      = "${var.project_name}-review-processing-queue"
  delay_seconds             = 0
  message_retention_seconds = 345600 # 4 days
  visibility_timeout_seconds = 60 # Should be >= lambda timeout

  tags = {
    Name = "${var.project_name}-review-queue"
  }
}

# --- IAM Role for the Review Processing Lambda ---
resource "aws_iam_role" "review_processor_lambda_role" {
  count = var.enable_prod_env ? 1 : 0

  name = "${var.project_name}-review-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# Attaches the basic Lambda execution policy (for CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "review_lambda_basic_execution" {
  count = var.enable_prod_env ? 1 : 0

  role       = aws_iam_role.review_processor_lambda_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "review_lambda_vpc_access" {
  count = var.enable_prod_env ? 1 : 0

  role       = aws_iam_role.review_processor_lambda_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Policy to allow the Lambda to read from SQS and use Comprehend for sentiment analysis
resource "aws_iam_policy" "review_lambda_permissions" {
  count = var.enable_prod_env ? 1 : 0

  name   = "${var.project_name}-review-lambda-policy"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
        Resource = aws_sqs_queue.review_processing_queue[0].arn
      },
      {
        Effect   = "Allow",
        Action   = "comprehend:DetectSentiment",
        Resource = "*" # Comprehend actions do not support resource-level permissions
      },
      {
        Effect   = "Allow",
        Action   = ["secretsmanager:GetSecretValue"],
        Resource = aws_secretsmanager_secret.prod_db_credentials[0].arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "review_lambda_permissions_attach" {
  count = var.enable_prod_env ? 1 : 0

  role       = aws_iam_role.review_processor_lambda_role[0].name
  policy_arn = aws_iam_policy.review_lambda_permissions[0].arn
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_code/review_processor"
  output_path = "${path.module}/lambda_code/review_processor.zip"
}

# --- Lambda Function and SQS Trigger ---
# NOTE: This assumes you have a 'lambda_code/sentiment_processor.zip' file.
# You need to create this zip file containing your Lambda handler code.
resource "aws_lambda_function" "review_processor" {
  count = var.enable_prod_env ? 1 : 0

  function_name = "${var.project_name}-review-processor"
  role          = aws_iam_role.review_processor_lambda_role[0].arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.11"
  timeout       = 60

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  # Connect the Lambda to the VPC to access the private RDS instance
  vpc_config {
    subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_group_ids = [aws_security_group.lambda_sg[0].id]
  }

  environment {
    variables = {
      DB_SECRET_NAME = aws_secretsmanager_secret.prod_db_credentials[0].name
      DB_HOST        = aws_db_instance.prod_db[0].address
      DB_NAME        = aws_db_instance.dev_db.db_name
      DB_PORT        = tostring(aws_db_instance.dev_db.port)
    }
  }

  tracing_config {
    mode = "Active"
  }
}

# This creates the trigger that invokes the Lambda function when messages arrive in the SQS queue.
resource "aws_lambda_event_source_mapping" "review_queue_trigger" {
  count = var.enable_prod_env ? 1 : 0

  event_source_arn = aws_sqs_queue.review_processing_queue[0].arn
  function_name    = aws_lambda_function.review_processor[0].arn
  batch_size       = 5 # Process up to 5 reviews at a time
}

# --- API Gateway (HTTP API) ---
# This creates a new HTTP API Gateway that will act as the main entry point.
resource "aws_apigatewayv2_api" "main" {
  count = var.enable_prod_env ? 1 : 0

  name          = "${var.project_name}-http-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_vpc_link" "alb" {
  count = var.enable_prod_env ? 1 : 0

  name               = "${var.project_name}-alb-vpc-link"
  security_group_ids = [aws_security_group.apigw_link_sg.id]
  subnet_ids         = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}

resource "aws_apigatewayv2_integration" "alb_proxy" {
  count = var.enable_prod_env ? 1 : 0

  api_id                 = aws_apigatewayv2_api.main[0].id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = aws_lb_listener.http[0].arn
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.alb[0].id
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "default" {
  count = var.enable_prod_env ? 1 : 0

  api_id    = aws_apigatewayv2_api.main[0].id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.alb_proxy[0].id}"
}

resource "aws_apigatewayv2_stage" "prod" {
  count = var.enable_prod_env ? 1 : 0

  api_id      = aws_apigatewayv2_api.main[0].id
  name        = "$default"
  auto_deploy = true
}
