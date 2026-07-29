from boto3.dynamodb.conditions import Key

from common import get_user_id, log, respond, table


def lambda_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    # Query, not Scan: only this user's partition is ever read.
    items = []
    kwargs = {"KeyConditionExpression": Key("userId").eq(user_id)}
    while True:
        page = table.query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    log("expenses_listed", userId=user_id, count=len(items))
    return respond(200, items)
