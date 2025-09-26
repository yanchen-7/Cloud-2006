# --- Load Balancer (ALB) ---

resource "aws_lb" "alb" {
  name               = "cloud-2006-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.web_sg.id] # Use the Web SG
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id] # Public subnets for external access

  tags = {
    Name = "cloud-2006-alb"
  }
}

resource "aws_lb_target_group" "tg" {
  name     = "cloud-2006-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id
  target_type = "instance"

  health_check {
    path = "/"
    protocol = "HTTP"
    matcher = "200"
  }

  tags = {
    Name = "cloud-2006-tg"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg.arn
  }
}

# --- Launch Template (Use EC2 Image/AMI) ---

# --- Launch Template (LT) ---

resource "aws_launch_template" "lt" {
  name_prefix   = "cloud-2006-lt-"
  image_id      = data.aws_ami.al2023.id
  instance_type = "t3.micro"

  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.web_sg.id]
    subnet_id                   = aws_subnet.public_a.id
  }

  iam_instance_profile {
    # --------------------------------------------------
    # CHANGE HERE: Use the new data source reference
    name = data.aws_iam_instance_profile.lab_profile.name 
    # --------------------------------------------------
  }
  user_data = base64encode(data.template_file.user_data.rendered) # Same user data for consistency

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name = "Cloud-2006 ASG Instance - PROD"
      Project = "cloud-2006"
      Environment = "Prod"
    }
  }
}

# --- Auto Scaling Group (ASG) ---

resource "aws_autoscaling_group" "asg" {
  name                      = "cloud-2006-asg"
  vpc_zone_identifier       = [aws_subnet.public_a.id, aws_subnet.public_b.id] # Use both public subnets
  desired_capacity          = 1
  max_size                  = 2
  min_size                  = 1
  target_group_arns         = [aws_lb_target_group.tg.arn]
  health_check_type         = "ELB" # Use ELB's health check
  launch_template {
    id      = aws_launch_template.lt.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "Cloud-2006 ASG Instance"
    propagate_at_launch = true
  }
}