import { Router, Request, Response } from 'express';
import { syncService } from '../services/syncService';
import { validatePortalId } from '../middleware';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /sync/contracts
 * Trigger contract sync from Intacct
 */
router.post('/contracts', validatePortalId, async (req: Request, res: Response) => {
  try {
    logger.info('Starting contract sync', { portalId: req.portalId });
    const status = await syncService.syncContracts(req.portalId!);
    res.json(status);
  } catch (error) {
    logger.error('Contract sync failed', { error });
    res.status(500).json({ error: 'Contract sync failed' });
  }
});

/**
 * POST /sync/invoices
 * Trigger invoice sync from Intacct
 */
router.post('/invoices', validatePortalId, async (req: Request, res: Response) => {
  try {
    logger.info('Starting invoice sync', { portalId: req.portalId });
    const status = await syncService.syncInvoices(req.portalId!);
    res.json(status);
  } catch (error) {
    logger.error('Invoice sync failed', { error });
    res.status(500).json({ error: 'Invoice sync failed' });
  }
});

/**
 * POST /sync/subscriptions
 * Trigger subscription sync from Intacct
 */
router.post('/subscriptions', validatePortalId, async (req: Request, res: Response) => {
  try {
    logger.info('Starting subscription sync', { portalId: req.portalId });
    const status = await syncService.syncSubscriptions(req.portalId!);
    res.json(status);
  } catch (error) {
    logger.error('Subscription sync failed', { error });
    res.status(500).json({ error: 'Subscription sync failed' });
  }
});

/**
 * POST /sync/full
 * Run full sync and analysis
 */
router.post('/full', validatePortalId, async (req: Request, res: Response) => {
  try {
    logger.info('Starting full sync', { portalId: req.portalId });
    const result = await syncService.runFullSync(req.portalId!);
    res.json(result);
  } catch (error) {
    logger.error('Full sync failed', { error });
    res.status(500).json({ error: 'Full sync failed' });
  }
});

/**
 * GET /sync/status/:syncId
 * Get sync status by ID
 */
router.get('/status/:syncId', (req: Request, res: Response) => {
  const { syncId } = req.params;
  const status = syncService.getSyncStatus(syncId);

  if (!status) {
    res.status(404).json({ error: 'Sync status not found' });
    return;
  }

  res.json(status);
});

/**
 * GET /sync/statuses
 * Get all sync statuses
 */
router.get('/statuses', (_req: Request, res: Response) => {
  const statuses = syncService.getAllSyncStatuses();
  res.json(statuses);
});

/**
 * GET /sync/contracts
 * Get all synced contracts
 */
router.get('/contracts', (_req: Request, res: Response) => {
  const contracts = syncService.getContracts();
  res.json({
    count: contracts.length,
    contracts,
  });
});

/**
 * GET /sync/invoices
 * Get all synced invoices
 */
router.get('/invoices', (_req: Request, res: Response) => {
  const invoices = syncService.getInvoices();
  res.json({
    count: invoices.length,
    invoices,
  });
});

/**
 * GET /sync/subscriptions
 * Get all synced subscriptions
 */
router.get('/subscriptions', (_req: Request, res: Response) => {
  const subscriptions = syncService.getSubscriptions();
  res.json({
    count: subscriptions.length,
    subscriptions,
  });
});

export default router;
