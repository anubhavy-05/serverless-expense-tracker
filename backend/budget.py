import os
import json
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from common import log

EXPENSES_TABLE = os.environ["EXPENSES_TABLE"]
SETTINGS_TABLE = os.environ["SETTINGS_TABLE"]
TOPIC_ARN = os.environ["BUDGET_TOPIC_ARN"]
DEFAULT_BUDGET = Decimal(str(os.environ.get("DEFAULT_BUDGET", "500")))

dynamodb = boto3.resource("dynamodb")
expenses_table = dynamodb.Table(EXPENSES_TABLE)
settings_table = dynamodb.Table(SETTINGS_TABLE)
sns = boto3.client("sns")


def lambda_handler(event, context):
    now = datetime.now(timezone.utc)
    month_prefix = now.strftime("%Y-%m")

    # 1. Scan expenses for current month, aggregate per userId
    total_spend = {}  # userId -> Decimal sum
    last_key = None
    while True:
        kwargs = {
            "TableName": EXPENSES_TABLE,
            "ProjectionExpression": "userId, amount, #d",
            "ExpressionAttributeNames": {"#d": "date"},
        }
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        response = expenses_table.scan(**kwargs)
        for item in response.get("Items", []):
            date_str = item.get("date", "")
            if date_str.startswith(month_prefix):
                uid = item["userId"]
                amount = Decimal(str(item.get("amount", 0)))
                total_spend[uid] = total_spend.get(uid, Decimal("0")) + amount
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break

    # 2. For each user, get their budget from settings
    for uid, total in total_spend.items():
        # Fetch user settings
        settings_resp = settings_table.get_item(Key={"userId": uid})
        settings = settings_resp.get("Item", {})
        budget = Decimal(str(settings.get("monthlyBudget", DEFAULT_BUDGET)))

        if total > budget:
            message = (
                f"Budget alert: Your total spend this month is ₹{total:.2f}, "
                f"which exceeds your budget of ₹{budget:.2f}."
            )
            subject = f"Expense Tracker Budget Alert - {month_prefix}"
            try:
                sns.publish(
                    TopicArn=TOPIC_ARN,
                    Subject=subject,
                    Message=message
                )
                log("budget_alert_sent", userId=uid, total=float(total), budget=float(budget))
            except Exception as e:
                log("budget_alert_failed", userId=uid, error=str(e))

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Budget check completed",
            "users_checked": len(total_spend)
        })
    }