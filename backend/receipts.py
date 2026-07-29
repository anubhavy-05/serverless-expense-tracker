"""Receipt attachments: short-lived S3 presigned URLs, never public objects."""
import json
import os
import uuid

import boto3
from botocore.config import Config

from common import get_user_id, log, respond, table

BUCKET = os.environ["RECEIPTS_BUCKET"]
URL_TTL = 300
MAX_BYTES = 5 * 1024 * 1024

ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}

s3 = boto3.client("s3", config=Config(signature_version="s3v4"))


def _owned_expense(user_id, expense_id):
    return table.get_item(Key={"userId": user_id, "expenseId": expense_id}).get("Item")


def upload_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    expense_id = (event.get("pathParameters") or {}).get("expenseId")
    if not expense_id:
        return respond(400, {"error": "Missing expenseId"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON format"})

    content_type = body.get("contentType")
    if content_type not in ALLOWED_TYPES:
        return respond(400, {"error": "Unsupported file type"})

    size = body.get("size")
    if not isinstance(size, int) or size <= 0 or size > MAX_BYTES:
        return respond(400, {"error": "File must be between 1 byte and 5 MB"})

    if not _owned_expense(user_id, expense_id):
        return respond(404, {"error": "Not found"})

    key = f"users/{user_id}/{expense_id}/{uuid.uuid4()}{ALLOWED_TYPES[content_type]}"
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=URL_TTL,
    )

    table.update_item(
        Key={"userId": user_id, "expenseId": expense_id},
        UpdateExpression="SET receiptKey = :k, receiptType = :t",
        ExpressionAttributeValues={":k": key, ":t": content_type},
    )

    log("receipt_upload_url_issued", userId=user_id, expenseId=expense_id, key=key)
    return respond(200, {"uploadUrl": url, "key": key, "expiresIn": URL_TTL})


def download_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    expense_id = (event.get("pathParameters") or {}).get("expenseId")
    if not expense_id:
        return respond(400, {"error": "Missing expenseId"})

    item = _owned_expense(user_id, expense_id)
    if not item or not item.get("receiptKey"):
        return respond(404, {"error": "No receipt for this expense"})

    key = item["receiptKey"]
    if not key.startswith(f"users/{user_id}/"):
        return respond(403, {"error": "Forbidden"})

    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": key},
        ExpiresIn=URL_TTL,
    )
    log("receipt_download_url_issued", userId=user_id, expenseId=expense_id)
    return respond(200, {"downloadUrl": url, "expiresIn": URL_TTL})
