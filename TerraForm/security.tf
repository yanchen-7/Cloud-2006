# FILE: security.tf

# --- Security Groups (UNCHANGED from previous step) ---

# 3) Web/Application Security Group (for EC2/Web Server)
resource "aws_security_group" "web_sg" {
  name        = "Cloud-2006 Web-sg"
  description = "Allow SSH, HTTP, HTTPS, MySQL access from anywhere"
  vpc_id      = aws_vpc.main.id

  # Inbound Rules
  ingress {
    description = "SSH Access (for you/SFTP/Tunneling)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  # ... (other ingress rules for 80, 443, 3306)

  ingress {
    description = "HTTP Access"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS Access"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    description = "MySQL/Aurora (for Workbench or App)"
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound Rule (All Outbound Traffic)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "Cloud-2006 Web-sg"
  }
}

# 3) RDS/Database Security Group
resource "aws_security_group" "db_sg" {
  name        = "Cloud-2006 DB security group"
  description = "Allow access from Web Security Group"
  vpc_id      = aws_vpc.main.id

  # Inbound Rule (From the Web Security Group only)
  ingress {
    description     = "MySQL/Aurora access from Web Servers"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.web_sg.id] 
  }
  
  # Outbound Rule (All Outbound Traffic)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "Cloud-2006 DB security group"
  }
}

# ----------------------------------------------------------------------
# --- IAM FIX: Reference Pre-existing Lab Profile ---
# ERROR FIX: The user does not have permissions to create IAM roles/policies.
# We must use a pre-existing IAM Instance Profile provided by the lab environment.

# 1. Use a data source to look up the pre-existing IAM Instance Profile
# You MUST replace "VOCLAB-EC2-S3-Profile" with the actual name
# of the IAM Instance Profile provided by your lab (check lab instructions/AWS console).
data "aws_iam_instance_profile" "lab_profile" {
  name = "EMR_EC2_DefaultRole" 
}


# The following original resource blocks are now COMMENTED OUT to prevent the "Access Denied" error:
/*
# IAM Policy Document for EC2 Trust Relationship
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# IAM Role
resource "aws_iam_role" "ec2_s3_role" {
  name               = "Cloud-2006-EC2-S3-Role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# S3 Access Policy Document (Allows CRUD on the specific S3 bucket)
data "aws_iam_policy_document" "s3_access_policy" {
  statement {
    sid    = "AllowS3Crud"
    actions = [
      "s3:ListBucket",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      aws_s3_bucket.static_files.arn,
      "${aws_s3_bucket.static_files.arn}/*",
    ]
  }
}

# IAM Policy
resource "aws_iam_policy" "s3_access_policy" {
  name   = "Cloud-2006-S3-CRUD-Policy"
  policy = data.aws_iam_policy_document.s3_access_policy.json
}

# Attach S3 Policy to the Role
resource "aws_iam_role_policy_attachment" "s3_access_attach" {
  role       = aws_iam_role.ec2_s3_role.name
  policy_arn = aws_iam_policy.s3_access_policy.arn
}

# IAM Instance Profile (Needed to attach the Role to the EC2)
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "Cloud-2006-EC2-Profile"
  role = aws_iam_role.ec2_s3_role.name
}
*/