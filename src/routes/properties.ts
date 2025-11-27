import { Router, Request, Response } from 'express';
import { createHubSpotClient } from '../clients/hubspot';
import { syncService } from '../services/syncService';
import { validatePortalId } from '../middleware';
import { logger } from '../utils/logger';
import { daysBetween } from '../utils/helpers';

const router = Router();

/**
 * POST /properties/update-company
 * Update company properties with contract data
 */
router.post('/update-company', validatePortalId, async (req: Request, res: Response) => {
  const { companyId, properties } = req.body;

  if (!companyId || !properties) {
    res.status(400).json({ error: 'Company ID and properties are required' });
    return;
  }

  try {
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const success = await hubspotClient.updateCompany(companyId, properties);

    if (success) {
      res.json({ success: true, message: 'Company properties updated' });
    } else {
      res.status(500).json({ error: 'Failed to update company properties' });
    }
  } catch (error) {
    logger.error('Failed to update company properties', { companyId, error });
    res.status(500).json({ error: 'Failed to update company properties' });
  }
});

/**
 * POST /properties/update-deal
 * Update deal properties with contract data
 */
router.post('/update-deal', validatePortalId, async (req: Request, res: Response) => {
  const { dealId, properties } = req.body;

  if (!dealId || !properties) {
    res.status(400).json({ error: 'Deal ID and properties are required' });
    return;
  }

  try {
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const success = await hubspotClient.updateDeal(dealId, properties);

    if (success) {
      res.json({ success: true, message: 'Deal properties updated' });
    } else {
      res.status(500).json({ error: 'Failed to update deal properties' });
    }
  } catch (error) {
    logger.error('Failed to update deal properties', { dealId, error });
    res.status(500).json({ error: 'Failed to update deal properties' });
  }
});

/**
 * POST /properties/sync-contract-to-company
 * Sync contract data to associated company properties
 */
router.post('/sync-contract-to-company', validatePortalId, async (req: Request, res: Response) => {
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

    const healthScore = syncService.getHealthScore(contractId);
    const daysUntil = daysBetween(new Date(), contract.renewalDate);

    const properties: Record<string, string> = {
      intacct_customer_id: contract.customerId,
      contract_status: contract.status,
      contract_value: contract.totalValue.toString(),
      contract_renewal_date: contract.renewalDate.toISOString().split('T')[0],
      days_until_renewal: daysUntil.toString(),
    };

    if (healthScore) {
      properties.contract_health_score = healthScore.score.toString();
      properties.contract_risk_level = healthScore.riskLevel;
    }

    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const success = await hubspotClient.updateCompany(companyId, properties);

    if (success) {
      res.json({ 
        success: true, 
        message: 'Contract data synced to company',
        properties 
      });
    } else {
      res.status(500).json({ error: 'Failed to sync contract to company' });
    }
  } catch (error) {
    logger.error('Failed to sync contract to company', { contractId, companyId, error });
    res.status(500).json({ error: 'Failed to sync contract to company' });
  }
});

/**
 * POST /properties/batch-update-companies
 * Batch update multiple companies with contract data
 */
router.post('/batch-update-companies', validatePortalId, async (req: Request, res: Response) => {
  const { updates } = req.body;

  if (!updates || !Array.isArray(updates)) {
    res.status(400).json({ error: 'Updates array is required' });
    return;
  }

  try {
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const results = {
      succeeded: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const update of updates) {
      const { companyId, properties } = update;
      
      if (!companyId || !properties) {
        results.failed++;
        results.errors.push(`Invalid update: missing companyId or properties`);
        continue;
      }

      try {
        const success = await hubspotClient.updateCompany(companyId, properties);
        if (success) {
          results.succeeded++;
        } else {
          results.failed++;
          results.errors.push(`Failed to update company ${companyId}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Error updating company ${companyId}: ${(error as Error).message}`);
      }
    }

    res.json({
      success: results.failed === 0,
      message: `Updated ${results.succeeded}/${updates.length} companies`,
      results,
    });
  } catch (error) {
    logger.error('Batch update companies failed', { error });
    res.status(500).json({ error: 'Batch update failed' });
  }
});

/**
 * POST /properties/create-contract-properties
 * Create custom properties for contract data
 */
router.post('/create-contract-properties', validatePortalId, async (req: Request, res: Response) => {
  try {
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const success = await hubspotClient.createContractProperties();

    if (success) {
      res.json({ success: true, message: 'Contract properties created' });
    } else {
      res.status(500).json({ error: 'Failed to create contract properties' });
    }
  } catch (error) {
    logger.error('Failed to create contract properties', { error });
    res.status(500).json({ error: 'Failed to create contract properties' });
  }
});

/**
 * GET /properties/company/:companyId
 * Get company properties
 */
router.get('/company/:companyId', validatePortalId, async (req: Request, res: Response) => {
  const { companyId } = req.params;

  try {
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const company = await hubspotClient.getCompany(companyId);

    if (company) {
      res.json(company);
    } else {
      res.status(404).json({ error: 'Company not found' });
    }
  } catch (error) {
    logger.error('Failed to get company', { companyId, error });
    res.status(500).json({ error: 'Failed to get company' });
  }
});

/**
 * GET /properties/deal/:dealId
 * Get deal properties
 */
router.get('/deal/:dealId', validatePortalId, async (req: Request, res: Response) => {
  const { dealId } = req.params;

  try {
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(req.portalId!);

    const deal = await hubspotClient.getDeal(dealId);

    if (deal) {
      res.json(deal);
    } else {
      res.status(404).json({ error: 'Deal not found' });
    }
  } catch (error) {
    logger.error('Failed to get deal', { dealId, error });
    res.status(500).json({ error: 'Failed to get deal' });
  }
});

export default router;
