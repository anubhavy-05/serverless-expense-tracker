import json, boto3, os

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
}

def lambda_handler(event, context):
    expense_id = event['pathParameters']['expenseId']
    table.delete_item(Key={'expenseId': expense_id})
    return {
        'statusCode': 200,
        'headers': CORS_HEADERS,
        'body': json.dumps({'message': 'Deleted'})
    }