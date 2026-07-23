import json, boto3, os
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    expense_id = event['pathParameters']['expenseId']
    body = json.loads(event['body'])
    update_expr = "SET "
    expr_values = {}
    for key in ['description', 'amount', 'category', 'date']:
        if key in body:
            update_expr += f"{key} = :{key}, "
            expr_values[f":{key}"] = body[key]
    update_expr = update_expr.rstrip(', ')
    table.update_item(Key={'expenseId': expense_id}, UpdateExpression=update_expr, ExpressionAttributeValues=expr_values)
    return {'statusCode': 200, 'body': json.dumps({'message': 'Updated'})}