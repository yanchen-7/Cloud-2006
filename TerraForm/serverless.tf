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

# Policy to allow the Lambda to read from SQS and use Comprehend for sentiment analysis
resource "aws_iam_policy" "review_lambda_sqs_comprehend_policy" {
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
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "review_lambda_sqs_comprehend_attach" {
  count = var.enable_prod_env ? 1 : 0

  role       = aws_iam_role.review_processor_lambda_role[0].name
  policy_arn = aws_iam_policy.review_lambda_sqs_comprehend_policy[0].arn
}

# --- Lambda Function and SQS Trigger ---
# NOTE: This assumes you have a 'lambda_code/sentiment_processor.zip' file.
# You need to create this zip file containing your Lambda handler code.
resource "aws_lambda_function" "review_processor" {
  count = var.enable_prod_env ? 1 : 0

  function_name = "${var.project_name}-review-processor"
  role          = aws_iam_role.review_processor_lambda_role[0].arn
  handler       = "index.handler" # Assumes 'index.js' with an exported 'handler' function
  runtime       = "nodejs18.x"
  timeout       = 30

  filename         = "lambda_code/sentiment_processor.zip" # Placeholder path
  source_code_hash = filebase64sha256("lambda_code/sentiment_processor.zip")

  environment {
    variables = {
      # Add any environment variables your lambda needs, e.g., DB connection details
      # DB_SECRET_NAME = aws_secretsmanager_secret.prod_db_credentials[0].name
    }
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
  target        = aws_lb.main[0].arn # Default route forwards to the ALB
}