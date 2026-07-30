import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from boto3.dynamodb.conditions import Key

from common import get_user_id, log, respond, table


def _median_abs_deviation(values):
    if not values:
        return Decimal("0")
    med = statistics.median(values)
    deviations = [abs(v - med) for v in values]
    return statistics.median(deviations)


def lambda_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    today = datetime.now(timezone.utc).date()
    window_start = today - timedelta(days=90)
    week_start = today - timedelta(days=7)

    # category -> {week_str: total}
    weekly_by_category = defaultdict(lambda: defaultdict(Decimal))

    kwargs = {
        "IndexName": "UserDateIndex",
        "KeyConditionExpression": Key("userId").eq(user_id) & Key("date").between(
            window_start.isoformat(), today.isoformat()
        ),
    }
    while True:
        page = table.query(**kwargs)
        for item in page.get("Items", []):
            date_str = item.get("date", "")
            category = item.get("category") or "General"
            amount = Decimal(str(item.get("amount", 0)))
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                continue
            week_key = (today - d).days // 7  # 0 = this week, 1 = last week, ...
            weekly_by_category[category][week_key] += amount
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    anomalies = []
    for category, weeks in weekly_by_category.items():
        current = float(weeks.get(0, Decimal("0")))
        history = [float(v) for k, v in weeks.items() if k != 0]
        if len(history) < 2:
            continue  # not enough history to judge

        med = statistics.median(history)
        mad = float(_median_abs_deviation(history)) or 1.0  # avoid divide by zero

        if med <= 0:
            continue

        deviation_ratio = (current - med) / med
        # Flag if meaningfully above the median AND above typical variance
        if current > med and abs(current - med) > 1.5 * mad and deviation_ratio > 0.3:
            anomalies.append({
                "category": category,
                "currentWeek": round(current, 2),
                "typicalWeek": round(med, 2),
                "percentAbove": round(deviation_ratio * 100, 1),
            })

    anomalies.sort(key=lambda a: a["percentAbove"], reverse=True)

    log("anomalies_computed", userId=user_id, flagged=len(anomalies))
    return respond(200, {"anomalies": anomalies})