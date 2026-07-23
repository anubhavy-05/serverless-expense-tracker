import json, boto3, os
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
}

def lambda_handler(event, context):
    expense_id = event['pathParameters']['expenseId']
    body = json.loads(event['body'])
    update_expr = "SET "
    expr_values = {}
    for key in ['description', 'amount', 'category', 'date']:
        if key in body:
            update_expr += f"{key} = :{key}, "
            value = body[key]
            # Convert amount to Decimal for DynamoDB
            if key == 'amount':
                value = Decimal(str(value))
            expr_values[f":{key}"] = value
    update_expr = update_expr.rstrip(', ')
    table.update_item(
        Key={'expenseId': expense_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values
    )
    return {
        'statusCode': 200,
        'headers': CORS_HEADERS,
        'body': json.dumps({'message': 'Updated'})
    }