variable "enable_clicks_export" {
  description = "Enable Lambda + Scheduler to export clicks from MySQL to S3 nightly."
  type        = bool
  default     = true
}

variable "clicks_db_host" {
  type    = string
  default = ""
}

variable "clicks_db_port" {
  type    = number
  default = 3306
}

variable "clicks_db_user" {
  type    = string
  default = ""
}

variable "clicks_db_password" {
  type    = string
  default = ""
}

variable "clicks_db_name" {
  type    = string
  default = ""
}

variable "clicks_export_pymysql_layer_arn" {
  description = "Optional Lambda Layer ARN containing PyMySQL for the export function."
  type        = string
  default     = ""
}

variable "clicks_db_secret_name" {
  description = "Secrets Manager secret name containing MySQL connection JSON (host,port,user,password,db)."
  type        = string
  default     = ""
}
