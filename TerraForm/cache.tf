# --- 12. ElastiCache for Redis (Production) ---

# ElastiCache requires its own subnet group, similar to RDS.
# We will place it in the private subnets alongside the production database.
resource "aws_elasticache_subnet_group" "prod_cache_subnet_group" {
  count = var.enable_prod_env ? 1 : 0

  name       = "${var.project_name}-prod-cache-subnet-group"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = {
    Name = "${var.project_name}-prod-cache-subnet-group"
  }
}

# This defines the ElastiCache for Redis cluster itself.
resource "aws_elasticache_cluster" "prod_cache" {
  count = var.enable_prod_env ? 1 : 0

  cluster_id           = "${var.project_name}-prod-cache"
  engine               = "redis"
  engine_version       = "7.0" # A recent, stable version of Redis
  node_type            = "cache.t2.micro" # Free-tier eligible
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7.0"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.prod_cache_subnet_group[0].name
  security_group_ids   = [aws_security_group.cache_sg[0].id]

  tags = {
    Name = "${var.project_name}-prod-cache"
  }
}