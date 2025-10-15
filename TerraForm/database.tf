# --- 9. RDS Database ---

# Production DB Subnet Group
resource "aws_db_subnet_group" "db_subnet_group" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = {
    Name = "${var.project_name}-prod-db-subnet-group"
  }
}

# Development DB Subnet Group
resource "aws_db_subnet_group" "dev_db_subnet_group" {
  name       = "${var.project_name}-dev-db-subnet-group"
  subnet_ids = [aws_subnet.dev_private_a.id, aws_subnet.dev_private_b.id] # From dev_vpc.tf

  tags = {
    Name = "${var.project_name}-dev-db-subnet-group"
  }
}

# --- IAM Role for RDS Enhanced Monitoring ---
resource "aws_iam_role" "rds_enhanced_monitoring_role" {
  name = "${var.project_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring_attach" {
  role       = aws_iam_role.rds_enhanced_monitoring_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}


# Development RDS MySQL Instance
resource "aws_db_instance" "dev_db" {
  identifier             = "cloud-2006-db" # Keeping original identifier to avoid replacement
  db_name                = "cloud2006db" # DB Name can only contain letters and numbers.
  engine                 = "mysql"
  engine_version         = "8.0"
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  storage_type           = "gp2"
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.dev_db_subnet_group.name
  vpc_security_group_ids = [aws_security_group.dev_db_sg.id] # From dev_vpc.tf
  skip_final_snapshot    = false # It's safer to create a final snapshot on destroy
  final_snapshot_identifier = "${var.project_name}-dev-db-final-snapshot"
  publicly_accessible    = false # Important for security

  # Disabling automated backups as requested, not recommended for production
  backup_retention_period = 0

  # Enable Enhanced Monitoring at a 60-second interval
  monitoring_interval    = 60
  monitoring_role_arn    = aws_iam_role.rds_enhanced_monitoring_role.arn
  tags = {
    Name = "${var.project_name}-dev-db"
  }
}

# --- Production RDS Environment (Cloned from Dev) ---

# Production RDS Instance, created from the snapshot of the dev database.
resource "aws_db_instance" "prod_db" {
  count = var.enable_prod_env ? 1 : 0

  identifier             = "${var.project_name}-prod-db"
  # snapshot_identifier is removed to create a new, empty database.
  # You can manage its schema and data manually via MySQL Workbench.
  db_name                = "cloud2006db" # Same as dev for consistency
  engine                 = "mysql"
  engine_version         = "8.0"
  allocated_storage      = 20
  storage_type           = "gp2"
  username               = var.db_username
  # The password will be set by the local-exec provisioner below.
  password               = random_password.prod_db_password[0].result
  instance_class         = var.db_instance_class
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  db_subnet_group_name   = aws_db_subnet_group.db_subnet_group.name

  multi_az            = true
  publicly_accessible = false
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.project_name}-prod-db-final-snapshot"

  # Enable Enhanced Monitoring at a 60-second interval
  monitoring_interval    = 60
  monitoring_role_arn    = aws_iam_role.rds_enhanced_monitoring_role.arn

  tags = {
    Name = "${var.project_name}-prod-db"
  }
}
