############################################
# IAM for EMR and Scheduler (least-privilege)
############################################

# EMR Service Role
data "aws_iam_policy_document" "emr_service_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["elasticmapreduce.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "emr_service_role" {
  name               = "${var.project_name}-emr-service-role"
  assume_role_policy = data.aws_iam_policy_document.emr_service_assume.json
  tags               = local.recommender_tags
}

data "aws_iam_policy_document" "emr_service_policy" {
  statement {
    effect = "Allow"
    actions = [
      "elasticmapreduce:*",
      "ec2:Describe*",
      "cloudwatch:*",
      "logs:*",
      "iam:PassRole"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "emr_service_policy" {
  name   = "${var.project_name}-emr-service-policy"
  policy = data.aws_iam_policy_document.emr_service_policy.json
}

resource "aws_iam_role_policy_attachment" "emr_service_attach" {
  role       = aws_iam_role.emr_service_role.name
  policy_arn = aws_iam_policy.emr_service_policy.arn
}

# EMR EC2 Instance Profile Role
data "aws_iam_policy_document" "emr_ec2_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "emr_ec2_role" {
  name               = "${var.project_name}-emr-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.emr_ec2_assume.json
  tags               = local.recommender_tags
}

# Restrict S3 access to project bucket prefixes
data "aws_iam_policy_document" "emr_ec2_s3" {
  statement {
    effect = "Allow"
    actions = ["s3:ListBucket"]
    resources = [aws_s3_bucket.main.arn]
  }
  statement {
    effect = "Allow"
    actions = ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload"]
    resources = [
      "${aws_s3_bucket.main.arn}/${local.s3_prefix_raw}*",
      "${aws_s3_bucket.main.arn}/${local.s3_prefix_curated}*",
      "${aws_s3_bucket.main.arn}/${local.s3_prefix_recommendations}*",
      "${aws_s3_bucket.main.arn}/${local.s3_prefix_jobs}*",
      "${aws_s3_bucket.main.arn}/${local.s3_prefix_athena_results}*"
    ]
  }
  statement {
    effect   = "Allow"
    actions  = ["s3:PutObject","s3:GetBucketLocation"]
    resources = [aws_s3_bucket.log_bucket.arn, "${aws_s3_bucket.log_bucket.arn}/*"]
  }
  statement {
    effect   = "Allow"
    actions  = ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"]
    resources = ["*"]
  }
  statement {
    effect   = "Allow"
    actions  = ["ec2:Describe*","cloudwatch:*","iam:PassRole"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "emr_ec2_s3" {
  name   = "${var.project_name}-emr-ec2-s3-policy"
  policy = data.aws_iam_policy_document.emr_ec2_s3.json
}

resource "aws_iam_role_policy_attachment" "emr_ec2_s3_attach" {
  role       = aws_iam_role.emr_ec2_role.name
  policy_arn = aws_iam_policy.emr_ec2_s3.arn
}

resource "aws_iam_instance_profile" "emr_ec2_profile" {
  name = "${var.project_name}-emr-ec2-profile"
  role = aws_iam_role.emr_ec2_role.name
}

# EventBridge Scheduler Role to add steps
data "aws_iam_policy_document" "scheduler_emr_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler_emr_role" {
  name               = "${var.project_name}-scheduler-emr-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_emr_assume.json
  tags               = local.recommender_tags
}

data "aws_iam_policy_document" "scheduler_emr_policy" {
  statement {
    effect = "Allow"
    actions = [
      "elasticmapreduce:AddJobFlowSteps",
      "elasticmapreduce:DescribeCluster",
      "elasticmapreduce:ListSteps"
    ]
    resources = [aws_emr_cluster.recommender.arn]
  }
}

resource "aws_iam_policy" "scheduler_emr_policy" {
  name   = "${var.project_name}-scheduler-emr-policy"
  policy = data.aws_iam_policy_document.scheduler_emr_policy.json
}

resource "aws_iam_role_policy_attachment" "scheduler_emr_attach" {
  role       = aws_iam_role.scheduler_emr_role.name
  policy_arn = aws_iam_policy.scheduler_emr_policy.arn
}
