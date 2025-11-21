import pymysql
import boto3
import json
import os
import datetime

# ---------- ENV VARS (set these in Lambda console) ----------
DB_HOST = os.environ["DB_HOST"]
DB_USER = os.environ["DB_USER"]
DB_PASS = os.environ["DB_PASS"]
DB_NAME = os.environ["DB_NAME"]
# ------------------------------------------------------------

BUCKET = "cloud-2006-bucket-vf6xtl9u"   # your data lake bucket

s3 = boto3.client("s3")

def lambda_handler(event, context):
    """
    Export all reviews for *yesterday* from RDS -> S3 as NDJSON.
    Output key: new-data/YYYY-MM-DD/reviews.json
    """
    # Yesterday's date (local Lambda time)
    yesterday = datetime.date.today() - datetime.timedelta(days=1)
    yesterday_str = yesterday.isoformat()  # 'YYYY-MM-DD'

    print(f"Exporting reviews for date: {yesterday_str}")

    # NOTE:
    # publish_time is TEXT but should be like 'YYYY-MM-DD ...'
    # DATE(publish_time) extracts the date portion.
    sql = """
        SELECT
            place_id AS location_id,
            CONCAT(
                place_id, '_',
                publish_time, '_',
                COALESCE(account_id, 'anon')
            ) AS review_id,
            review_text,
            publish_time
        FROM review
        WHERE DATE(publish_time) = %s
    """

    conn = pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME
    )

    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(sql, (yesterday_str,))
            rows = cursor.fetchall()

        if not rows:
            msg = f"No reviews found for {yesterday_str}."
            print(msg)
            return {"statusCode": 200, "body": msg}

        # NDJSON: one JSON object per line
        body = "\n".join(json.dumps(r) for r in rows)
        key = f"new-data/{yesterday_str}/reviews.json"

        s3.put_object(
            Bucket=BUCKET,
            Key=key,
            Body=body.encode("utf-8")
        )

        msg = f"Uploaded {len(rows)} reviews to s3://{BUCKET}/{key}"
        print(msg)
        return {"statusCode": 200, "body": msg}

    finally:
        conn.close()