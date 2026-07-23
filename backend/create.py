import json
import boto3
import uuid
import os
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    print("Received event:", json.dumps(event))

    # Safely parse the request body
    body = {}
    if 'body' in event and event['body'] is not None:
        try:
            body = json.loads(event['body'])
        except json.JSONDecodeError:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Invalid JSON format'})
            }
    else:
        # Fallback for direct Lambda testing
        body = event

    # Validate required fields
    if 'description' not in body or 'amount' not in body:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Missing description or amount'})
        }

    # Convert amount to Decimal (DynamoDB requires this)
    try:
        amount_decimal = Decimal(str(body['amount']))
    except:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid amount value'})
        }

    # Build the item
    item = {
        'expenseId': str(uuid.uuid4()),
        'description': body['description'],
        'amount': amount_decimal,
        'category': body.get('category', 'General'),
        'date': body.get('date', '')
    }

    # Save to DynamoDB
    table.put_item(Item=item)

    return {
        'statusCode': 201,
        'body': json.dumps({'id': item['expenseId']})
    }