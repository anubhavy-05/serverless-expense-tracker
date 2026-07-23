import json, boto3, os
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
}

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

def lambda_handler(event, context):
    expense_id = event['pathParameters']['expenseId']
    response = table.get_item(Key={'expenseId': expense_id})
    item = response.get('Item')
    if item:
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps(item, cls=DecimalEncoder)
        }
    return {
        'statusCode': 404,
        'headers': CORS_HEADERS,
        'body': json.dumps({'error': 'Not found'})
    }