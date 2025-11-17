# --- 11. Secrets Management ---

# This resource generates a random password for the production database.
resource "random_password" "prod_db_password" {
  count = var.enable_prod_env ? 1 : 0

  length           = 16
  special          = true
  override_special = "!#%&*()-_=+[]{}<>:?"
}

# This resource stores the generated production DB password in AWS Secrets Manager.
resource "aws_secretsmanager_secret" "prod_db_credentials" {
  count = var.enable_prod_env ? 1 : 0

  name = "${var.project_name}-prod-db-credentials"
  tags = {
    Name = "${var.project_name}-prod-db-credentials"
  }

   lifecycle {
     prevent_destroy = true
   }
}

resource "aws_secretsmanager_secret_version" "prod_db_credentials_version" {
  count = var.enable_prod_env ? 1 : 0

  secret_id = aws_secretsmanager_secret.prod_db_credentials[0].id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.prod_db_password[0].result
    dbname   = aws_db_instance.prod_db[0].db_name
    host     = aws_db_instance.prod_db[0].address
    port     = aws_db_instance.prod_db[0].port
  })
}

# Development database credentials stored in Secrets Manager so instances avoid hardcoded .env values.
resource "aws_secretsmanager_secret" "dev_db_credentials" {
  name = "${var.project_name}-dev-db-credentials"

  tags = {
    Name = "${var.project_name}-dev-db-credentials"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret_version" "dev_db_credentials_version" {
  secret_id = aws_secretsmanager_secret.dev_db_credentials.id

  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
    dbname   = aws_db_instance.dev_db.db_name
    host     = aws_db_instance.dev_db.address
    port     = aws_db_instance.dev_db.port
  })
}
