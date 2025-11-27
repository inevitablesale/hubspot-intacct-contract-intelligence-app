import { Router, Request, Response } from 'express';
import { dashboardService } from '../services/dashboardService';
import { syncService } from '../services/syncService';
import { underbillingDetector } from '../services/underbillingDetector';
import { renewalRiskService } from '../services/renewalRisk';

const router = Router();

/**
 * GET /dashboard/metrics
 * Get overview metrics for dashboard
 */
router.get('/metrics', (_req: Request, res: Response) => {
  try {
    const metrics = dashboardService.getMetrics();
    res.json(metrics);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

/**
 * GET /dashboard/trends
 * Get contract trends over time
 */
router.get('/trends', (req: Request, res: Response) => {
  try {
    const months = parseInt(req.query.months as string) || 6;
    const trends = dashboardService.getContractTrends(months);
    res.json(trends);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get trends' });
  }
});

/**
 * GET /dashboard/health-distribution
 * Get health score distribution
 */
router.get('/health-distribution', (_req: Request, res: Response) => {
  try {
    const distribution = dashboardService.getHealthScoreDistribution();
    res.json(distribution);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get health distribution' });
  }
});

/**
 * GET /dashboard/upcoming-renewals
 * Get upcoming renewals with health scores
 */
router.get('/upcoming-renewals', (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const renewals = dashboardService.getUpcomingRenewals(days);
    res.json(renewals);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get upcoming renewals' });
  }
});

/**
 * GET /dashboard/at-risk-contracts
 * Get top at-risk contracts
 */
router.get('/at-risk-contracts', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const contracts = dashboardService.getTopAtRiskContracts(limit);
    res.json(contracts);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get at-risk contracts' });
  }
});

/**
 * GET /dashboard/underbilling
 * Get underbilling summary
 */
router.get('/underbilling', (_req: Request, res: Response) => {
  try {
    const summary = dashboardService.getUnderbillingSummary();
    res.json(summary);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get underbilling summary' });
  }
});

/**
 * GET /dashboard/renewal-risks
 * Get renewal risk summary
 */
router.get('/renewal-risks', (_req: Request, res: Response) => {
  try {
    const summary = dashboardService.getRenewalRiskSummary();
    res.json(summary);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get renewal risk summary' });
  }
});

/**
 * GET /dashboard/customer-health
 * Get customer health overview
 */
router.get('/customer-health', (_req: Request, res: Response) => {
  try {
    const overview = dashboardService.getCustomerHealthOverview();
    res.json(overview);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get customer health overview' });
  }
});

/**
 * GET /dashboard/health-scores
 * Get all health scores
 */
router.get('/health-scores', (_req: Request, res: Response) => {
  try {
    const scores = syncService.getAllHealthScores();
    res.json({
      count: scores.length,
      scores,
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get health scores' });
  }
});

/**
 * GET /dashboard/health-scores/:contractId
 * Get health score for specific contract
 */
router.get('/health-scores/:contractId', (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const score = syncService.getHealthScore(contractId);
    
    if (!score) {
      res.status(404).json({ error: 'Health score not found' });
      return;
    }
    
    res.json(score);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get health score' });
  }
});

/**
 * GET /dashboard/alerts
 * Get all underbilling alerts
 */
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const resolved = req.query.resolved === 'true';
    const alerts = resolved 
      ? underbillingDetector.getAlerts()
      : underbillingDetector.getUnresolvedAlerts();
    
    res.json({
      count: alerts.length,
      alerts,
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

/**
 * POST /dashboard/alerts/:alertId/resolve
 * Resolve an underbilling alert
 */
router.post('/alerts/:alertId/resolve', (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const success = underbillingDetector.resolveAlert(alertId);
    
    if (!success) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    
    res.json({ success: true, message: 'Alert resolved' });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

/**
 * GET /dashboard/risks
 * Get all renewal risks
 */
router.get('/risks', (req: Request, res: Response) => {
  try {
    const active = req.query.active !== 'false';
    const risks = active 
      ? renewalRiskService.getActiveRisks()
      : renewalRiskService.getRisks();
    
    res.json({
      count: risks.length,
      risks,
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get risks' });
  }
});

/**
 * POST /dashboard/risks/:riskId/status
 * Update renewal risk status
 */
router.post('/risks/:riskId/status', (req: Request, res: Response) => {
  try {
    const { riskId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }
    
    const success = renewalRiskService.updateRiskStatus(riskId, status);
    
    if (!success) {
      res.status(404).json({ error: 'Risk not found' });
      return;
    }
    
    res.json({ success: true, message: 'Risk status updated' });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to update risk status' });
  }
});

/**
 * GET /dashboard/summary
 * Get complete dashboard summary
 */
router.get('/summary', (_req: Request, res: Response) => {
  try {
    const metrics = dashboardService.getMetrics();
    const healthDistribution = dashboardService.getHealthScoreDistribution();
    const underbillingSummary = dashboardService.getUnderbillingSummary();
    const riskSummary = dashboardService.getRenewalRiskSummary();
    const upcomingRenewals = dashboardService.getUpcomingRenewals(30);
    const atRiskContracts = dashboardService.getTopAtRiskContracts(5);

    res.json({
      metrics,
      healthDistribution,
      underbillingSummary,
      riskSummary,
      upcomingRenewals: upcomingRenewals.slice(0, 5),
      atRiskContracts,
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to get dashboard summary' });
  }
});

export default router;
