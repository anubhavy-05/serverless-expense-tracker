import os

import boto3
from botocore.exceptions import ClientError

from common import get_user_id, log, respond, table

RECEIPTS_BUCKET = os.environ.get("RECEIPTS_BUCKET")
s3 = boto3.client("s3")


def lambda_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    expense_id = (event.get("pathParameters") or {}).get("expenseId")
    if not expense_id:
        return respond(400, {"error": "Missing expenseId"})

    try:
        result = table.delete_item(
            Key={"userId": user_id, "expenseId": expense_id},
            ConditionExpression="attribute_exists(expenseId)",
            ReturnValues="ALL_OLD",
        )
    except ClientError as err:
        if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(404, {"error": "Not found"})
        raise

    receipt_key = (result.get("Attributes") or {}).get("receiptKey")
    if receipt_key and RECEIPTS_BUCKET and receipt_key.startswith(f"users/{user_id}/"):
        try:
            s3.delete_object(Bucket=RECEIPTS_BUCKET, Key=receipt_key)
        except ClientError as err:
            log("receipt_cleanup_failed", userId=user_id, error=str(err))

    log("expense_deleted", userId=user_id, expenseId=expense_id)
    return respond(200, {"message": "Deleted"})
