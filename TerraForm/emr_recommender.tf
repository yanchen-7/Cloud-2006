############################################
# Amazon EMR Cluster for Recommender (Spark/MapReduce)
############################################

resource "aws_emr_cluster" "recommender" {
  name          = "${var.project_name}-emr-recommender"
  release_label = "emr-7.2.0"
  applications  = ["Hadoop", "Spark"]

  service_role  = aws_iam_role.emr_service_role.arn

  ec2_attributes {
    subnet_id                         = aws_subnet.public_a.id
    emr_managed_master_security_group = null
    emr_managed_slave_security_group  = null
    instance_profile                  = aws_iam_instance_profile.emr_ec2_profile.arn
  }

  log_uri = "s3://${local.log_bucket_name}/emr/logs/"

  master_instance_fleet {
    name                        = "master-fleet"
    target_on_demand_capacity   = 1

    instance_type_configs {
      instance_type = var.recommender_instance_types[0]
      ebs_config {
        size                 = 32
        type                 = "gp3"
        volumes_per_instance = 1
      }
    }
  }

  core_instance_fleet {
    name                     = "core-fleet"
    target_spot_capacity     = var.recommender_core_instance_count

    instance_type_configs {
      instance_type = var.recommender_instance_types[1]
      bid_price_as_percentage_of_on_demand_price = 50
      ebs_config {
        size                 = 64
        type                 = "gp3"
        volumes_per_instance = 1
      }
    }
  }

  configurations_json = jsonencode([
    {
      Classification = "spark-defaults",
      Properties     = { "spark.executor.extraJavaOptions" = "-Dlog4j.configuration=log4j.properties" }
    }
  ])

  keep_job_flow_alive_when_no_steps = false

  auto_termination_policy {
    idle_timeout = 600
  }

  tags = local.recommender_tags
}

# Upload PySpark job to S3 code path within main bucket
resource "aws_s3_object" "recommender_job" {
  bucket = aws_s3_bucket.main.id
  key    = "${local.s3_prefix_jobs}poi_recommender.py"
  source = "${path.module}/jobs/poi_recommender.py"
  etag   = filemd5("${path.module}/jobs/poi_recommender.py")
}
