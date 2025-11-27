import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // HubSpot
  hubspot: {
    clientId: process.env.HUBSPOT_CLIENT_ID || '',
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
    redirectUri: process.env.HUBSPOT_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.companies.read',
      'crm.objects.companies.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'timeline',
    ],
    appId: process.env.HUBSPOT_APP_ID || '',
  },

  // Intacct
  intacct: {
    companyId: process.env.INTACCT_COMPANY_ID || '',
    userId: process.env.INTACCT_USER_ID || '',
    userPassword: process.env.INTACCT_USER_PASSWORD || '',
    senderId: process.env.INTACCT_SENDER_ID || '',
    senderPassword: process.env.INTACCT_SENDER_PASSWORD || '',
    endpoint: process.env.INTACCT_ENDPOINT || 'https://api.intacct.com/ia/xml/xmlgw.phtml',
  },

  // Database (for token storage)
  database: {
    url: process.env.DATABASE_URL || 'sqlite::memory:',
  },

  // Renewal Scoring Configuration
  scoring: {
    invoiceOverdueWeight: 0.25,
    usageDeclineWeight: 0.20,
    supportTicketWeight: 0.15,
    contractValueWeight: 0.15,
    renewalProximityWeight: 0.25,
    riskThreshold: 60,
    criticalThreshold: 40,
  },

  // Sync Configuration
  sync: {
    batchSize: 100,
    intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '60', 10),
  },
};
