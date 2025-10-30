############################################
# Athena Workgroup, Database, and Recommendations Table
############################################

resource "aws_athena_workgroup" "recommender" {
  name = "${var.project_name}-recommender-wg"
  configuration {
    result_configuration {
      output_location = "s3://${local.data_bucket_name}/${local.s3_prefix_athena_results}"
    }
  }
}

resource "aws_athena_database" "recommender" {
  name   = "${lower(replace(var.project_name, "-", "_"))}_recommender"
  bucket = local.data_bucket_name
}

resource "aws_glue_catalog_table" "recommendations" {
  name          = "recommendations"
  database_name = aws_athena_database.recommender.name
  table_type    = "EXTERNAL_TABLE"
  parameters = {
    EXTERNAL       = "TRUE"
    classification = "parquet"
  }

  storage_descriptor {
    location      = "s3://${local.data_bucket_name}/${local.s3_prefix_recommendations}"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"
    ser_de_info {
      name                  = "parquet"
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
    }
    columns {
      name = "item_id"
      type = "string"
    }
    columns {
      name = "rec_item_id"
      type = "string"
    }
    columns {
      name = "score"
      type = "double"
    }
  }
}
