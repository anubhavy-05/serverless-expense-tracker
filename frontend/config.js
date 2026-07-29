// ════════════════════════════════════════════════════════════
// Paste your `sam deploy` stack outputs here. Nothing else in the
// frontend should ever hardcode an AWS URL or ID.
// ════════════════════════════════════════════════════════════
window.APP_CONFIG = {
  API_URL: 'https://0826o4e1yh.execute-api.us-east-1.amazonaws.com/prod',
  COGNITO_DOMAIN: 'https://expense-tracker-264621615760.auth.us-east-1.amazoncognito.com',
  CLIENT_ID: '3i417gkrinqhjigm4tniv6etim',
  REDIRECT_URI: window.location.origin + '/index.html',
};
