output "web_server_public_ip" {
  description = "Public IP of the EC2 Web Server (Dev)"
  value       = aws_instance.web_server.public_ip
}

output "web_server_public_dns" {
  description = "Public DNS of the EC2 Web Server (Dev)"
  value       = aws_instance.web_server.public_dns
}

output "alb_dns_name" {
  description = "DNS Name of the Application Load Balancer (Prod)"
  value       = aws_lb.alb.dns_name
}

output "rds_endpoint" {
  description = "The address of the RDS database"
  value       = aws_db_instance.mysql_db.address
}