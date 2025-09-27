# --- RDS Subnet Group (Required for placing RDS in private subnets) ---

# 3 AURORA and RDS. -> Subnet groups
resource "aws_db_subnet_group" "db_sg" {
  name        = "cloud-2006-db-sg"
  description = "DB Subnet Group"
  subnet_ids  = [aws_subnet.private_a.id, aws_subnet.private_b.id] # Use the two private subnets

  tags = {
    Name = "Cloud-2006-DB-SG"
  }
}

# --- RDS Database (MySQL) ---

# 5 Create an RDS database
resource "aws_db_instance" "mysql_db" {
  identifier                = "cloud-2006-db"
  allocated_storage         = 20
  engine                    = "mysql"
  engine_version            = "8.0"
  instance_class            = "db.t3.micro" # Using t3.micro for cost savings
  username                  = "clouddev"
  password                  = "TourismPOI" # NOTE: Using HCL variable is better
  db_subnet_group_name      = aws_db_subnet_group.db_sg.name
  vpc_security_group_ids    = [aws_security_group.db_sg.id] # CORRECT: Attaches the DB SG
  skip_final_snapshot       = true
  publicly_accessible       = false # Must be false, it's in a private subnet
  backup_retention_period   = 0 # Uncheck Enable automated backups

  tags = {
    Name = "cloud-2006-db"
  }
}

# --- EC2 Instance (Dev Environment) ---

# User Data Script to install web server, PHP, and create the test page
data "template_file" "user_data" {
  template = file("${path.module}/user_data.sh")
  vars = {
    s3_bucket_name = var.s3_bucket_name
    rds_endpoint   = aws_db_instance.mysql_db.address
    aws_region     = data.aws_region.current.name
  }
}

# 4 Create a EC2 instance
resource "aws_instance" "web_server" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = "t3.micro"
  key_name                    = var.key_pair_name
  subnet_id                   = aws_subnet.public_a.id
  associate_public_ip_address = true
  security_groups             = [aws_security_group.web_sg.id]
  # --------------------------------------------------
  # CHANGE HERE: Use the new data source reference
  iam_instance_profile        = data.aws_iam_instance_profile.lab_profile.name 
  # --------------------------------------------------
  user_data                   = data.template_file.user_data.rendered

  tags = {
    Name = "Cloud-2006 Web Server - DEV"
    Project = "cloud-2006"
    Environment = "Dev"
  }
}

# --- S3 Bucket for Static Files ---

# 7 S3 setup
resource "aws_s3_bucket" "static_files" {
  bucket = var.s3_bucket_name

  tags = {
    Name    = "cloud-2006-static-files"
    Project = "cloud-2006"
  }
}

# NEW RESOURCE: Enables ACLs on the bucket
resource "aws_s3_bucket_ownership_controls" "static_files_ownership" {
  bucket = aws_s3_bucket.static_files.id
  rule {
    object_ownership = "ObjectWriter"
  }
}

# The ACL resource you added in the previous step
resource "aws_s3_bucket_acl" "static_files_acl" {
  bucket = aws_s3_bucket.static_files.id
  acl    = "private"
  
  # IMPORTANT: Add the dependency here to force creation order
  depends_on = [aws_s3_bucket_ownership_controls.static_files_ownership]  
}