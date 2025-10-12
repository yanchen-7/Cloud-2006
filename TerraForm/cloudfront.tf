# --- 15. CloudFront Distributions ---

# --- Production CloudFront Distribution ---
resource "aws_cloudfront_distribution" "prod_distribution" {
  provider = aws.us_east_1 # WAF for CloudFront requires the distribution to be in us-east-1 for association
  count = var.enable_prod_env ? 1 : 0

  origin {
    # This is the address of your Application Load Balancer.
    domain_name = aws_lb.main[0].dns_name
    origin_id   = "${var.project_name}-prod-alb-origin"

    custom_origin_config {
      # CloudFront will connect to the ALB over HTTP.
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CloudFront distribution for ${var.project_name} production environment"
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "${var.project_name}-prod-alb-origin"

    # Redirect all HTTP traffic to HTTPS.
    viewer_protocol_policy = "redirect-to-https"

    # Use AWS-managed policies for caching and forwarding.
    # 'Managed-CachingDisabled' is ideal for dynamic APIs, as it doesn't cache responses.
    # 'Managed-AllViewer' forwards all headers, query strings, and cookies to your application.
    cache_policy_id        = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3" # Managed-AllViewer
  }

  # Associate the WAF directly. This is more reliable than a separate association resource.
  web_acl_id = aws_wafv2_web_acl.main.arn

  # We are not using a custom domain, so no custom certificate is needed.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name        = "${var.project_name}-prod-cf-distribution"
    Environment = "production"
  }
}

# --- Development CloudFront Distribution ---
resource "aws_cloudfront_distribution" "dev_distribution" {
  provider = aws.us_east_1 # WAF for CloudFront requires the distribution to be in us-east-1 for association

  origin {
    # This is the public IP address of your single dev EC2 instance.
    # CloudFront requires a DNS name for the origin, not an IP address.
    domain_name = aws_instance.web_server_dev.public_dns
    origin_id   = "${var.project_name}-dev-ec2-origin"

    custom_origin_config {
      # CloudFront will connect to the dev instance over HTTP.
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CloudFront distribution for ${var.project_name} development environment"
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "${var.project_name}-dev-ec2-origin"

    viewer_protocol_policy = "redirect-to-https"

    cache_policy_id        = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3" # Managed-AllViewer
  }

  # Associate the WAF directly. This is more reliable than a separate association resource.
  web_acl_id = aws_wafv2_web_acl.main.arn

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name        = "${var.project_name}-dev-cf-distribution"
    Environment = "development"
  }
}
