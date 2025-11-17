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
# resource "aws_db_subnet_group" "dev_db_subnet_group" {
#  name       = "${var.project_name}-dev-db-subnet-group"
#  subnet_ids = [aws_subnet.dev_private_a.id, aws_subnet.dev_private_b.id] # From dev_vpc.tf
#
#  tags = {
#    Name = "${var.project_name}-dev-db-subnet-group"
#  }
#}

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
  db_subnet_group_name   = aws_db_subnet_group.db_subnet_group.name
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

  lifecycle {
    prevent_destroy = true
  }
}

# --- Production RDS Environment (Cloned from Dev) ---

# Production RDS Instance, created from the snapshot of the dev database.
# This resource creates a snapshot of the dev database when `var.refresh_prod_db` is true.
resource "aws_db_snapshot" "dev_db_snapshot" {
  count = var.enable_prod_env && var.refresh_prod_db ? 1 : 0

  db_instance_identifier = aws_db_instance.dev_db.identifier
  db_snapshot_identifier = "${var.project_name}-dev-snapshot-${formatdate("YYYYMMDDhhmmss", timestamp())}"

  tags = {
    Name = "${var.project_name}-dev-snapshot-for-prod"
  }
}

# Production RDS Instance. It's created from a snapshot if `refresh_prod_db` is true.
resource "aws_db_instance" "prod_db" {
  count = var.enable_prod_env ? 1 : 0

  identifier          = "${var.project_name}-prod-db"
  snapshot_identifier = var.refresh_prod_db ? aws_db_snapshot.dev_db_snapshot[0].id : null

  # When creating from a snapshot, some attributes are inherited and cannot be set.
  # When creating a new DB, these are required.
  db_name             = var.refresh_prod_db ? null : "cloud2006db"
  engine              = "mysql"
  engine_version      = "8.0"
  allocated_storage   = var.refresh_prod_db ? null : 20
  storage_type        = "gp2"
  instance_class      = var.db_instance_class
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  db_subnet_group_name   = aws_db_subnet_group.db_subnet_group.name

  multi_az            = true
  publicly_accessible = false
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.project_name}-prod-db-final-snapshot"
  apply_immediately   = true # Apply changes immediately, including password updates.

  # Set/update the master password. This will be applied after the instance is created from the snapshot.
  password = random_password.prod_db_password[0].result

  # Enable Enhanced Monitoring at a 60-second interval
  monitoring_interval    = 60
  monitoring_role_arn    = aws_iam_role.rds_enhanced_monitoring_role.arn

  tags = {
    Name = "${var.project_name}-prod-db"
  }

  lifecycle {
    prevent_destroy = true
  }
}
