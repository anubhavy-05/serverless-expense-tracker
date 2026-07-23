import json, boto3, os
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    expense_id = event['pathParameters']['expenseId']
    response = table.get_item(Key={'expenseId': expense_id})
    item = response.get('Item')
    if item:
        return {'statusCode': 200, 'body': json.dumps(item)}
    return {'statusCode': 404, 'body': json.dumps({'error': 'Not found'})}