# --- 16. Web Application Firewall (WAF) ---

# This defines the Web ACL (Access Control List), which is the container for our security rules.
# The scope is set to CLOUDFRONT, which is critical.
resource "aws_wafv2_web_acl" "main" {
  provider = aws.us_east_1

  name        = "${var.project_name}-web-acl"
  scope       = "CLOUDFRONT"
  description = "WAF Web ACL for the ${var.project_name} project."

  # The default action is to ALLOW requests. We will then add rules to BLOCK specific threats.
  default_action {
    allow {}
  }

  # This is the most important part. We are adding a managed rule group from AWS.
  # AWSManagedRulesCommonRuleSet protects against a large number of common vulnerabilities
  # like SQL injection, cross-site scripting (XSS), and other OWASP Top 10 risks.
  rule {
    name     = "AWS-Managed-Common-Rules"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-WAF-CommonRules"
      sampled_requests_enabled   = true
    }
  }

  # This enables logging and metrics for the WAF.
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-WAF"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "${var.project_name}-web-acl"
  }

  lifecycle {
    prevent_destroy = true
  }
}
