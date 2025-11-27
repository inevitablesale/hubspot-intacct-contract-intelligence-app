import { daysBetween, isWithinDays } from '../utils/helpers';
import { syncService } from './syncService';
import { underbillingDetector } from './underbillingDetector';
import { renewalRiskService } from './renewalRisk';
import {
  DashboardMetrics,
  ContractTrend,
  ContractStatus,
  RiskLevel,
} from '../models/types';

/**
 * Dashboard Service
 * Provides analytics and metrics for the dashboard
 */
export class DashboardService {
  /**
   * Get overview metrics for the dashboard
   */
  getMetrics(): DashboardMetrics {
    const contracts = syncService.getContracts();
    const healthScores = syncService.getAllHealthScores();
    const underbillingAlerts = underbillingDetector.getUnresolvedAlerts();

    const now = new Date();

    // Basic contract metrics
    const totalContracts = contracts.length;
    const activeContracts = contracts.filter(
      c => c.status === ContractStatus.ACTIVE
    ).length;
    const totalContractValue = contracts.reduce(
      (sum, c) => sum + c.totalValue,
      0
    );

    // Renewal metrics
    const renewalsDue30Days = contracts.filter(c => 
      c.status === ContractStatus.ACTIVE && 
      isWithinDays(c.renewalDate, 30) &&
      daysBetween(now, c.renewalDate) >= 0
    ).length;

    const renewalsDue60Days = contracts.filter(c => 
      c.status === ContractStatus.ACTIVE && 
      isWithinDays(c.renewalDate, 60) &&
      daysBetween(now, c.renewalDate) >= 0
    ).length;

    const renewalsDue90Days = contracts.filter(c => 
      c.status === ContractStatus.ACTIVE && 
      isWithinDays(c.renewalDate, 90) &&
      daysBetween(now, c.renewalDate) >= 0
    ).length;

    // Risk metrics
    const atRiskContracts = healthScores.filter(
      s => s.riskLevel === RiskLevel.HIGH || s.riskLevel === RiskLevel.CRITICAL
    ).length;

    const criticalRiskContracts = healthScores.filter(
      s => s.riskLevel === RiskLevel.CRITICAL
    ).length;

    const healthyContracts = healthScores.filter(
      s => s.riskLevel === RiskLevel.LOW
    ).length;

    // Average health score
    const averageHealthScore = healthScores.length > 0
      ? healthScores.reduce((sum, s) => sum + s.score, 0) / healthScores.length
      : 0;

    return {
      totalContracts,
      activeContracts,
      totalContractValue,
      renewalsDue30Days,
      renewalsDue60Days,
      renewalsDue90Days,
      atRiskContracts,
      criticalRiskContracts,
      healthyContracts,
      underbillingAlerts: underbillingAlerts.length,
      averageHealthScore: Math.round(averageHealthScore),
    };
  }

  /**
   * Get contract trends over time
   */
  getContractTrends(months: number = 6): ContractTrend[] {
    const contracts = syncService.getContracts();
    const trends: ContractTrend[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const periodLabel = periodStart.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });

      // Count contracts by status change in this period
      const newContracts = contracts.filter(c => 
        c.createdAt >= periodStart && c.createdAt <= periodEnd
      ).length;

      const renewedContracts = contracts.filter(c => 
        c.status === ContractStatus.RENEWED &&
        c.updatedAt >= periodStart &&
        c.updatedAt <= periodEnd
      ).length;

      const cancelledContracts = contracts.filter(c => 
        c.status === ContractStatus.CANCELLED &&
        c.updatedAt >= periodStart &&
        c.updatedAt <= periodEnd
      ).length;

      // Calculate value for new contracts in period
      const value = contracts
        .filter(c => c.createdAt >= periodStart && c.createdAt <= periodEnd)
        .reduce((sum, c) => sum + c.totalValue, 0);

