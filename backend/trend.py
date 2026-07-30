from collections import defaultdict
from decimal import Decimal

from boto3.dynamodb.conditions import Key

from common import get_user_id, log, respond, table


def lambda_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    qs = event.get("queryStringParameters") or {}
    start_date = qs.get("start", "")
    end_date = qs.get("end", "9999-99-99")

    daily_totals = defaultdict(lambda: Decimal("0"))
    kwargs = {
        "IndexName": "UserDateIndex",
        "KeyConditionExpression": Key("userId").eq(user_id) & Key("date").between(start_date, end_date),
    }
    while True:
        page = table.query(**kwargs)
        for item in page.get("Items", []):
            date = item.get("date", "")
            amount = Decimal(str(item.get("amount", 0)))
            daily_totals[date] += amount
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    series = [{"date": d, "amount": float(total)} for d, total in sorted(daily_totals.items())]

    log("trend_computed", userId=user_id, points=len(series))
    return respond(200, {"series": series})