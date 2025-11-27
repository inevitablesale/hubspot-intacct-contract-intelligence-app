import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler, requestLogger } from './middleware';
import { logger } from './utils/logger';

// Import routes
import oauthRoutes from './routes/oauth';
import syncRoutes from './routes/sync';
import dashboardRoutes from './routes/dashboard';
import crmCardsRoutes from './routes/crmCards';
import timelineRoutes from './routes/timeline';
import propertiesRoutes from './routes/properties';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-HubSpot-Portal-Id', 'X-HubSpot-Signature'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// API routes
app.use('/oauth', oauthRoutes);
app.use('/sync', syncRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/crm-cards', crmCardsRoutes);
app.use('/timeline', timelineRoutes);
app.use('/properties', propertiesRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'HubSpot-Intacct Contract Intelligence App',
    description: 'Syncs Intacct contract and billing data, calculates renewal health scores, detects underbilling, and flags renewal risks',
    version: '1.0.0',
    endpoints: {
      oauth: {
        authorize: 'GET /oauth/authorize',
        callback: 'GET /oauth/callback',
        status: 'GET /oauth/status',
        refresh: 'POST /oauth/refresh',
      },
      sync: {
        contracts: 'POST /sync/contracts',
        invoices: 'POST /sync/invoices',
        subscriptions: 'POST /sync/subscriptions',
        full: 'POST /sync/full',
        status: 'GET /sync/status/:syncId',
      },
      dashboard: {
        metrics: 'GET /dashboard/metrics',
        trends: 'GET /dashboard/trends',
        healthScores: 'GET /dashboard/health-scores',
        upcomingRenewals: 'GET /dashboard/upcoming-renewals',
        atRiskContracts: 'GET /dashboard/at-risk-contracts',
        alerts: 'GET /dashboard/alerts',
        risks: 'GET /dashboard/risks',
        summary: 'GET /dashboard/summary',
      },
      crmCards: {
        contractInsights: 'GET /crm-cards/contract-insights',
        renewalHealth: 'GET /crm-cards/renewal-health',
        billingAlerts: 'GET /crm-cards/billing-alerts',
      },
      timeline: {
        contractSynced: 'POST /timeline/contract-synced',
        renewalRisk: 'POST /timeline/renewal-risk',
        underbillingAlert: 'POST /timeline/underbilling-alert',
        healthScoreChanged: 'POST /timeline/health-score-changed',
      },
      properties: {
        updateCompany: 'POST /properties/update-company',
        updateDeal: 'POST /properties/update-deal',
        syncContractToCompany: 'POST /properties/sync-contract-to-company',
        batchUpdate: 'POST /properties/batch-update-companies',
        createProperties: 'POST /properties/create-contract-properties',
      },
    },
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

// Start server
function startServer(): void {
  const port = config.port;
  app.listen(port, () => {
    logger.info(`Server started on port ${port}`, {
      environment: config.nodeEnv,
      port,
    });
  });
}

// Export for testing
export { app, startServer };
