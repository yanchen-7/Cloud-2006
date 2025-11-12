variable "recommender_owner" {
  description = "Owner tag for recommender resources (team/email)."
  type        = string
  default     = "unknown"
}

variable "recommender_environment" {
  description = "Environment tag for recommender resources (dev/staging/prod)."
  type        = string
  default     = "prod"
}

variable "recommender_instance_types" {
  description = "EMR master/core instance types [master, core]."
  type        = list(string)
  default     = ["m5.xlarge", "m5.xlarge"]
}

variable "recommender_core_instance_count" {
  description = "Number of core nodes for EMR."
  type        = number
  default     = 2
}

variable "recommender_step_hour_utc" {
  description = "UTC hour for daily schedule (1 AM SGT => 17 UTC)."
  type        = number
  default     = 17
}

variable "recommender_db_table" {
  description = "MySQL table name to store recommender outputs."
  type        = string
  default     = "recommendations"
}
