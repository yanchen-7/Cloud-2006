# --- 5. Key Pair ---
# This will create a new key pair and save the private key to a file named 'cloud-2006-key.pem'
resource "tls_private_key" "pk" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "key_pair" {
  key_name   = "${var.project_name}-key"
  public_key = tls_private_key.pk.public_key_openssh
}

resource "local_file" "private_key_pem" {
  content         = tls_private_key.pk.private_key_pem
  filename        = "${var.project_name}-key.pem"
  file_permission = "0400" # Read-only for user
}

# --- 6. IAM Role for EC2 to access S3 ---
resource "aws_iam_role" "ec2_s3_role" {
  name = "ec2-s3-access-role-cloud-2006"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# --- IAM Policy to allow sending messages to the SQS queue ---
data "aws_iam_policy_document" "send_to_review_queue_policy_doc" {
  count = var.enable_prod_env ? 1 : 0

  statement {
    actions = [
      "sqs:SendMessage"
    ]
    resources = [
      aws_sqs_queue.review_processing_queue[0].arn
    ]
  }
}

resource "aws_iam_policy" "send_to_review_queue_policy" {
  count  = var.enable_prod_env ? 1 : 0
  name   = "${var.project_name}-send-to-review-queue-policy"
  policy = data.aws_iam_policy_document.send_to_review_queue_policy_doc[0].json
}
# --- IAM Policy to allow reading the production DB secret ---
data "aws_iam_policy_document" "read_prod_db_secret_policy_doc" {
  count = var.enable_prod_env ? 1 : 0

  statement {
    actions = [
      "secretsmanager:GetSecretValue"
    ]
    resources = [
      aws_secretsmanager_secret.prod_db_credentials[0].arn
    ]
  }
}

resource "aws_iam_policy" "read_prod_db_secret_policy" {
  count  = var.enable_prod_env ? 1 : 0
  name   = "${var.project_name}-read-prod-db-secret-policy"
  policy = data.aws_iam_policy_document.read_prod_db_secret_policy_doc[0].json
}
resource "aws_iam_role_policy_attachment" "s3_policy_attach" {
  role       = aws_iam_role.ec2_s3_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess" # For simplicity. Can be restricted.
}

# This attaches the AWS-managed policy that allows the EC2 instance to send
# metrics and logs to CloudWatch.
resource "aws_iam_role_policy_attachment" "cloudwatch_agent_policy_attach" {
  role       = aws_iam_role.ec2_s3_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy_attachment" "ssm_core_policy_attach" {
  role       = aws_iam_role.ec2_s3_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "read_prod_db_secret_attach" {
  count      = var.enable_prod_env ? 1 : 0
  role       = aws_iam_role.ec2_s3_role.name
  policy_arn = aws_iam_policy.read_prod_db_secret_policy[0].arn
}

data "aws_iam_policy_document" "read_dev_db_secret_policy_doc" {
  statement {
    actions = [
      "secretsmanager:GetSecretValue"
    ]
    resources = [
      aws_secretsmanager_secret.dev_db_credentials.arn
    ]
  }
}

resource "aws_iam_policy" "read_dev_db_secret_policy" {
  name   = "${var.project_name}-read-dev-db-secret-policy"
  policy = data.aws_iam_policy_document.read_dev_db_secret_policy_doc.json
}

resource "aws_iam_role_policy_attachment" "read_dev_db_secret_attach" {
  role       = aws_iam_role.ec2_s3_role.name
  policy_arn = aws_iam_policy.read_dev_db_secret_policy.arn
}

resource "aws_iam_role_policy_attachment" "send_to_review_queue_attach" {
  count      = var.enable_prod_env ? 1 : 0
  role       = aws_iam_role.ec2_s3_role.name
  policy_arn = aws_iam_policy.send_to_review_queue_policy[0].arn
}
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "ec2-s3-instance-profile-cloud-2006"
  role = aws_iam_role.ec2_s3_role.name
}

# --- 7. Dev EC2 Instance ---
resource "aws_instance" "web_server_dev" {
  ami                    = var.dev_ami_id != "" ? var.dev_ami_id : data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.micro"
  key_name               = aws_key_pair.key_pair.key_name
  subnet_id              = aws_subnet.dev_public_a.id # From dev_vpc.tf
  vpc_security_group_ids = [aws_security_group.dev_web_sg.id] # From dev_vpc.tf
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  # This script runs on the first boot to set up the Node.js environment.
  user_data = <<-EOF
              #!/bin/bash
              # Update all packages
              yum update -y

              # Install Apache (as a reverse proxy) and Git
              yum install -y httpd git

              # Install Node.js v18 and npm
              curl -sL https://rpm.nodesource.com/setup_18.x | bash -
              yum install -y nodejs

              # Install PM2 globally (a process manager for Node.js)
              npm install pm2 -g

              # Start and enable Apache
              systemctl start httpd
              systemctl enable httpd

              # Install and start the AWS X-Ray daemon for tracing
              yum install -y aws-xray-daemon
              systemctl enable xray
              systemctl start xray

              # Persist application environment so PM2/SSH sessions pick up cloud DB credentials.
              cat <<'ENVVARS' | sudo tee /etc/profile.d/cloud2006.sh > /dev/null
              export NODE_ENV=production
              export AWS_REGION="${var.aws_region}"
              export AWS_DEFAULT_REGION="${var.aws_region}"
              export DB_SECRET_NAME="${aws_secretsmanager_secret.dev_db_credentials.name}"
              export DB_HOST="${aws_db_instance.dev_db.address}"
              export DB_PORT="${aws_db_instance.dev_db.port}"
              export DB_NAME="${aws_db_instance.dev_db.db_name}"
              export DB_USER="${var.db_username}"
              export DB_PASSWORD="${var.db_password}"
              export REVIEW_QUEUE_URL="${var.enable_prod_env ? aws_sqs_queue.review_processing_queue[0].url : ""}"
              export REDIS_HOST="${var.enable_prod_env ? aws_elasticache_cluster.prod_cache[0].cache_nodes[0].address : ""}"
              export REDIS_PORT="${var.enable_prod_env ? aws_elasticache_cluster.prod_cache[0].cache_nodes[0].port : 6379}"
              export RATE_LIMIT_WINDOW_MS=60000
              export RATE_LIMIT_MAX=300
              export PLACES_RATE_LIMIT_WINDOW_MS=60000
              export PLACES_RATE_LIMIT_MAX=120
              ENVVARS
              sudo chmod 0644 /etc/profile.d/cloud2006.sh
              EOF

  tags = {
    Name = "${var.project_name}-web-server-dev"
  }
}

# --- 7b. Production Staging Instance ---

resource "aws_instance" "web_server_prod_staging" {
  count = var.enable_prod_env ? 1 : 0

  # Use the specific AMI ID you provided.
  ami                    = "ami-090cb75ce61d00743"
  instance_type          = var.instance_type
  key_name               = aws_key_pair.key_pair.key_name
  # Place it in a public subnet of the PROD VPC.
  subnet_id              = aws_subnet.public_a.id
  vpc_security_group_ids = [aws_security_group.prod_staging_sg[0].id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name
  # We need a public IP to SSH into it.
  associate_public_ip_address = true

  # This user_data script is copied from the production launch template.
  # It configures the instance to connect to the PRODUCTION database and other prod services.
  user_data = base64encode(<<-EOF
              #!/bin/bash
              # Update all packages
              yum update -y

              # Install Git, Node.js, PM2, X-Ray (these should already be on the AMI, but good for consistency)
              yum install -y git httpd
              curl -sL https://rpm.nodesource.com/setup_18.x | bash -
              yum install -y nodejs
              npm install pm2 -g
              yum install -y aws-xray-daemon
              systemctl enable xray
              systemctl start xray

              # Persist application environment so PM2/SSH sessions pick up PRODUCTION cloud DB credentials.
              cat <<'ENVVARS' | sudo tee /etc/profile.d/cloud2006.sh > /dev/null
              export NODE_ENV=production
              export AWS_REGION="${var.aws_region}"
              export DB_SECRET_NAME="${aws_secretsmanager_secret.prod_db_credentials[0].name}"
              # Other environment variables for production...
              ENVVARS
              sudo chmod 0644 /etc/profile.d/cloud2006.sh
              EOF
            )

  tags = {
    Name = "${var.project_name}-web-server-prod-staging"
  }
}

# --- 7a. Elastic IP for Dev Instance ---
resource "aws_eip" "dev_eip" {
  # This requests an Elastic IP from AWS within your VPC.
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-dev-eip"
  }
}

resource "aws_eip_association" "dev_eip_assoc" {
  instance_id   = aws_instance.web_server_dev.id
  allocation_id = aws_eip.dev_eip.id
}
# --- 8. Production Environment: ELB and ASG ---

# Launch Template for ASG
resource "aws_launch_template" "web_server_template" {
  count = var.enable_prod_env ? 1 : 0

  name_prefix   = "${var.project_name}-lt-"
  image_id      = var.prod_ami_id != "" ? var.prod_ami_id : data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type
  key_name      = aws_key_pair.key_pair.key_name

  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.web_sg.id]
  }

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2_profile.name
  }

  user_data = base64encode(<<-EOF
              #!/bin/bash
              # Update all packages
              yum update -y

              # Install Git
              yum install -y git

              # Install Node.js v18 and npm
              curl -sL https://rpm.nodesource.com/setup_18.x | bash -
              yum install -y nodejs

              # Install PM2 globally (a process manager for Node.js)
              npm install pm2 -g

              # Install and start the AWS X-Ray daemon for tracing
              yum install -y aws-xray-daemon
              systemctl enable xray
              systemctl start xray

              # Persist application environment so PM2/SSH sessions pick up cloud DB credentials.
              cat <<'ENVVARS' | sudo tee /etc/profile.d/cloud2006.sh > /dev/null
              export NODE_ENV=production
              export AWS_REGION="${var.aws_region}"
              export AWS_DEFAULT_REGION="${var.aws_region}"
              export DB_SECRET_NAME="${aws_secretsmanager_secret.prod_db_credentials[0].name}"
              export DB_HOST="${aws_db_instance.prod_db[0].address}"
              export DB_PORT="${tostring(aws_db_instance.prod_db[0].port)}"
              export DB_NAME="${aws_db_instance.prod_db[0].db_name}"
              export REVIEW_QUEUE_URL="${aws_sqs_queue.review_processing_queue[0].url}"
              export REDIS_HOST="${aws_elasticache_cluster.prod_cache[0].cache_nodes[0].address}"
              export REDIS_PORT="${tostring(aws_elasticache_cluster.prod_cache[0].cache_nodes[0].port)}"
              export RATE_LIMIT_WINDOW_MS=60000
              export RATE_LIMIT_MAX=300
              export PLACES_RATE_LIMIT_WINDOW_MS=60000
              export PLACES_RATE_LIMIT_MAX=120
              ENVVARS
              sudo chmod 0644 /etc/profile.d/cloud2006.sh
              EOF
            )

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.project_name}-prod-instance"
    }
  }
}

# Application Load Balancer (ELB)
resource "aws_lb" "main" {
  count = var.enable_prod_env ? 1 : 0

  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lb_target_group" "main" {
  count = var.enable_prod_env ? 1 : 0

  name     = "${var.project_name}-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/api/health"
    protocol            = "HTTP"
    matcher             = "200-399"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lb_listener" "http" {
  count = var.enable_prod_env ? 1 : 0

  load_balancer_arn = aws_lb.main[0].arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main[0].arn
  }
}

# Auto Scaling Group (ASG)
resource "aws_autoscaling_group" "main" {
  count = var.enable_prod_env ? 1 : 0

  name                = "${var.project_name}-asg"
  desired_capacity    = var.asg_desired_capacity
  max_size            = var.asg_max_size
  min_size            = var.asg_min_size
  vpc_zone_identifier = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  launch_template {
    id      = aws_launch_template.web_server_template[0].id
    version = "$Latest"
  }

  target_group_arns = [aws_lb_target_group.main[0].arn]
}
