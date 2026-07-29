import json
from decimal import Decimal, InvalidOperation

from botocore.exceptions import ClientError

from common import get_user_id, log, respond, table

EDITABLE = ["description", "amount", "category", "date"]


def lambda_handler(event, context):
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

    parts, names, values = [], {}, {}
    for key in EDITABLE:
        if key not in body:
            continue
        value = body[key]
        if key == "amount":
            try:
                value = Decimal(str(value))
            except (InvalidOperation, TypeError, ValueError):
                return respond(400, {"error": "Invalid amount value"})
        parts.append(f"#{key} = :{key}")
        names[f"#{key}"] = key  # names are reserved-word safe (e.g. "date")
        values[f":{key}"] = value

    if not parts:
        return respond(400, {"error": "No updatable fields provided"})

    try:
        table.update_item(
            Key={"userId": user_id, "expenseId": expense_id},
            UpdateExpression="SET " + ", ".join(parts),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ConditionExpression="attribute_exists(expenseId)",
        )
    except ClientError as err:
        if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(404, {"error": "Not found"})
        raise

    log("expense_updated", userId=user_id, expenseId=expense_id)
    return respond(200, {"message": "Updated"})