import json
import logging
import os
from decimal import Decimal, InvalidOperation

import boto3
import pymysql

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_secrets_client = boto3.client("secretsmanager")
_comprehend_client = boto3.client("comprehend")

_cached_secret = None
_connection = None


def _load_secret():
    global _cached_secret
    if _cached_secret:
        return _cached_secret

    secret_name = os.environ.get("DB_SECRET_NAME")
    if not secret_name:
        raise ValueError("DB_SECRET_NAME environment variable is required")

    response = _secrets_client.get_secret_value(SecretId=secret_name)
    secret_string = response.get("SecretString")
    if not secret_string and "SecretBinary" in response:
        secret_string = response["SecretBinary"].decode("utf-8")

    credentials = json.loads(secret_string)
    _cached_secret = credentials
    return credentials


def _get_connection():
    global _connection
    credentials = _load_secret()

    host = os.environ.get("DB_HOST")
    database = os.environ.get("DB_NAME", credentials.get("dbname"))
    port = int(os.environ.get("DB_PORT", 3306))

    if not host:
        raise ValueError("DB_HOST environment variable is required")

    if _connection and _connection.open:
        try:
            _connection.ping(reconnect=True)
            return _connection
        except pymysql.MySQLError:
            _connection = None

    _connection = pymysql.connect(
        host=host,
        user=credentials["username"],
        password=credentials["password"],
        database=database,
        port=port,
        connect_timeout=10,
        cursorclass=pymysql.cursors.DictCursor,
    )
    return _connection


def _detect_sentiment(text):
    if not text:
        return None
    snippet = text[:4500]
    try:
        response = _comprehend_client.detect_sentiment(Text=snippet, LanguageCode="en")
        return response.get("Sentiment")
    except Exception as err:  # pylint: disable=broad-except
        logger.warning("Sentiment analysis failed: %s", err)
        return None


def _coerce_rating(value):
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return int(max(1, min(5, round(float(value)))))
    try:
        parsed = float(value)
    except (TypeError, ValueError, InvalidOperation):
        return None
    return int(max(1, min(5, round(parsed))))


def _persist_review(record):
    connection = _get_connection()
    with connection.cursor() as cursor:
        rating = _coerce_rating(record.get("rating"))
        submitted_at = record.get("submitted_at")

        cursor.execute(
            """
            INSERT INTO review (place_id, place_name, address, rating, review_text, publish_time, author_name)
            VALUES (%s, %s, %s, %s, %s, COALESCE(%s, NOW()), %s)
            """,
            (
                record.get("place_id"),
                record.get("place_name"),
                record.get("address"),
                rating,
                record.get("review_text"),
                submitted_at,
                record.get("author_name") or "Anonymous",
            ),
        )
    connection.commit()


def lambda_handler(event, _context):
    records = event.get("Records", [])
    if not records:
        return {"processed": 0}

    processed = 0
    for message in records:
        try:
            body = message.get("body")
            if not body:
                continue
            data = json.loads(body)
            data.setdefault("rating", None)
            data.setdefault("author_name", "Anonymous")
            sentiment = _detect_sentiment(data.get("review_text"))
            if sentiment:
                logger.info(
                    "Detected sentiment %s for review on place %s", sentiment, data.get("place_id")
                )
            _persist_review(data)
            processed += 1
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("Failed to process review message: %s", exc)
            raise

    return {"processed": processed}
