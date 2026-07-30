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

    # category -> total amount
    category_totals = defaultdict(lambda: Decimal("0"))
    grand_total = Decimal("0")

    kwargs = {
        "IndexName": "UserDateIndex",
        "KeyConditionExpression": Key("userId").eq(user_id) & Key("date").between(start_date, end_date),
    }
    while True:
        page = table.query(**kwargs)
        for item in page.get("Items", []):
            category = item.get("category") or "General"
            amount = Decimal(str(item.get("amount", 0)))
            category_totals[category] += amount
            grand_total += amount
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    # Two-hop flow: Income -> Category -> Spent
    nodes = [{"name": "Income"}]
    links = []
    for category, total in category_totals.items():
        nodes.append({"name": category})
        links.append({
            "source": "Income",
            "target": category,
            "value": float(total),
        })

    log("sankey_computed", userId=user_id, categories=len(category_totals))
    return respond(200, {
        "nodes": nodes,
        "links": links,
        "total": float(grand_total),
    })