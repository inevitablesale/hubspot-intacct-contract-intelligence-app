import { logger } from '../utils/logger';
import { generateId, chunk } from '../utils/helpers';
import { intacctClient } from '../clients/intacct';
import { createHubSpotClient } from '../clients/hubspot';
import { renewalScoringEngine } from '../scoring/renewalEngine';
import { underbillingDetector } from './underbillingDetector';
import { renewalRiskService } from './renewalRisk';
import { config } from '../config';
import {
  Contract,
  Invoice,
  Subscription,
  SyncStatus,
  RenewalHealthScore,
} from '../models/types';

/**
 * Data Sync Service
 * Orchestrates data synchronization between Intacct and HubSpot
 */
export class SyncService {
  private syncStatuses: Map<string, SyncStatus> = new Map();
  private contracts: Contract[] = [];
  private invoices: Invoice[] = [];
  private subscriptions: Subscription[] = [];
  private healthScores: Map<string, RenewalHealthScore> = new Map();

  /**
   * Sync all contracts from Intacct
   */
  async syncContracts(portalId: string): Promise<SyncStatus> {
    const syncId = generateId();
    const status: SyncStatus = {
      id: syncId,
      type: 'contracts',
      status: 'in_progress',
      recordsProcessed: 0,
      recordsTotal: 0,
      startedAt: new Date(),
    };
    this.syncStatuses.set(syncId, status);

    try {
      logger.info('Starting contract sync', { syncId, portalId });

      // Fetch contracts from Intacct
      let offset = 0;
      const allContracts: Contract[] = [];

      while (true) {
        const result = await intacctClient.getContracts(offset, config.sync.batchSize);
        if (!result.success || result.data.length === 0) {
          break;
        }
        allContracts.push(...result.data);
        offset += config.sync.batchSize;

        if (result.data.length < config.sync.batchSize) {
          break;
        }
      }

      status.recordsTotal = allContracts.length;
      this.contracts = allContracts;

      // Get HubSpot client
      const hubspotClient = createHubSpotClient();
      await hubspotClient.ensureValidToken(portalId);

      // Process contracts in batches
      const contractBatches = chunk(allContracts, 10);

      for (const batch of contractBatches) {
        await Promise.all(batch.map(async (contract) => {
          try {
            // Find or create associated company in HubSpot
            const companies = await hubspotClient.searchCompanies(
              contract.customerId,
              'intacct_customer_id'
            );

            if (companies.length > 0) {
              // Update company with contract data
              await hubspotClient.updateCompany(companies[0].id, {
                contract_status: contract.status,
                contract_value: contract.totalValue.toString(),
                contract_renewal_date: contract.renewalDate.toISOString().split('T')[0],
              });
            }

            status.recordsProcessed++;
          } catch (error) {
            logger.error('Failed to sync contract', { contractId: contract.id, error });
          }
        }));
      }

      status.status = 'completed';
      status.completedAt = new Date();

      logger.info('Contract sync completed', {
        syncId,
        recordsProcessed: status.recordsProcessed,
        recordsTotal: status.recordsTotal,
      });
    } catch (error) {
      status.status = 'failed';
      status.error = (error as Error).message;
      status.completedAt = new Date();
      logger.error('Contract sync failed', { syncId, error });
    }

    return status;
  }

  /**
   * Sync all invoices from Intacct
   */
  async syncInvoices(portalId: string): Promise<SyncStatus> {
    const syncId = generateId();
    const status: SyncStatus = {
      id: syncId,
      type: 'invoices',
      status: 'in_progress',
      recordsProcessed: 0,
      recordsTotal: 0,
      startedAt: new Date(),
    };
    this.syncStatuses.set(syncId, status);

    try {
      logger.info('Starting invoice sync', { syncId, portalId });

      // Fetch invoices from Intacct
      let offset = 0;
      const allInvoices: Invoice[] = [];

      while (true) {
        const result = await intacctClient.getInvoices(offset, config.sync.batchSize);
        if (!result.success || result.data.length === 0) {
          break;
        }
        allInvoices.push(...result.data);
        offset += config.sync.batchSize;

        if (result.data.length < config.sync.batchSize) {
          break;
        }
      }

      status.recordsTotal = allInvoices.length;
      this.invoices = allInvoices;
      status.recordsProcessed = allInvoices.length;
      status.status = 'completed';
      status.completedAt = new Date();

      logger.info('Invoice sync completed', {
        syncId,
        recordsProcessed: status.recordsProcessed,
      });
    } catch (error) {
      status.status = 'failed';
      status.error = (error as Error).message;
      status.completedAt = new Date();
      logger.error('Invoice sync failed', { syncId, error });
    }

    return status;
  }

