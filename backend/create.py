import json, boto3, uuid, os
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    body = json.loads(event['body'])
    item = {
        'expenseId': str(uuid.uuid4()),
        'description': body['description'],
        'amount': float(body['amount']),
        'category': body.get('category', 'General'),
        'date': body.get('date', '')
    }
    table.put_item(Item=item)
    return {'statusCode': 201, 'body': json.dumps({'id': item['expenseId']})}