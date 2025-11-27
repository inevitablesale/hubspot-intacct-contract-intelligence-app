import { Router, Request, Response } from 'express';
import { createHubSpotClient } from '../clients/hubspot';
import { syncService } from '../services/syncService';
import { validatePortalId, validateHubSpotSignature } from '../middleware';
import { logger } from '../utils/logger';
import { formatCurrency } from '../utils/helpers';

const router = Router();

/**
 * POST /timeline/contract-synced
 * Create timeline event when contract is synced
 */
router.post('/contract-synced', validatePortalId, async (req: Request, res: Response) => {
  const { contractId, companyId } = req.body;

  if (!contractId || !companyId) {
    res.status(400).json({ error: 'Contract ID and Company ID are required' });
    return;
  }

  try {
    const contract = syncService.getContractById(contractId);
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const success = await hubspotClient.createTimelineEvent({
      eventTemplateId: 'contract_synced',
      objectId: companyId,
      tokens: {
        contractNumber: contract.contractNumber,
        value: formatCurrency(contract.totalValue, contract.currency),
        status: contract.status,
        renewalDate: contract.renewalDate.toISOString().split('T')[0],
      },
    });

    if (success) {
      res.json({ success: true, message: 'Timeline event created' });
    } else {
      res.status(500).json({ error: 'Failed to create timeline event' });
    }
  } catch (error) {
    logger.error('Failed to create contract synced timeline event', { error });
    res.status(500).json({ error: 'Failed to create timeline event' });
  }
});

/**
 * POST /timeline/renewal-risk
 * Create timeline event for renewal risk detection
 */
router.post('/renewal-risk', validatePortalId, async (req: Request, res: Response) => {
  const { contractId, companyId, riskLevel, score, factors } = req.body;

  if (!contractId || !companyId) {
    res.status(400).json({ error: 'Contract ID and Company ID are required' });
    return;
  }

  try {
    const contract = syncService.getContractById(contractId);
    
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const success = await hubspotClient.createTimelineEvent({
      eventTemplateId: 'renewal_risk_detected',
      objectId: companyId,
      tokens: {
        contractNumber: contract?.contractNumber || contractId,
        riskLevel: riskLevel || 'unknown',
        score: score || 0,
        factors: factors || 'Not specified',
      },
    });

    if (success) {
      res.json({ success: true, message: 'Timeline event created' });
    } else {
      res.status(500).json({ error: 'Failed to create timeline event' });
    }
  } catch (error) {
    logger.error('Failed to create renewal risk timeline event', { error });
    res.status(500).json({ error: 'Failed to create timeline event' });
  }
});

/**
 * POST /timeline/underbilling-alert
 * Create timeline event for underbilling detection
 */
router.post('/underbilling-alert', validatePortalId, async (req: Request, res: Response) => {
  const { alertId, companyId, alertType, expected, actual, amount } = req.body;

  if (!alertId || !companyId) {
    res.status(400).json({ error: 'Alert ID and Company ID are required' });
    return;
  }

  try {
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const success = await hubspotClient.createTimelineEvent({
      eventTemplateId: 'underbilling_alert',
      objectId: companyId,
      tokens: {
        amount: formatCurrency(amount || 0),
        alertType: alertType || 'unknown',
        expected: formatCurrency(expected || 0),
        actual: formatCurrency(actual || 0),
      },
    });

    if (success) {
      res.json({ success: true, message: 'Timeline event created' });
    } else {
      res.status(500).json({ error: 'Failed to create timeline event' });
    }
  } catch (error) {
    logger.error('Failed to create underbilling alert timeline event', { error });
    res.status(500).json({ error: 'Failed to create timeline event' });
  }
});

/**
 * POST /timeline/health-score-changed
 * Create timeline event for health score changes
 */
router.post('/health-score-changed', validatePortalId, async (req: Request, res: Response) => {
  const { contractId, companyId, newScore, previousScore } = req.body;

  if (!contractId || !companyId) {
    res.status(400).json({ error: 'Contract ID and Company ID are required' });
    return;
  }

  try {
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const change = newScore - (previousScore || 0);
    const changeStr = change >= 0 ? `+${change}` : `${change}`;

    const success = await hubspotClient.createTimelineEvent({
      eventTemplateId: 'health_score_changed',
      objectId: companyId,
      tokens: {
        newScore: newScore || 0,
        previousScore: previousScore || 'N/A',
        change: changeStr,
      },
    });

    if (success) {
      res.json({ success: true, message: 'Timeline event created' });
    } else {
      res.status(500).json({ error: 'Failed to create timeline event' });
    }
  } catch (error) {
    logger.error('Failed to create health score changed timeline event', { error });
    res.status(500).json({ error: 'Failed to create timeline event' });
  }
});

/**
 * POST /timeline/webhook
 * Webhook endpoint for HubSpot timeline events
 */
router.post('/webhook', validateHubSpotSignature, async (req: Request, res: Response) => {
  const events = req.body;

  logger.info('Received timeline webhook', { eventCount: Array.isArray(events) ? events.length : 1 });

  try {
    // Process webhook events
    const eventList = Array.isArray(events) ? events : [events];
    
    for (const event of eventList) {
      logger.debug('Processing timeline event', { eventType: event.eventType });
      // Handle specific event types as needed
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Failed to process timeline webhook', { error });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
