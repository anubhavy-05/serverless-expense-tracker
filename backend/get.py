from common import get_user_id, respond, table


def lambda_handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    expense_id = (event.get("pathParameters") or {}).get("expenseId")
    if not expense_id:
        return respond(400, {"error": "Missing expenseId"})

    # Composite key: guessing someone else's expenseId returns nothing.
    item = table.get_item(Key={"userId": user_id, "expenseId": expense_id}).get("Item")
    if not item:
        return respond(404, {"error": "Not found"})
    return respond(200, item)
