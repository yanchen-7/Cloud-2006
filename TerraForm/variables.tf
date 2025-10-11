variable "project_name" {
  description = "The name of the project, used for tagging and naming resources."
  type        = string
}

variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
}

variable "vpc_cidr" {
  description = "The CIDR block for the VPC."
  type        = string
}

variable "instance_type" {
  description = "The EC2 instance type to use for web servers."
  type        = string
}

variable "db_instance_class" {
  description = "The instance class for the RDS database."
  type        = string
}

variable "db_username" {
  description = "The username for the RDS database."
  type        = string
}

variable "db_password" {
  description = "The password for the RDS database."
  type        = string
  sensitive   = true # This prevents the value from being shown in CLI output.
}

variable "ec2_user_password" {
  description = "The password to set for the ec2-user for SSH access."
  type        = string
  sensitive   = true
}

variable "flask_secret_key" {
  description = "A secret key for the Flask application to sign session cookies."
  type        = string
  sensitive   = true
}
variable "asg_desired_capacity" {
  description = "The desired number of instances in the Auto Scaling Group."
  type        = number
  default     = 2
}

variable "asg_min_size" {
  description = "The minimum number of instances in the Auto Scaling Group."
  type        = number
  default     = 2
}

variable "asg_max_size" {
  description = "The maximum number of instances in the Auto Scaling Group."
  type        = number
  default     = 4
}

variable "enable_prod_env" {
  description = "Set to true to create the production ALB and ASG. Set to false to destroy them."
  type        = bool
  default     = true
}

variable "prod_ami_id" {
  description = "The AMI ID to use for production EC2 instances. Defaults to the latest Amazon Linux 2023 AMI."
  type        = string
  default     = "" # An empty string will cause it to use the data source.
}

variable "dev_ami_id" {
  description = "The AMI ID to use for the dev EC2 instance. If empty, uses the latest Amazon Linux 2023 AMI."
  type        = string
  default     = ""
}

variable "refresh_prod_db" {
  description = "Set to true to create a new snapshot from the dev DB and replace the prod DB with it. Defaults to false."
  type        = bool
  default     = false
}