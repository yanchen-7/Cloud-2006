import os
import io
import csv
import json
import datetime as dt
import boto3

# PyMySQL must be provided by a Lambda Layer specified via clicks_export_pymysql_layer_arn
try:
    import pymysql
except Exception as e:
    pymysql = None

s3 = boto3.client("s3")


def _yesterday_str():
    # Use UTC date for simplicity; MySQL query will filter by CURDATE() at server timezone
    y = dt.datetime.utcnow().date() - dt.timedelta(days=1)
    return y.strftime("%Y-%m-%d")


def handler(event, context):
    bucket = os.environ["DATA_BUCKET"]
    # Prefer Secrets Manager if provided
    secret_name = os.environ.get("DB_SECRET_NAME")
    db_host = os.environ.get("DB_HOST", "")
    db_port = int(os.environ.get("DB_PORT", "3306"))
    db_user = os.environ.get("DB_USER", "")
    db_pass = os.environ.get("DB_PASSWORD", "")
    db_name = os.environ.get("DB_NAME", "")

    if secret_name:
        sm = boto3.client("secretsmanager")
        resp = sm.get_secret_value(SecretId=secret_name)
        payload = resp.get("SecretString") or (resp.get("SecretBinary") and resp["SecretBinary"].decode("utf-8"))
        data = json.loads(payload)
        db_host = data.get("host", db_host)
        db_port = int(data.get("port", db_port))
        # Accept either user/username and db/dbname keys
        db_user = data.get("user", data.get("username", db_user))
        db_pass = data.get("password", db_pass)
        db_name = data.get("db", data.get("dbname", db_name))

    if not pymysql:
        return {"statusCode": 500, "body": json.dumps({"error": "pymysql not available; attach a layer and redeploy"})}
    if not (db_host and db_user and db_pass and db_name):
        return {"statusCode": 400, "body": json.dumps({"error": "DB connection env vars are required"})}

    run_date = _yesterday_str()
    key = f"raw/interactions/date={run_date}/interactions.csv"

    sql = (
        "SELECT CAST(account_id AS CHAR) AS user_id, "
        "       place_id AS item_id, "
        "       UNIX_TIMESTAMP(clicked_at) AS timestamp, "
        "       'CLICK' AS event_type "
        "FROM clicks "
        "WHERE clicked_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) "
        "  AND clicked_at < CURDATE() "
        "  AND account_id IS NOT NULL "
        "  AND place_id IS NOT NULL"
    )

    # Stream rows to S3 via in-memory buffer (OK for moderate daily volumes)
    conn = pymysql.connect(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_pass,
        db=db_name,
        cursorclass=pymysql.cursors.SSCursor,
        read_timeout=120,
        write_timeout=120,
        connect_timeout=10,
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["user_id", "item_id", "timestamp", "event_type"])  # header

    rows_written = 0
    with conn.cursor() as cur:
        cur.execute(sql)
        fetch_sz = 5000
        while True:
            rows = cur.fetchmany(fetch_sz)
            if not rows:
                break
            writer.writerows(rows)
            rows_written += len(rows)

    conn.close()

    data = buf.getvalue().encode("utf-8")
    s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType="text/csv")

    return {"statusCode": 200, "body": json.dumps({"run_date": run_date, "rows": rows_written, "s3_key": key})}
