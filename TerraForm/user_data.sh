#!/bin/bash
# Install web server, PHP (for DB/S3 connection testing), and MariaDB client
sudo dnf update -y
sudo dnf install -y httpd wget php-fpm php-mysqli php-json php php-devel

# No need to install mariadb105-server on the web server, only client is needed
# sudo dnf install -y mariadb105-server # Not needed on web server
sudo dnf install -y mariadb105-client # Install client for RDS connection test

# Configure and Start HTTPD
sudo systemctl enable httpd
sudo systemctl start httpd

# Set permissions
sudo usermod -a -G apache ec2-user
sudo chown -R ec2-user:apache /var/www
sudo chmod 2775 /var/www
find /var/www -type d -exec sudo chmod 2775 {} \;
find /var/www -type f -exec sudo chmod 0664 {} \;

# Create a test index.html with S3/RDS reference (for verification)
# The RDS_ENDPOINT and S3_BUCKET are templated in by Terraform
S3_BUCKET="${s3_bucket_name}"
RDS_ENDPOINT="${rds_endpoint}"
AWS_REGION="${aws_region}"

echo '<html>
            <head><title>Cloud-2006 Web Server</title></head>
            <body>
              <h1>Cloud-2006 Web Server (Cloud-2006)</h1>
              <h2>Data Source Access Check</h2>
              <p><strong>RDS Endpoint:</strong> '$RDS_ENDPOINT'</p>
              <p><strong>S3 Bucket:</strong> s3://'$S3_BUCKET'</p>
              <p><strong>AWS Region:</strong> '$AWS_REGION'</p>
              <p>A simple check to verify EC2 is running and can reference its resources.</p>
              <p>Actual S3/RDS connectivity requires app code (PHP/Python) to fully utilize the IAM role and database connection.</p>
            </body>
        </html>' | sudo tee /var/www/html/index.html