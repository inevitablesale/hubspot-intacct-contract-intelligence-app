// Jest setup file
process.env.NODE_ENV = 'test';
process.env.HUBSPOT_CLIENT_ID = 'test-client-id';
process.env.HUBSPOT_CLIENT_SECRET = 'test-client-secret';
process.env.HUBSPOT_REDIRECT_URI = 'http://localhost:3000/oauth/callback';
process.env.HUBSPOT_APP_ID = 'test-app-id';
process.env.INTACCT_COMPANY_ID = 'test-company';
process.env.INTACCT_USER_ID = 'test-user';
process.env.INTACCT_USER_PASSWORD = 'test-password';
process.env.INTACCT_SENDER_ID = 'test-sender';
process.env.INTACCT_SENDER_PASSWORD = 'test-sender-password';

// Increase timeout for async tests
jest.setTimeout(10000);
