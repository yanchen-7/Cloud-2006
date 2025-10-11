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
# Existing Development RDS MySQL Instance
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
  skip_final_snapshot    = false # It's safer to create a final snapshot on destroy
  final_snapshot_identifier = "${var.project_name}-dev-db-final-snapshot"
  publicly_accessible    = false # Important for security

  # Disabling automated backups as requested, not recommended for production
  backup_retention_period = 0

  tags = {
    Name = "${var.project_name}-db"
  }
}

# --- Production RDS Environment (Cloned from Dev) ---

# Create a snapshot of the existing dev database to seed the prod database.
resource "aws_db_snapshot" "prod_seed_snapshot" {
  count = var.enable_prod_env ? 1 : 0

  db_instance_identifier = aws_db_instance.main.identifier
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

  tags = {
    Name = "${var.project_name}-prod-db"
  }
}