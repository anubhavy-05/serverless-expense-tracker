import json
from decimal import Decimal

from common import get_user_id, respond, table  # table is now from common? We need to use the settings table.
import os
import boto3

SETTINGS_TABLE = os.environ["SETTINGS_TABLE"]
dynamodb = boto3.resource("dynamodb")
settings_table = dynamodb.Table(SETTINGS_TABLE)

def get_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    # Get the user's settings (if any)
    resp = settings_table.get_item(Key={"userId": user_id})
    item = resp.get("Item")
    if not item:
        # Return default budget (will be used client-side)
        return respond(200, {"monthlyBudget": None})  # Let client know not set
    return respond(200, {
        "monthlyBudget": float(item.get("monthlyBudget", 0))
    })

def update_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON"})

    monthly_budget = body.get("monthlyBudget")
    if monthly_budget is None:
        return respond(400, {"error": "monthlyBudget is required"})

    try:
        budget_val = Decimal(str(monthly_budget))
        if budget_val < 0:
            raise ValueError
    except:
        return respond(400, {"error": "monthlyBudget must be a non-negative number"})

    # Upsert
    settings_table.put_item(
        Item={
            "userId": user_id,
            "monthlyBudget": budget_val
        }
    )
    return respond(200, {"message": "Settings updated", "monthlyBudget": float(budget_val)})