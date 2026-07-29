import json
import uuid
from decimal import Decimal, InvalidOperation

from common import get_user_id, log, respond, table


def lambda_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON format"})

    if "description" not in body or "amount" not in body:
        return respond(400, {"error": "Missing description or amount"})

    try:
        amount = Decimal(str(body["amount"]))
    except (InvalidOperation, TypeError, ValueError):
        return respond(400, {"error": "Invalid amount value"})

    item = {
        "userId": user_id,
        "expenseId": str(uuid.uuid4()),
        "description": str(body["description"])[:200],
        "amount": amount,
        "category": body.get("category", "General"),
        "date": body.get("date", ""),   # ✅ always present (empty string if omitted)
    }

    table.put_item(Item=item)
    log("expense_created", userId=user_id, expenseId=item["expenseId"])
    return respond(201, {"id": item["expenseId"]})