##############################################
# cloud-2006 / dev_vpc.tf
# Development Environment VPC Setup
##############################################

# --- 1. DEV VPC ---
resource "aws_vpc" "dev" {
  cidr_block           = "10.1.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "cloud-2006-dev-vpc"
    Environment = "dev"
  }
}

# --- 2. Subnets (Public + Private) ---
resource "aws_subnet" "dev_public_a" {
  vpc_id                  = aws_vpc.dev.id
  # cidrsubnet(prefix, newbits, netnum)
  # prefix: The VPC's CIDR block (10.1.0.0/16)
  # newbits: 4 bits to change the prefix from /16 to /20
  # netnum: 0, so the resulting CIDR is 10.1.0.0/20
  cidr_block              = cidrsubnet(aws_vpc.dev.cidr_block, 4, 0)
  availability_zone       = "us-east-1a"
  map_public_ip_on_launch = true
  tags = {
    Name = "dev-public-us-east-1a"
  }
}

resource "aws_subnet" "dev_public_b" {
  vpc_id                  = aws_vpc.dev.id
  # netnum: 1, so the resulting CIDR is 10.1.16.0/20
  cidr_block              = cidrsubnet(aws_vpc.dev.cidr_block, 4, 1)
  availability_zone       = "us-east-1b"
  map_public_ip_on_launch = true
  tags = {
    Name = "dev-public-us-east-1b"
  }
}

resource "aws_subnet" "dev_private_a" {
  vpc_id            = aws_vpc.dev.id
  # netnum: 8, so the resulting CIDR is 10.1.128.0/20
  cidr_block        = cidrsubnet(aws_vpc.dev.cidr_block, 4, 8)
  availability_zone = "us-east-1a"
  tags = {
    Name = "dev-private-us-east-1a"
  }
}

resource "aws_subnet" "dev_private_b" {
  vpc_id            = aws_vpc.dev.id
  # netnum: 9, so the resulting CIDR is 10.1.144.0/20
  cidr_block        = cidrsubnet(aws_vpc.dev.cidr_block, 4, 9)
  availability_zone = "us-east-1b"
  tags = {
    Name = "dev-private-us-east-1b"
  }
}

# --- 3. Internet Gateway and Public Route Table ---
resource "aws_internet_gateway" "dev_igw" {
  vpc_id = aws_vpc.dev.id
  tags = {
    Name = "cloud-2006-dev-igw"
  }
}

resource "aws_route_table" "dev_public_rt" {
  vpc_id = aws_vpc.dev.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.dev_igw.id
  }

  tags = {
    Name = "dev-public-route-table"
  }
}

resource "aws_route_table_association" "dev_public_a" {
  subnet_id      = aws_subnet.dev_public_a.id
  route_table_id = aws_route_table.dev_public_rt.id
}

resource "aws_route_table_association" "dev_public_b" {
  subnet_id      = aws_subnet.dev_public_b.id
  route_table_id = aws_route_table.dev_public_rt.id
}

# --- 4. Private Route Table (no NAT, only local) ---
resource "aws_route_table" "dev_private_rt" {
  vpc_id = aws_vpc.dev.id
  tags = {
    Name = "dev-private-route-table"
  }
}

resource "aws_route_table_association" "dev_private_a" {
  subnet_id      = aws_subnet.dev_private_a.id
  route_table_id = aws_route_table.dev_private_rt.id
}

resource "aws_route_table_association" "dev_private_b" {
  subnet_id      = aws_subnet.dev_private_b.id
  route_table_id = aws_route_table.dev_private_rt.id
}

# --- 5. Security Groups ---
## EC2 Web SG
resource "aws_security_group" "dev_web_sg" {
  name        = "cloud-2006-dev-web-sg"
  description = "Allow HTTP, HTTPS, and SSH for Dev EC2"
  vpc_id      = aws_vpc.dev.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "cloud-2006-dev-web-sg"
  }
}

## RDS DB SG
resource "aws_security_group" "dev_db_sg" {
  name        = "cloud-2006-dev-db-sg"
  description = "Allow access from Dev Web Security Group"
  vpc_id      = aws_vpc.dev.id

  ingress {
    from_port                = 3306
    to_port                  = 3306
    protocol                 = "tcp"
    security_groups          = [aws_security_group.dev_web_sg.id]
  }
}
