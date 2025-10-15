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
}

resource "aws_secretsmanager_secret_version" "prod_db_credentials_version" {
  count = var.enable_prod_env ? 1 : 0

  secret_id = aws_secretsmanager_secret.prod_db_credentials[0].id
  secret_string = jsonencode({
    password = random_password.prod_db_password[0].result
  })
}