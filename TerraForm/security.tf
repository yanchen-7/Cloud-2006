# ======================================
# 4. SECURITY GROUPS
# ======================================

# -----------------------------
# Production: Web (App) Security Group
# -----------------------------
resource "aws_security_group" "web_sg" {
  name        = "${var.project_name}-web-sg"
  description = "Allow HTTP, HTTPS, SSH, and MySQL inbound traffic"
  vpc_id      = aws_vpc.main.id

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ALB → Web instances (HTTP)
resource "aws_security_group_rule" "web_ingress_from_alb_http" {
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb_sg.id
  security_group_id        = aws_security_group.web_sg.id
}


# -----------------------------
# Production: Application Load Balancer (ALB)
# -----------------------------
resource "aws_security_group" "alb_sg" {
  name        = "${var.project_name}-alb-sg"
  description = "Allow inbound HTTP/HTTPS from Internet"
  vpc_id      = aws_vpc.main.id

  # Outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ALB HTTP
resource "aws_security_group_rule" "alb_ingress_http" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb_sg.id
}

# ALB HTTPS
resource "aws_security_group_rule" "alb_ingress_https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb_sg.id
}


# -----------------------------
# Production: RDS Database
# -----------------------------
resource "aws_security_group" "db_sg" {
  name        = "${var.project_name}-db-sg"
  description = "Allow access from Web Security Group"
  vpc_id      = aws_vpc.main.id
}

# Web → DB
resource "aws_security_group_rule" "db_ingress_from_web" {
  type                     = "ingress"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.db_sg.id
}

# Web (Staging Instance) -> DB
resource "aws_security_group_rule" "db_ingress_from_staging" {
  count = var.enable_prod_env ? 1 : 0

  type                     = "ingress"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.prod_staging_sg[0].id
  security_group_id        = aws_security_group.db_sg.id
}

# Lambda → DB
resource "aws_security_group_rule" "db_ingress_from_lambda" {
  count = var.enable_prod_env ? 1 : 0

  type                     = "ingress"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda_sg[0].id
  security_group_id        = aws_security_group.db_sg.id
}

# EMR → DB
resource "aws_security_group_rule" "db_ingress_from_emr" {
  # Removed due to duplicate existing rule; uncomment if you need Terraform to manage it explicitly.
  count = 0

  type                     = "ingress"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.emr_recommender_sg.id
  security_group_id        = aws_security_group.db_sg.id
}

# -----------------------------
# Recommender EMR cluster
# -----------------------------
resource "aws_security_group" "emr_recommender_sg" {
  name        = "${var.project_name}-emr-recommender-sg"
  description = "Security group for the recommender EMR cluster"
  vpc_id      = aws_vpc.main.id

  # Allow intra-cluster traffic
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}


# -----------------------------
# Production: Lambda
# -----------------------------
resource "aws_security_group" "lambda_sg" {
  count = var.enable_prod_env ? 1 : 0

  name        = "${var.project_name}-lambda-sg"
  description = "Security group for Lambda functions"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}


# -----------------------------
# Production: ElastiCache (Redis)
# -----------------------------
resource "aws_security_group" "cache_sg" {
  count = var.enable_prod_env ? 1 : 0

  name        = "${var.project_name}-cache-sg"
  description = "Allow access from the Web Security Group to Redis"
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group_rule" "cache_ingress_from_web" {
  count                    = var.enable_prod_env ? 1 : 0
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.cache_sg[0].id
}


# -----------------------------
# Production: Interface Endpoints
# -----------------------------
resource "aws_security_group" "endpoint_sg" {
  name        = "${var.project_name}-endpoint-sg"
  description = "Allow HTTPS traffic for VPC endpoints"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Web → Endpoint
resource "aws_security_group_rule" "endpoint_ingress_from_web" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.endpoint_sg.id
}

# Lambda → Endpoint
resource "aws_security_group_rule" "endpoint_ingress_from_lambda" {
  count                    = var.enable_prod_env ? 1 : 0
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda_sg[0].id
  security_group_id        = aws_security_group.endpoint_sg.id
}


# -----------------------------
# Production: API Gateway VPC Link
# -----------------------------
resource "aws_security_group" "apigw_link_sg" {
  name        = "${var.project_name}-apigw-link-sg"
  description = "Used by API Gateway VPC Link ENIs"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
}

# -----------------------------
# Production: Staging EC2 Instance
# -----------------------------
resource "aws_security_group" "prod_staging_sg" {
  count = var.enable_prod_env ? 1 : 0

  name        = "${var.project_name}-prod-staging-sg"
  description = "Allow SSH and HTTP for the standalone production staging instance"
  vpc_id      = aws_vpc.main.id

  # Ingress for SSH. WARNING: 0.0.0.0/0 is open to the world.
  # For better security, replace this with your own IP address: ["YOUR_IP/32"]
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow SSH access"
  }

  # Ingress for HTTP, useful for health checks or direct testing.
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTP access"
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
