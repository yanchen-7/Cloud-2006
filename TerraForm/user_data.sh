#!/bin/bash

# Update and install necessary packages
sudo yum update -y
sudo yum install -y python3-pip nano git nginx

# Create a directory for the web application
sudo mkdir -p /var/www/html/
sudo chown -R ec2-user:ec2-user /var/www/html

# --- Enable Password Authentication for SSH ---
# WARNING: This is not recommended for production environments. Key-based auth is more secure.
sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/g' /etc/ssh/sshd_config

# Set a password for the ec2-user. CHANGE THIS to a strong, unique password.
echo "ec2-user:${ec2_user_password}" | sudo chpasswd

# Restart the SSH service to apply changes
sudo systemctl restart sshd