############################################
# EventBridge Scheduler to run nightly ephemeral EMR (RunJobFlow) at 1 AM SGT (17:00 UTC)
############################################

# Temporarily disabled due to invalid payload; re-enable after fixing RunJobFlow input JSON
# resource "aws_scheduler_schedule" "recommender_daily" {
#   name        = "${var.project_name}-recommender-daily"
#   description = "Daily recommender Spark job on ephemeral EMR at 01:00 SGT"
#
#   schedule_expression_timezone = "UTC"
#   schedule_expression          = "cron(0 ${var.recommender_step_hour_utc} * * ? *)"
#   flexible_time_window { mode  = "OFF" }
#
#   target {
#     arn      = "arn:aws:scheduler:::aws-sdk:emr:runJobFlow"
#     role_arn = aws_iam_role.scheduler_emr_role.arn
#     input    = jsonencode({
#       Name          = "${var.project_name}-recommender-ephemeral"
#       ReleaseLabel  = "emr-7.2.0"
#       Applications  = [{ Name = "Hadoop" }, { Name = "Spark" }]
#       LogUri        = "s3://${local.log_bucket_name}/emr/logs/"
#
#       JobFlowRole   = aws_iam_instance_profile.emr_ec2_profile.name
#       ServiceRole   = aws_iam_role.emr_service_role.arn
#
#       Instances = {
#         Ec2SubnetId                      = aws_subnet.public_a.id
#         EmrManagedMasterSecurityGroup    = aws_security_group.emr_recommender_sg.id
#         EmrManagedSlaveSecurityGroup     = aws_security_group.emr_recommender_sg.id
#         KeepJobFlowAliveWhenNoSteps      = false
#         TerminationProtected             = false
#         InstanceFleets = [
#           {
#             Name                    = "master-fleet"
#             TargetOnDemandCapacity  = 1
#             InstanceTypeConfigs = [
#               {
#                 InstanceType = var.recommender_instance_types[0]
#                 EbsConfiguration = {
#                   EbsBlockDeviceConfigs = [{
#                     VolumeSpecification = { SizeInGB = 32, VolumeType = "gp3" }
#                     VolumesPerInstance  = 1
#                   }]
#                 }
#               }
#             ]
#           },
#           {
#             Name                   = "core-fleet"
#             TargetSpotCapacity     = var.recommender_core_instance_count
#             InstanceTypeConfigs = [
#               {
#                 InstanceType = var.recommender_instance_types[1]
#                 BidPriceAsPercentageOfOnDemandPrice = 50
#                 EbsConfiguration = {
#                   EbsBlockDeviceConfigs = [{
#                     VolumeSpecification = { SizeInGB = 64, VolumeType = "gp3" }
#                     VolumesPerInstance  = 1
#                   }]
#                 }
#               }
#             ]
#           }
#         ]
#       }
#
#       Steps = [
#         {
#           Name            = "poi-recommender-spark"
#           ActionOnFailure = "CONTINUE"
#           HadoopJarStep = {
#             Jar  = "command-runner.jar"
#             Args = [
#               "bash",
#               "-lc",
#               <<-EOT
#               cat > /home/hadoop/poi_recommender.py <<'PY'
#               ${file("${path.module}/jobs/poi_recommender.py")}
#               PY
#               spark-submit /home/hadoop/poi_recommender.py \
#                 --db-secret-arn ${local.recommender_db_secret_arn} \
#                 --clicks-table clicks \
#                 --db-table ${var.recommender_db_table} \
#                 --topn 20
#               EOT
#             ]
#           }
#         }
#       ]
#
#       AutoTerminationPolicy = {
#         IdleTimeout = 300
#       }
#       Tags = local.recommender_tags
#     })
#   }
# }
