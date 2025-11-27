import request from 'supertest';
import { app } from '../../src/app';

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('GET /health should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Root Endpoint', () => {
    it('GET / should return API documentation', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('HubSpot-Intacct Contract Intelligence App');
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.endpoints.oauth).toBeDefined();
      expect(response.body.endpoints.sync).toBeDefined();
      expect(response.body.endpoints.dashboard).toBeDefined();
    });
  });

  describe('OAuth Endpoints', () => {
    it('GET /oauth/authorize should redirect to HubSpot', async () => {
      const response = await request(app).get('/oauth/authorize');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('app.hubspot.com/oauth/authorize');
    });

    it('GET /oauth/callback without code should return 400', async () => {
      const response = await request(app).get('/oauth/callback');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing authorization code');
    });

    it('GET /oauth/status without portalId should return 400', async () => {
      const response = await request(app).get('/oauth/status');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Portal ID is required');
    });

    it('GET /oauth/status with unknown portalId should return not connected', async () => {
      const response = await request(app).get('/oauth/status?portalId=unknown');

      expect(response.status).toBe(200);
      expect(response.body.connected).toBe(false);
    });
  });

  describe('Sync Endpoints', () => {
    it('POST /sync/contracts without portalId should return 400', async () => {
      const response = await request(app).post('/sync/contracts');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Portal ID is required');
    });

    it('POST /sync/invoices without portalId should return 400', async () => {
      const response = await request(app).post('/sync/invoices');

      expect(response.status).toBe(400);
    });

    it('POST /sync/subscriptions without portalId should return 400', async () => {
      const response = await request(app).post('/sync/subscriptions');

      expect(response.status).toBe(400);
    });

    it('GET /sync/status/:syncId with invalid ID should return 404', async () => {
      const response = await request(app).get('/sync/status/invalid-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Sync status not found');
    });

    it('GET /sync/statuses should return array', async () => {
      const response = await request(app).get('/sync/statuses');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /sync/contracts should return contracts list', async () => {
      const response = await request(app).get('/sync/contracts');

      expect(response.status).toBe(200);
      expect(response.body.count).toBeDefined();
      expect(Array.isArray(response.body.contracts)).toBe(true);
    });
  });

  describe('Dashboard Endpoints', () => {
    it('GET /dashboard/metrics should return metrics', async () => {
      const response = await request(app).get('/dashboard/metrics');

      expect(response.status).toBe(200);
      expect(response.body.totalContracts).toBeDefined();
      expect(response.body.activeContracts).toBeDefined();
      expect(response.body.averageHealthScore).toBeDefined();
    });

    it('GET /dashboard/trends should return trends', async () => {
      const response = await request(app).get('/dashboard/trends');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /dashboard/trends with custom months', async () => {
      const response = await request(app).get('/dashboard/trends?months=3');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeLessThanOrEqual(3);
    });

    it('GET /dashboard/health-distribution should return distribution', async () => {
      const response = await request(app).get('/dashboard/health-distribution');

      expect(response.status).toBe(200);
      expect(response.body.excellent).toBeDefined();
      expect(response.body.good).toBeDefined();
      expect(response.body.fair).toBeDefined();
      expect(response.body.poor).toBeDefined();
      expect(response.body.critical).toBeDefined();
    });

    it('GET /dashboard/upcoming-renewals should return renewals', async () => {
      const response = await request(app).get('/dashboard/upcoming-renewals');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /dashboard/at-risk-contracts should return contracts', async () => {
      const response = await request(app).get('/dashboard/at-risk-contracts');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /dashboard/summary should return complete summary', async () => {
      const response = await request(app).get('/dashboard/summary');

      expect(response.status).toBe(200);
      expect(response.body.metrics).toBeDefined();
      expect(response.body.healthDistribution).toBeDefined();
      expect(response.body.underbillingSummary).toBeDefined();
      expect(response.body.riskSummary).toBeDefined();
    });

    it('GET /dashboard/health-scores should return scores list', async () => {
      const response = await request(app).get('/dashboard/health-scores');

      expect(response.status).toBe(200);
      expect(response.body.count).toBeDefined();
      expect(Array.isArray(response.body.scores)).toBe(true);
    });

    it('GET /dashboard/alerts should return alerts list', async () => {
      const response = await request(app).get('/dashboard/alerts');

      expect(response.status).toBe(200);
      expect(response.body.count).toBeDefined();
      expect(Array.isArray(response.body.alerts)).toBe(true);
    });

    it('GET /dashboard/risks should return risks list', async () => {
      const response = await request(app).get('/dashboard/risks');

      expect(response.status).toBe(200);
      expect(response.body.count).toBeDefined();
      expect(Array.isArray(response.body.risks)).toBe(true);
    });
  });

  describe('CRM Card Endpoints', () => {
    it('GET /crm-cards/contract-insights without params should return 400', async () => {
      const response = await request(app).get('/crm-cards/contract-insights');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required parameters');
    });

    it('GET /crm-cards/contract-insights with params should return card data', async () => {
      const response = await request(app).get('/crm-cards/contract-insights')
        .query({
          associatedObjectId: '123',
          associatedObjectType: 'COMPANY',
          portalId: 'test-portal',
        });

      expect(response.status).toBe(200);
      expect(response.body.results).toBeDefined();
    });

    it('GET /crm-cards/renewal-health without params should return 400', async () => {
      const response = await request(app).get('/crm-cards/renewal-health');

      expect(response.status).toBe(400);
    });

    it('GET /crm-cards/billing-alerts with params should return card data', async () => {
      const response = await request(app).get('/crm-cards/billing-alerts')
        .query({
          associatedObjectId: '123',
          associatedObjectType: 'COMPANY',
          portalId: 'test-portal',
        });

      expect(response.status).toBe(200);
      expect(response.body.results).toBeDefined();
    });
  });

  describe('Timeline Endpoints', () => {
    it('POST /timeline/contract-synced without portalId should return 400', async () => {
      const response = await request(app)
        .post('/timeline/contract-synced')
        .send({ contractId: '123', companyId: '456' });

      expect(response.status).toBe(400);
    });

    it('POST /timeline/contract-synced without required fields should return 400', async () => {
      const response = await request(app)
        .post('/timeline/contract-synced')
        .set('X-HubSpot-Portal-Id', 'test-portal')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Contract ID and Company ID are required');
    });
  });

  describe('Properties Endpoints', () => {
    it('POST /properties/update-company without portalId should return 400', async () => {
      const response = await request(app)
        .post('/properties/update-company')
        .send({ companyId: '123', properties: {} });

      expect(response.status).toBe(400);
    });

    it('POST /properties/update-company without required fields should return 400', async () => {
      const response = await request(app)
        .post('/properties/update-company')
        .set('X-HubSpot-Portal-Id', 'test-portal')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Company ID and properties are required');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });
  });
});
