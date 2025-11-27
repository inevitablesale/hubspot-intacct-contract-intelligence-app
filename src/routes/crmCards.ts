import { Router, Request, Response } from 'express';
import { syncService } from '../services/syncService';
import { underbillingDetector } from '../services/underbillingDetector';
import { renewalRiskService } from '../services/renewalRisk';
import { formatCurrency, daysBetween } from '../utils/helpers';
import { CRMCardData, CRMCardSection } from '../models/types';

const router = Router();

/**
 * GET /crm-cards/contract-insights
 * CRM card endpoint for contract insights on Company records
 */
router.get('/contract-insights', async (req: Request, res: Response) => {
  const { associatedObjectId, associatedObjectType, portalId } = req.query;

  if (!associatedObjectId || !associatedObjectType) {
    res.status(400).json({ error: 'Missing required parameters' });
    return;
  }

  try {
    // For demo purposes, we'll construct a card with sample/synced data
    // In production, this would fetch real data based on the associatedObjectId
    
    const contracts = syncService.getContracts();
    const healthScores = syncService.getAllHealthScores();
    const alerts = underbillingDetector.getUnresolvedAlerts();
    const risks = renewalRiskService.getActiveRisks();

    // Build card sections
    const sections: CRMCardSection[] = [];

    // Contract Summary Section
    const summarySection: CRMCardSection = {
      id: 'contract-summary',
      title: 'Contract Summary',
      topLevelCards: [],
    };

    if (contracts.length > 0) {
      const contract = contracts[0]; // In production, filter by company
      const healthScore = healthScores.find(s => s.contractId === contract.id);
      const daysUntil = daysBetween(new Date(), contract.renewalDate);

      summarySection.topLevelCards.push(
        {
          title: 'Contract Value',
          body: formatCurrency(contract.totalValue, contract.currency),
          subTitle: `Status: ${contract.status}`,
          style: 'DEFAULT',
        },
        {
          title: 'Health Score',
          body: healthScore?.score ?? 'N/A',
          subTitle: healthScore ? `Risk: ${healthScore.riskLevel.toUpperCase()}` : undefined,
          style: healthScore?.score && healthScore.score >= 60 ? 'SUCCESS' : 
                 healthScore?.score && healthScore.score >= 40 ? 'WARNING' : 'DANGER',
        },
        {
          title: 'Days to Renewal',
          body: daysUntil >= 0 ? daysUntil : 'Overdue',
          subTitle: contract.renewalDate.toISOString().split('T')[0],
          style: daysUntil > 60 ? 'DEFAULT' : daysUntil > 30 ? 'WARNING' : 'DANGER',
        }
      );
    } else {
      summarySection.topLevelCards.push({
        title: 'No Contract Data',
        body: 'No contracts found for this company',
        style: 'DEFAULT',
      });
    }

    sections.push(summarySection);

    // Alerts Section
    if (alerts.length > 0 || risks.length > 0) {
      const alertsSection: CRMCardSection = {
        id: 'alerts',
        title: 'Active Alerts',
        topLevelCards: [],
      };

      if (alerts.length > 0) {
        const totalUnderbilling = alerts.reduce((sum, a) => sum + a.difference, 0);
        alertsSection.topLevelCards.push({
          title: 'Underbilling Alerts',
          body: alerts.length,
          subTitle: `Total: ${formatCurrency(totalUnderbilling)}`,
          style: 'WARNING',
        });
      }

      if (risks.length > 0) {
        alertsSection.topLevelCards.push({
          title: 'Renewal Risks',
          body: risks.length,
          subTitle: `Types: ${[...new Set(risks.map(r => r.riskType))].join(', ')}`,
          style: 'DANGER',
        });
      }

      sections.push(alertsSection);
    }

    // Health Factors Section
    if (healthScores.length > 0) {
      const factorsSection: CRMCardSection = {
        id: 'health-factors',
        title: 'Health Factors',
        topLevelCards: [],
      };

      const healthScore = healthScores[0];
      for (const factor of healthScore.factors.slice(0, 4)) {
        factorsSection.topLevelCards.push({
          title: factor.name,
          body: `${factor.value}%`,
          subTitle: factor.description.slice(0, 50),
          style: factor.impact === 'positive' ? 'SUCCESS' : 
                 factor.impact === 'negative' ? 'DANGER' : 'DEFAULT',
        });
      }

      sections.push(factorsSection);
    }

    const cardData: CRMCardData = {
      title: 'Contract Intelligence',
      sections,
      primaryAction: {
        type: 'IFRAME',
        width: 800,
        height: 600,
        uri: `/dashboard?portalId=${portalId}&companyId=${associatedObjectId}`,
        label: 'View Full Dashboard',
      },
      secondaryActions: [
        {
          type: 'IFRAME',
          width: 600,
          height: 400,
          uri: `/sync/full?portalId=${portalId}`,
          label: 'Refresh Data',
        },
      ],
    };

    // Return in HubSpot CRM card format
    res.json({
      results: sections.flatMap(section => 
        section.topLevelCards.map(card => ({
          objectId: associatedObjectId,
          title: card.title,
          properties: [
            { label: 'Value', dataType: 'STRING', value: String(card.body) },
            ...(card.subTitle ? [{ label: 'Detail', dataType: 'STRING', value: card.subTitle }] : []),
          ],
        }))
      ),
      primaryAction: cardData.primaryAction,
      secondaryActions: cardData.secondaryActions,
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to generate CRM card data' });
  }
});

/**
 * GET /crm-cards/renewal-health
 * CRM card endpoint for renewal health on Deal records
 */
router.get('/renewal-health', async (req: Request, res: Response) => {
  const { associatedObjectId, associatedObjectType, portalId } = req.query;

  if (!associatedObjectId || !associatedObjectType) {
    res.status(400).json({ error: 'Missing required parameters' });
    return;
  }

  try {
    const healthScores = syncService.getAllHealthScores();
    const risks = renewalRiskService.getActiveRisks();

    const results = [];

    if (healthScores.length > 0) {
      const score = healthScores[0]; // In production, filter by deal

      results.push({
        objectId: associatedObjectId,
        title: 'Renewal Health Score',
        properties: [
          { label: 'Score', dataType: 'NUMERIC', value: score.score },
          { label: 'Risk Level', dataType: 'STRING', value: score.riskLevel.toUpperCase() },
        ],
      });

      // Add recommendations
      for (const rec of score.recommendations.slice(0, 3)) {
        results.push({
          objectId: associatedObjectId,
          title: 'Recommendation',
          properties: [
            { label: 'Action', dataType: 'STRING', value: rec },
          ],
        });
      }
    }

    // Add risk indicators
    if (risks.length > 0) {
      for (const risk of risks.slice(0, 2)) {
        results.push({
          objectId: associatedObjectId,
          title: `Risk: ${risk.riskType}`,
          properties: [
            { label: 'Score', dataType: 'NUMERIC', value: risk.riskScore },
            { label: 'Status', dataType: 'STRING', value: risk.status },
          ],
        });
      }
    }

    res.json({
      results,
      primaryAction: {
        type: 'IFRAME',
        width: 800,
        height: 600,
        uri: `/dashboard/renewals?portalId=${portalId}&dealId=${associatedObjectId}`,
        label: 'View Renewal Details',
      },
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to generate renewal health card' });
  }
});

/**
 * GET /crm-cards/billing-alerts
 * CRM card endpoint for billing alerts
 */
router.get('/billing-alerts', async (req: Request, res: Response) => {
  const { associatedObjectId, associatedObjectType, portalId } = req.query;

  if (!associatedObjectId || !associatedObjectType) {
    res.status(400).json({ error: 'Missing required parameters' });
    return;
  }

  try {
    const alerts = underbillingDetector.getUnresolvedAlerts();
    
    const results = alerts.slice(0, 5).map(alert => ({
      objectId: associatedObjectId,
      title: `${alert.type.replace('_', ' ').toUpperCase()}`,
      properties: [
        { label: 'Expected', dataType: 'CURRENCY', value: alert.expectedAmount },
        { label: 'Actual', dataType: 'CURRENCY', value: alert.actualAmount },
        { label: 'Difference', dataType: 'CURRENCY', value: alert.difference },
        { label: 'Severity', dataType: 'STRING', value: alert.severity.toUpperCase() },
        { label: 'Period', dataType: 'STRING', value: alert.period },
      ],
    }));

    if (results.length === 0) {
      results.push({
        objectId: associatedObjectId,
        title: 'No Billing Alerts',
        properties: [
          { label: 'Status', dataType: 'STRING', value: 'All billing is up to date' },
        ],
      });
    }

    res.json({
      results,
      primaryAction: {
        type: 'IFRAME',
        width: 700,
        height: 500,
        uri: `/dashboard/billing?portalId=${portalId}&companyId=${associatedObjectId}`,
        label: 'View All Alerts',
      },
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to generate billing alerts card' });
  }
});

export default router;