  /**
   * Sync all subscriptions from Intacct
   */
  async syncSubscriptions(portalId: string): Promise<SyncStatus> {
    const syncId = generateId();
    const status: SyncStatus = {
      id: syncId,
      type: 'subscriptions',
      status: 'in_progress',
      recordsProcessed: 0,
      recordsTotal: 0,
      startedAt: new Date(),
    };
    this.syncStatuses.set(syncId, status);

    try {
      logger.info('Starting subscription sync', { syncId, portalId });

      // Fetch subscriptions from Intacct
      let offset = 0;
      const allSubscriptions: Subscription[] = [];

      while (true) {
        const result = await intacctClient.getSubscriptions(offset, config.sync.batchSize);
        if (!result.success || result.data.length === 0) {
          break;
        }
        allSubscriptions.push(...result.data);
        offset += config.sync.batchSize;

        if (result.data.length < config.sync.batchSize) {
          break;
        }
      }

      status.recordsTotal = allSubscriptions.length;
      this.subscriptions = allSubscriptions;
      status.recordsProcessed = allSubscriptions.length;
      status.status = 'completed';
      status.completedAt = new Date();

      logger.info('Subscription sync completed', {
        syncId,
        recordsProcessed: status.recordsProcessed,
      });
    } catch (error) {
      status.status = 'failed';
      status.error = (error as Error).message;
      status.completedAt = new Date();
      logger.error('Subscription sync failed', { syncId, error });
    }

    return status;
  }

  /**
   * Run full sync and analysis
   */
  async runFullSync(portalId: string): Promise<{
    contracts: SyncStatus;
    invoices: SyncStatus;
    subscriptions: SyncStatus;
    healthScoresCalculated: number;
    underbillingAlerts: number;
    renewalRisks: number;
  }> {
    logger.info('Starting full sync and analysis', { portalId });

    // Sync all data types
    const [contractsStatus, invoicesStatus, subscriptionsStatus] = await Promise.all([
      this.syncContracts(portalId),
      this.syncInvoices(portalId),
      this.syncSubscriptions(portalId),
    ]);

    // Build lookup maps
    const invoicesByContract = this.buildInvoiceMap();
    const subscriptionsByContract = this.buildSubscriptionMap();

    // Calculate health scores
    const healthScores = renewalScoringEngine.calculateBatchScores(
      this.contracts,
      invoicesByContract,
      subscriptionsByContract
    );

    // Store health scores
    for (const score of healthScores) {
      this.healthScores.set(score.contractId, score);
    }

    // Detect underbilling
    let totalUnderbillingAlerts = 0;
    for (const contract of this.contracts) {
      const contractInvoices = invoicesByContract.get(contract.id) || [];
      const contractSubscriptions = subscriptionsByContract.get(contract.id) || [];
      const alerts = underbillingDetector.detectUnderbilling(
        contract,
        contractInvoices,
        contractSubscriptions
      );
      totalUnderbillingAlerts += alerts.length;
    }

    // Analyze renewal risks
    let totalRenewalRisks = 0;
    for (const contract of this.contracts) {
      const healthScore = this.healthScores.get(contract.id);
      if (healthScore) {
        const contractInvoices = invoicesByContract.get(contract.id) || [];
        const risks = renewalRiskService.analyzeRenewalRisks(
          contract,
          healthScore,
          contractInvoices
        );
        totalRenewalRisks += risks.length;
      }
    }

    // Update HubSpot with health scores
    await this.updateHubSpotWithScores(portalId, healthScores);

    logger.info('Full sync and analysis completed', {
      portalId,
      contractsProcessed: contractsStatus.recordsProcessed,
      healthScoresCalculated: healthScores.length,
      underbillingAlerts: totalUnderbillingAlerts,
      renewalRisks: totalRenewalRisks,
    });

    return {
      contracts: contractsStatus,
      invoices: invoicesStatus,
      subscriptions: subscriptionsStatus,
      healthScoresCalculated: healthScores.length,
      underbillingAlerts: totalUnderbillingAlerts,
      renewalRisks: totalRenewalRisks,
    };
  }

