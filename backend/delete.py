import json, boto3, os
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    expense_id = event['pathParameters']['expenseId']
    table.delete_item(Key={'expenseId': expense_id})
    return {'statusCode': 200, 'body': json.dumps({'message': 'Deleted'})}