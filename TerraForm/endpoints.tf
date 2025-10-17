# --- VPC Endpoints ---
# These endpoints allow resources within the VPC to communicate with AWS services
# without traversing the public internet, enhancing security and reducing costs.

# --- Gateway Endpoint for S3 ---
# Gateway endpoints are free and are used for S3 and DynamoDB.
resource "aws_vpc_endpoint" "s3" {
  count = lookup(var.enabled_endpoints, "s3", false) ? 1 : 0

  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.s3"
  route_table_ids = [
    aws_route_table.public.id,
    aws_route_table.private.id,
  ]

  tags = {
    Name = "${var.project_name}-s3-endpoint"
  }
}

# --- Interface Endpoints for Production Lambda ---
# These are required for the Lambda function to access services from within the VPC.

resource "aws_vpc_endpoint" "sqs" {
  count = var.enable_prod_env && lookup(var.enabled_endpoints, "sqs", false) ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.sqs"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]
}

resource "aws_vpc_endpoint" "comprehend" {
  count = var.enable_prod_env && lookup(var.enabled_endpoints, "comprehend", false) ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.comprehend"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]
}

resource "aws_vpc_endpoint" "secrets_manager" {
  count = lookup(var.enabled_endpoints, "secrets_manager", false) ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]

  tags = {
    Name = "${var.project_name}-secretsmanager-endpoint"
  }
}

resource "aws_vpc_endpoint" "logs" {
  count = lookup(var.enabled_endpoints, "logs", false) ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]

  tags = {
    Name = "${var.project_name}-logs-endpoint"
  }
}

resource "aws_vpc_endpoint" "ec2" {
  count = lookup(var.enabled_endpoints, "ec2", false) ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ec2"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]

  tags = {
    Name = "${var.project_name}-ec2-endpoint"
  }
}

resource "aws_vpc_endpoint" "sts" {
  count = lookup(var.enabled_endpoints, "sts", false) ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.sts"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]

  tags = {
    Name = "${var.project_name}-sts-endpoint"
  }
}

resource "aws_vpc_endpoint" "ssm" {
  count = lookup(var.enabled_endpoints, "ssm", false) ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ssm"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]

  tags = {
    Name = "${var.project_name}-ssm-endpoint"
  }
}

resource "aws_vpc_endpoint" "ssmmessages" {
  count = lookup(var.enabled_endpoints, "ssm", false) ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ssmmessages"
  vpc_endpoint_type   = "Interface"

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]

  tags = {
    Name = "${var.project_name}-ssmmessages-endpoint"
  }
}

resource "aws_vpc_endpoint" "ec2messages" {
  count = lookup(var.enabled_endpoints, "ssm", false) ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ec2messages"
  vpc_endpoint_type   = "Interface"

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]

  tags = {
    Name = "${var.project_name}-ec2messages-endpoint"
  }
}

resource "aws_vpc_endpoint" "xray" {
  vpc_id              = aws_vpc.main.id
  count               = var.enable_prod_env && lookup(var.enabled_endpoints, "xray", false) ? 1 : 0
  service_name        = "com.amazonaws.${var.aws_region}.xray"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
  security_group_ids = [aws_security_group.endpoint_sg.id]

  tags = {
    Name = "${var.project_name}-xray-endpoint"
  }
}

# --- VPC Endpoints for Dev VPC ---

resource "aws_security_group" "dev_endpoint_sg" {
  name        = "${var.project_name}-dev-endpoints-sg"
  description = "Allow HTTPS from internal resources to VPC Endpoints in Dev"
  vpc_id      = aws_vpc.dev.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.dev.cidr_block] # Allow from anywhere within the dev VPC
  }
}

resource "aws_vpc_endpoint" "dev_s3" {
  count = lookup(var.enabled_endpoints, "s3", false) ? 1 : 0

  vpc_id       = aws_vpc.dev.id
  service_name = "com.amazonaws.${var.aws_region}.s3"
  route_table_ids = [
    aws_route_table.dev_public_rt.id,
    aws_route_table.dev_private_rt.id,
  ]

  tags = {
    Name = "${var.project_name}-dev-s3-endpoint"
  }
}

resource "aws_vpc_endpoint" "dev_ec2" {
  count = lookup(var.enabled_endpoints, "ec2", false) ? 1 : 0

  vpc_id              = aws_vpc.dev.id
  service_name        = "com.amazonaws.${var.aws_region}.ec2"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.dev_private_a.id,
    aws_subnet.dev_private_b.id
  ]
  security_group_ids = [aws_security_group.dev_endpoint_sg.id]
}

resource "aws_vpc_endpoint" "dev_sts" {
  count = lookup(var.enabled_endpoints, "sts", false) ? 1 : 0

  vpc_id              = aws_vpc.dev.id
  service_name        = "com.amazonaws.${var.aws_region}.sts"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids = [
    aws_subnet.dev_private_a.id,
    aws_subnet.dev_private_b.id
  ]
  security_group_ids = [aws_security_group.dev_endpoint_sg.id]
}
