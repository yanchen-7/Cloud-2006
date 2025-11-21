import boto3
import os
import datetime
import sys

APPLICATION_ID = os.environ['APPLICATION_ID']
EXECUTION_ROLE_ARN = os.environ['EXECUTION_ROLE_ARN']
BUCKET_NAME = os.environ['BUCKET_NAME']
REGION = os.environ.get('AWS_REGION', 'us-east-1')  # adjust to your region

client = boto3.client("emr-serverless", region_name=REGION)

def lambda_handler(event, context):
    """
    Triggered by EventBridge (Daily) or manually.
    Event payload can override defaults:
    {
        "job_type": "scoring" | "training",
        "date": "YYYY-MM-DD" (optional, for scoring)
    }
    """
    job_type = event.get("job_type", "scoring")
    entry_point_args = []

    if job_type == "training":
        script_name = "train.py"
        job_name = "Tourism-Monthly-Training"
        # Training script uses a fixed historical path, so no arguments needed.
    else:
        script_name = "score.py"
        job_name = "Tourism-Daily-Scoring"
        # For scoring, determine the input path for the specific day's data.
        # Defaults to yesterday if no date is provided in the event.
        target_date_str = event.get("date", (datetime.date.today() - datetime.timedelta(days=1)).isoformat())
        input_path = f"s3://{BUCKET_NAME}/new-data/{target_date_str}/"
        entry_point_args = [input_path]
        print(f" Scoring job will use input path: {input_path}")

    print(f" Triggering EMR Job: {job_name}")

    response = client.start_job_run(
        applicationId=APPLICATION_ID,
        executionRoleArn=EXECUTION_ROLE_ARN,
        name=job_name,
        jobDriver={
            "sparkSubmit": {
                "entryPoint": f"s3://{BUCKET_NAME}/scripts/{script_name}",
                "entryPointArguments": entry_point_args,
                "sparkSubmitParameters": (
                    "--conf spark.executor.cores=2 "
                    "--conf spark.executor.memory=4g "
                    "--conf spark.driver.cores=2 "
                    "--conf spark.driver.memory=4g"
                )
            }
        }
    )
    
    job_run_id = response['jobRunId']
    print(f" Job Started. Run ID: {job_run_id}")
    
    return {
        "statusCode": 200,
        "body": f"Job Started. ID: {job_run_id}"
    }

# --- Local Testing Block ---
if __name__ == "__main__":
    # This block will only run when you execute the script directly
    # e.g., `python lambda_function.py train`

    if len(sys.argv) > 1:
        job_type_arg = sys.argv[1].lower() # 'train'/'training' or 'score'/'scoring'
        print(f"--- Running local test for job_type: {job_type_arg} ---")
        
        # Allow for shorthand 'train' to mean 'training'
        if job_type_arg == 'train':
            job_type_arg = 'training'

        # Construct the event object that the handler expects
        test_event = {"job_type": job_type_arg}
        
        # Call the handler
        lambda_handler(test_event, None)
    else:
        print("Usage: python lambda_function.py [training|scoring]")