  /**
   * Update HubSpot companies with health scores
   */
  private async updateHubSpotWithScores(
    portalId: string,
    healthScores: RenewalHealthScore[]
  ): Promise<void> {
    const hubspotClient = createHubSpotClient();
    await hubspotClient.ensureValidToken(portalId);

    const scoreBatches = chunk(healthScores, 10);

    for (const batch of scoreBatches) {
      await Promise.all(batch.map(async (score) => {
        try {
          const contract = this.contracts.find(c => c.id === score.contractId);
          if (!contract) return;

          const companies = await hubspotClient.searchCompanies(
            contract.customerId,
            'intacct_customer_id'
          );

          if (companies.length > 0) {
            await hubspotClient.updateCompany(companies[0].id, {
              contract_health_score: score.score.toString(),
              contract_risk_level: score.riskLevel,
            });

            // Create timeline event for significant score changes
            if (score.riskLevel === 'high' || score.riskLevel === 'critical') {
              await hubspotClient.createTimelineEvent({
                eventTemplateId: 'renewal_risk_detected',
                objectId: companies[0].id,
                tokens: {
                  contractNumber: contract.contractNumber,
                  riskLevel: score.riskLevel,
                  score: score.score,
                  factors: score.factors.map(f => f.name).join(', '),
                },
              });
            }
          }
        } catch (error) {
          logger.error('Failed to update HubSpot with health score', {
            contractId: score.contractId,
            error,
          });
        }
      }));
    }
  }

  /**
   * Build invoice lookup map by contract ID
   */
  private buildInvoiceMap(): Map<string, Invoice[]> {
    const map = new Map<string, Invoice[]>();
    for (const invoice of this.invoices) {
      const existing = map.get(invoice.contractId) || [];
      existing.push(invoice);
      map.set(invoice.contractId, existing);
    }
    return map;
  }

  /**
   * Build subscription lookup map by contract ID
   */
  private buildSubscriptionMap(): Map<string, Subscription[]> {
    const map = new Map<string, Subscription[]>();
    for (const subscription of this.subscriptions) {
      const existing = map.get(subscription.contractId) || [];
      existing.push(subscription);
      map.set(subscription.contractId, existing);
    }
    return map;
  }

  /**
   * Get sync status by ID
   */
  getSyncStatus(syncId: string): SyncStatus | undefined {
    return this.syncStatuses.get(syncId);
  }

  /**
   * Get all sync statuses
   */
  getAllSyncStatuses(): SyncStatus[] {
    return Array.from(this.syncStatuses.values());
  }

  /**
   * Get stored contracts
   */
  getContracts(): Contract[] {
    return this.contracts;
  }

  /**
   * Get stored invoices
   */
  getInvoices(): Invoice[] {
    return this.invoices;
  }

  /**
   * Get stored subscriptions
   */
  getSubscriptions(): Subscription[] {
    return this.subscriptions;
  }

  /**
   * Get health score by contract ID
   */
  getHealthScore(contractId: string): RenewalHealthScore | undefined {
    return this.healthScores.get(contractId);
  }

  /**
   * Get all health scores
   */
  getAllHealthScores(): RenewalHealthScore[] {
    return Array.from(this.healthScores.values());
  }

  /**
   * Get contract by ID
   */
  getContractById(contractId: string): Contract | undefined {
    return this.contracts.find(c => c.id === contractId);
  }

  /**
   * Get invoices by contract ID
   */
  getInvoicesByContract(contractId: string): Invoice[] {
    return this.invoices.filter(i => i.contractId === contractId);
  }

  /**
   * Get subscriptions by contract ID
   */
  getSubscriptionsByContract(contractId: string): Subscription[] {
    return this.subscriptions.filter(s => s.contractId === contractId);
  }
}

export const syncService = new SyncService();
