import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from common import get_user_id, log, parse_date, respond, table


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
    if not amount.is_finite() or amount <= 0:
        return respond(400, {"error": "Amount must be greater than 0"})

    # `date` is the GSI sort key: it can't be empty, so default to today.
    raw_date = body.get("date")
    if raw_date in (None, ""):
        date = datetime.now(timezone.utc).date().isoformat()
    else:
        date = parse_date(raw_date)
        if not date:
            return respond(400, {"error": "Invalid date, expected YYYY-MM-DD"})

    item = {
        "userId": user_id,
        "expenseId": str(uuid.uuid4()),
        "description": str(body["description"])[:200],
        "amount": amount,
        "category": str(body.get("category") or "General")[:50],
        "date": date,
    }

    table.put_item(Item=item)
    log("expense_created", userId=user_id, expenseId=item["expenseId"])
    return respond(201, {"id": item["expenseId"]})