# --- Development VPC ---
# A separate, simpler VPC for the development environment.

variable "dev_vpc_cidr" {
  description = "The CIDR block for the dev VPC."
  type        = string
  default     = "10.1.0.0/16"
}

resource "aws_vpc" "dev" {
  cidr_block           = var.dev_vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "vpc-${var.project_name}-dev"
  }
}

# --- Dev Subnets ---
resource "aws_subnet" "dev_public" {
  vpc_id                  = aws_vpc.dev.id
  cidr_block              = "10.1.1.0/24"
  availability_zone       = "us-east-1a"
  map_public_ip_on_launch = true

  tags = {
    Name = "public-dev-us-east-1a"
  }
}

resource "aws_subnet" "dev_private" {
  vpc_id            = aws_vpc.dev.id
  cidr_block        = "10.1.100.0/24"
  availability_zone = "us-east-1a"

  tags = {
    Name = "private-dev-us-east-1a"
  }
}

# --- Dev Internet Gateway & Routing ---
resource "aws_internet_gateway" "dev_igw" {
  vpc_id = aws_vpc.dev.id

  tags = {
    Name = "igw-${var.project_name}-dev"
  }
}

resource "aws_route_table" "dev_public" {
  vpc_id = aws_vpc.dev.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.dev_igw.id
  }
}

resource "aws_route_table_association" "dev_public" {
  subnet_id      = aws_subnet.dev_public.id
  route_table_id = aws_route_table.dev_public.id
}