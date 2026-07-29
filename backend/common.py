"""Shared helpers: identity extraction, JSON responses, structured logging."""
import json
import logging
import os
from decimal import Decimal

import boto3

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = logging.getLogger()
logger.setLevel(LOG_LEVEL)

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def log(event_name, **fields):
    """Structured JSON log line - queryable in CloudWatch Logs Insights."""
    logger.info(json.dumps({"event": event_name, **fields}))


def respond(status, payload):
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(payload, cls=DecimalEncoder),
    }


def get_user_id(event):
    """The ONLY source of truth for identity: the verified Cognito JWT claims.

    API Gateway has already validated the token signature before we run,
    so `sub` here cannot be forged by the client.
    """
    try:
        return event["requestContext"]["authorizer"]["claims"]["sub"]
    except (KeyError, TypeError):
        return None
