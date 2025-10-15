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
  subnet_ids = [aws_subnet.dev_private.id]

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
  vpc_security_group_ids = [aws_security_group.dev_db_sg.id]
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

# Create a snapshot of the existing dev database to seed the prod database.
resource "aws_db_snapshot" "prod_seed_snapshot" {
  count = var.enable_prod_env ? 1 : 0

  db_instance_identifier = aws_db_instance.dev_db.identifier
  db_snapshot_identifier = "${var.project_name}-prod-seed-snapshot"

  tags = {
    Name = "${var.project_name}-prod-seed-snapshot"
  }
}

# Production RDS Instance, created from the snapshot of the dev database.
resource "aws_db_instance" "prod_db" {
  count = var.enable_prod_env ? 1 : 0

  identifier             = "${var.project_name}-prod-db"
  snapshot_identifier    = aws_db_snapshot.prod_seed_snapshot[0].db_snapshot_arn
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

  # When the database is replaced (e.g., by restoring a new snapshot),
  # the new password must be applied.
  triggers = {
    # The db_snapshot_arn is a good trigger, as it changes when a new snapshot is used.
    snapshot_arn = aws_db_snapshot.prod_seed_snapshot[0].db_snapshot_arn
  }

  provisioner "local-exec" {
    # This command runs after the RDS instance is created or updated.
    # It modifies the master password to use the one stored in Secrets Manager.
    # NOTE: This requires the AWS CLI to be configured on the machine running Terraform.
    command = <<EOT
      aws rds modify-db-instance \
        --db-instance-identifier ${self.identifier} \
        --master-user-password "${random_password.prod_db_password[0].result}" \
        --apply-immediately
    EOT
  }

  tags = {
    Name = "${var.project_name}-prod-db"
  }
}