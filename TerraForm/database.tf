# --- 9. RDS Database ---

# DB Subnet Group
resource "aws_db_subnet_group" "db_subnet_group" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

# RDS MySQL Instance
resource "aws_db_instance" "main" {
  identifier             = "cloud-2006-db"
  db_name                = "cloud2006db" # DB Name can only contain letters and numbers.
  engine                 = "mysql"
  engine_version         = "8.0"
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  storage_type           = "gp2"
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.db_subnet_group.name
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  skip_final_snapshot    = true # Set to false in production
  publicly_accessible    = false # Important for security

  # Disabling automated backups as requested, not recommended for production
  backup_retention_period = 0

  tags = {
    Name = "${var.project_name}-db"
  }
}