      trends.push({
        period: periodLabel,
        newContracts,
        renewedContracts,
        cancelledContracts,
        value,
      });
    }

    return trends;
  }

  /**
   * Get health score distribution
   */
  getHealthScoreDistribution(): {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
    critical: number;
  } {
    const healthScores = syncService.getAllHealthScores();

    return {
      excellent: healthScores.filter(s => s.score >= 80).length,
      good: healthScores.filter(s => s.score >= 60 && s.score < 80).length,
      fair: healthScores.filter(s => s.score >= 40 && s.score < 60).length,
      poor: healthScores.filter(s => s.score >= 20 && s.score < 40).length,
      critical: healthScores.filter(s => s.score < 20).length,
    };
  }

  /**
   * Get upcoming renewals with health scores
   */
  getUpcomingRenewals(days: number = 90): Array<{
    contractId: string;
    contractNumber: string;
    customerName: string;
    renewalDate: Date;
    value: number;
    healthScore: number;
    riskLevel: string;
    daysUntilRenewal: number;
  }> {
    const contracts = syncService.getContracts();
    const now = new Date();

    return contracts
      .filter(c => 
        c.status === ContractStatus.ACTIVE &&
        isWithinDays(c.renewalDate, days) &&
        daysBetween(now, c.renewalDate) >= 0
      )
      .map(contract => {
        const healthScore = syncService.getHealthScore(contract.id);
        return {
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          customerName: contract.customerName,
          renewalDate: contract.renewalDate,
          value: contract.totalValue,
          healthScore: healthScore?.score || 0,
          riskLevel: healthScore?.riskLevel || 'unknown',
          daysUntilRenewal: daysBetween(now, contract.renewalDate),
        };
      })
      .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);
  }

  /**
   * Get top at-risk contracts
   */
  getTopAtRiskContracts(limit: number = 10): Array<{
    contractId: string;
    contractNumber: string;
    customerName: string;
    value: number;
    healthScore: number;
    riskLevel: string;
    topRiskFactors: string[];
  }> {
    const healthScores = syncService.getAllHealthScores();
    
    return healthScores
      .filter(s => s.riskLevel === RiskLevel.HIGH || s.riskLevel === RiskLevel.CRITICAL)
      .sort((a, b) => a.score - b.score)
      .slice(0, limit)
      .map(score => {
        const contract = syncService.getContractById(score.contractId);
        return {
          contractId: score.contractId,
          contractNumber: contract?.contractNumber || 'Unknown',
          customerName: contract?.customerName || 'Unknown',
          value: contract?.totalValue || 0,
          healthScore: score.score,
          riskLevel: score.riskLevel,
          topRiskFactors: score.factors
            .filter(f => f.impact === 'negative')
            .slice(0, 3)
            .map(f => f.description),
        };
      });
  }

  /**
   * Get underbilling summary
   */
  getUnderbillingSummary(): {
    totalAlerts: number;
    totalAmount: number;
    byType: Record<string, { count: number; amount: number }>;
    bySeverity: Record<string, number>;
  } {
    const alerts = underbillingDetector.getUnresolvedAlerts();

    const byType: Record<string, { count: number; amount: number }> = {};
    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    let totalAmount = 0;

    for (const alert of alerts) {
      totalAmount += alert.difference;
      bySeverity[alert.severity]++;

      if (!byType[alert.type]) {
        byType[alert.type] = { count: 0, amount: 0 };
      }
      byType[alert.type].count++;
      byType[alert.type].amount += alert.difference;
    }

    return {
      totalAlerts: alerts.length,
      totalAmount,
      byType,
      bySeverity,
    };
  }

  /**
   * Get renewal risk summary
   */
  getRenewalRiskSummary(): {
    total: number;
    byType: Record<string, number>;
    totalValueAtRisk: number;
    averageRiskScore: number;
  } {
    const risks = renewalRiskService.getActiveRisks();
    const contracts = syncService.getContracts();

    const byType: Record<string, number> = {
      churn: 0,
      downgrade: 0,
      late_renewal: 0,
      price_sensitivity: 0,
    };

    let totalScore = 0;
    const contractsAtRisk = new Set<string>();

    for (const risk of risks) {
      byType[risk.riskType]++;
      totalScore += risk.riskScore;
      contractsAtRisk.add(risk.contractId);
    }

    // Calculate total value at risk
    const totalValueAtRisk = contracts
      .filter(c => contractsAtRisk.has(c.id))
      .reduce((sum, c) => sum + c.totalValue, 0);

    return {
      total: risks.length,
      byType,
      totalValueAtRisk,
      averageRiskScore: risks.length > 0 ? totalScore / risks.length : 0,
    };
  }

  /**
   * Get customer health overview
   */
  getCustomerHealthOverview(): Array<{
    customerId: string;
    customerName: string;
    contractCount: number;
    totalValue: number;
    averageHealthScore: number;
    riskLevel: string;
    underbillingAlerts: number;
  }> {
    const contracts = syncService.getContracts();
    const healthScores = syncService.getAllHealthScores();
    const alerts = underbillingDetector.getUnresolvedAlerts();

    // Group by customer
    const customerMap = new Map<string, {
      name: string;
      contracts: string[];
      value: number;
      scores: number[];
      alerts: number;
    }>();

    for (const contract of contracts) {
      if (!customerMap.has(contract.customerId)) {
        customerMap.set(contract.customerId, {
          name: contract.customerName,
          contracts: [],
          value: 0,
          scores: [],
          alerts: 0,
        });
      }
      const customer = customerMap.get(contract.customerId)!;
      customer.contracts.push(contract.id);
      customer.value += contract.totalValue;
    }

    // Add health scores
    for (const score of healthScores) {
      const contract = syncService.getContractById(score.contractId);
      if (contract) {
        const customer = customerMap.get(contract.customerId);
        if (customer) {
          customer.scores.push(score.score);
        }
      }
    }

    // Add alerts
    for (const alert of alerts) {
      const customer = customerMap.get(alert.customerId);
      if (customer) {
        customer.alerts++;
      }
    }

    // Build result
    const results = [];
    for (const [customerId, data] of customerMap) {
      const avgScore = data.scores.length > 0
        ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        : 0;

      let riskLevel: string;
      if (avgScore >= 80) riskLevel = 'low';
      else if (avgScore >= 60) riskLevel = 'medium';
      else if (avgScore >= 40) riskLevel = 'high';
      else riskLevel = 'critical';

      results.push({
        customerId,
        customerName: data.name,
        contractCount: data.contracts.length,
        totalValue: data.value,
        averageHealthScore: Math.round(avgScore),
        riskLevel,
        underbillingAlerts: data.alerts,
      });
    }

    return results.sort((a, b) => a.averageHealthScore - b.averageHealthScore);
  }
}

export const dashboardService = new DashboardService();
