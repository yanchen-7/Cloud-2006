# --- 4. Security Groups ---

# Security Group for Production Web Servers (ALB/ASG)
resource "aws_security_group" "web_sg" {
  name        = "${var.project_name}-web-sg"
  description = "Allow HTTP, HTTPS, and SSH for Production"
  vpc_id      = aws_vpc.main.id

  # Allow HTTP from anywhere
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow HTTPS from anywhere
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow SSH from anywhere (WARNING: Not recommended for production)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Security Group for the Production RDS Database
resource "aws_security_group" "db_sg" {
  name        = "${var.project_name}-db-sg"
  description = "Allow access from Web Security Group"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.web_sg.id] # Source is the web SG
  }
}

# Security Group for the Production ElastiCache Cluster
resource "aws_security_group" "cache_sg" {
  count = var.enable_prod_env ? 1 : 0

  name        = "${var.project_name}-cache-sg"
  description = "Allow access from the Web Security Group to Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379 # Default Redis port
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.web_sg.id] # Source is the production web SG
  }
}
# --- Development Security Groups ---

# Security Group for the Dev EC2 Instance
resource "aws_security_group" "dev_web_sg" {
  name        = "${var.project_name}-dev-web-sg"
  description = "Allow HTTP, HTTPS, and SSH for Dev EC2"
  vpc_id      = aws_vpc.dev.id

  # Allow HTTP from anywhere
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow HTTPS from anywhere
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow SSH from anywhere (WARNING: Not recommended for production)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Security Group for the Dev RDS Database
resource "aws_security_group" "dev_db_sg" {
  name        = "${var.project_name}-dev-db-sg"
  description = "Allow access from Dev Web Security Group"
  vpc_id      = aws_vpc.dev.id

  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.dev_web_sg.id] # Source is the dev web SG
  }
}