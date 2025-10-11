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

resource "aws_iam_role_policy_attachment" "s3_policy_attach" {
  role       = aws_iam_role.ec2_s3_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess" # For simplicity. Can be restricted.
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "ec2-s3-instance-profile-cloud-2006"
  role = aws_iam_role.ec2_s3_role.name
}

# --- 7. Dev EC2 Instance ---
resource "aws_instance" "web_server_dev" {
  ami                    = var.dev_ami_id != "" ? var.dev_ami_id : data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.key_pair.key_name
  subnet_id              = aws_subnet.public_a.id
  vpc_security_group_ids = [aws_security_group.web_sg.id]
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
              EOF

  tags = {
    Name = "${var.project_name}-web-server-dev"
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
  security_groups    = [aws_security_group.web_sg.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}

resource "aws_lb_target_group" "main" {
  count = var.enable_prod_env ? 1 : 0

  name     = "${var.project_name}-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
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