import { logger } from '../utils/logger';
import { generateId, daysBetween, isWithinDays } from '../utils/helpers';
import {
  Contract,
  Invoice,
  RenewalHealthScore,
  RenewalRisk,
  RiskType,
  RiskStatus,
  RiskIndicator,
  RiskLevel,
  InvoiceStatus,
} from '../models/types';

/**
 * Renewal Risk Service
 * Identifies and flags contracts at risk of non-renewal
 */
export class RenewalRiskService {
  private risks: RenewalRisk[] = [];

  // Configurable thresholds
  private thresholds = {
    healthScoreChurnRisk: 40,
    healthScoreDowngradeRisk: 60,
    overdueInvoicesChurnRisk: 3,
    overdueAmountChurnRisk: 5000,
    daysUntilRenewalUrgent: 30,
    daysUntilRenewalSoon: 60,
  };

  /**
   * Analyze contract and flag renewal risks
   */
  analyzeRenewalRisks(
    contract: Contract,
    healthScore: RenewalHealthScore,
    invoices: Invoice[]
  ): RenewalRisk[] {
    const risks: RenewalRisk[] = [];

    // Check for churn risk
    const churnRisk = this.detectChurnRisk(contract, healthScore, invoices);
    if (churnRisk) {
      risks.push(churnRisk);
    }

    // Check for downgrade risk
    const downgradeRisk = this.detectDowngradeRisk(contract, healthScore);
    if (downgradeRisk) {
      risks.push(downgradeRisk);
    }

    // Check for late renewal risk
    const lateRenewalRisk = this.detectLateRenewalRisk(contract, invoices);
    if (lateRenewalRisk) {
      risks.push(lateRenewalRisk);
    }

    // Check for price sensitivity risk
    const priceSensitivityRisk = this.detectPriceSensitivityRisk(contract, invoices);
    if (priceSensitivityRisk) {
      risks.push(priceSensitivityRisk);
    }

    // Store new risks
    this.risks.push(...risks);

    logger.info('Renewal risk analysis completed', {
      contractId: contract.id,
      riskCount: risks.length,
      riskTypes: risks.map(r => r.riskType),
    });

    return risks;
  }

  /**
   * Detect churn risk - customer likely to cancel
   */
  private detectChurnRisk(
    contract: Contract,
    healthScore: RenewalHealthScore,
    invoices: Invoice[]
  ): RenewalRisk | null {
    const indicators: RiskIndicator[] = [];
    let riskScore = 0;

    // Check health score
    if (healthScore.score <= this.thresholds.healthScoreChurnRisk) {
      indicators.push({
        name: 'Low Health Score',
        value: healthScore.score,
        threshold: this.thresholds.healthScoreChurnRisk,
        exceeded: true,
      });
      riskScore += 40;
    }

    // Check overdue invoices
    const overdueInvoices = invoices.filter(inv => inv.status === InvoiceStatus.OVERDUE);
    if (overdueInvoices.length >= this.thresholds.overdueInvoicesChurnRisk) {
      indicators.push({
        name: 'Multiple Overdue Invoices',
        value: overdueInvoices.length,
        threshold: this.thresholds.overdueInvoicesChurnRisk,
        exceeded: true,
      });
      riskScore += 30;
    }

    // Check total overdue amount
    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    if (totalOverdue >= this.thresholds.overdueAmountChurnRisk) {
      indicators.push({
        name: 'High Overdue Amount',
        value: totalOverdue,
        threshold: this.thresholds.overdueAmountChurnRisk,
        exceeded: true,
      });
      riskScore += 30;
    }

    // Check critical risk level
    if (healthScore.riskLevel === RiskLevel.CRITICAL) {
      indicators.push({
        name: 'Critical Risk Level',
        value: 'CRITICAL',
        threshold: 'HIGH or below',
        exceeded: true,
      });
      riskScore += 20;
    }

    // Check negative factors
    const negativeFactors = healthScore.factors.filter(f => f.impact === 'negative');
    if (negativeFactors.length >= 2) {
      indicators.push({
        name: 'Multiple Negative Factors',
        value: negativeFactors.length,
        threshold: 2,
        exceeded: true,
      });
      riskScore += 10;
    }

    if (indicators.length >= 2) {
      return {
        id: generateId(),
        contractId: contract.id,
        customerId: contract.customerId,
        riskType: RiskType.CHURN,
        riskScore: Math.min(riskScore, 100),
        indicators,
        flaggedAt: new Date(),
        status: RiskStatus.NEW,
      };
    }

    return null;
  }

  /**
   * Detect downgrade risk - customer likely to reduce services
   */
  private detectDowngradeRisk(
    contract: Contract,
    healthScore: RenewalHealthScore
  ): RenewalRisk | null {
    const indicators: RiskIndicator[] = [];
    let riskScore = 0;

    // Check for medium health score (not critical enough for churn but concerning)
    if (healthScore.score > this.thresholds.healthScoreChurnRisk && 
        healthScore.score <= this.thresholds.healthScoreDowngradeRisk) {
      indicators.push({
        name: 'Moderate Health Score',
        value: healthScore.score,
        threshold: this.thresholds.healthScoreDowngradeRisk,
        exceeded: true,
      });
      riskScore += 40;
    }

    // Check for low usage
    const usageFactor = healthScore.factors.find(f => f.name === 'Usage Trend');
    if (usageFactor && usageFactor.value < 50) {
      indicators.push({
        name: 'Low Product Usage',
        value: usageFactor.value,
        threshold: 50,
        exceeded: true,
      });
      riskScore += 35;
    }

    // Check for high contract value (more likely to seek reduction)
    if (contract.totalValue > 50000) {
      const valueFactor = healthScore.factors.find(f => f.name === 'Contract Value');
      if (valueFactor && valueFactor.impact !== 'positive') {
        indicators.push({
          name: 'Large Contract Value at Risk',
          value: contract.totalValue,
          threshold: 50000,
          exceeded: true,
        });
        riskScore += 25;
      }
    }

    if (indicators.length >= 2) {
      return {
        id: generateId(),
        contractId: contract.id,
        customerId: contract.customerId,
        riskType: RiskType.DOWNGRADE,
        riskScore: Math.min(riskScore, 100),
        indicators,
        flaggedAt: new Date(),
        status: RiskStatus.NEW,
      };
    }

    return null;
  }

  /**
   * Detect late renewal risk - renewal likely to be delayed
   */
  private detectLateRenewalRisk(
    contract: Contract,
    invoices: Invoice[]
  ): RenewalRisk | null {
    const indicators: RiskIndicator[] = [];
    let riskScore = 0;
    const daysUntilRenewal = daysBetween(new Date(), contract.renewalDate);

    // Check if renewal is approaching
    if (daysUntilRenewal <= this.thresholds.daysUntilRenewalUrgent) {
      indicators.push({
        name: 'Renewal Imminent',
        value: daysUntilRenewal,
        threshold: this.thresholds.daysUntilRenewalUrgent,
        exceeded: true,
      });
      riskScore += 40;
    } else if (daysUntilRenewal <= this.thresholds.daysUntilRenewalSoon) {
      indicators.push({
        name: 'Renewal Approaching',
        value: daysUntilRenewal,
        threshold: this.thresholds.daysUntilRenewalSoon,
        exceeded: true,
      });
      riskScore += 25;
    }

    // Check for outstanding invoices
    const outstandingInvoices = invoices.filter(
      inv => inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.VOID
    );
    if (outstandingInvoices.length > 0) {
      indicators.push({
        name: 'Outstanding Invoices',
        value: outstandingInvoices.length,
        threshold: 0,
        exceeded: true,
      });
      riskScore += 25;
    }

    // Check for no auto-renewal
    if (!contract.autoRenewal && isWithinDays(contract.renewalDate, 90)) {
      indicators.push({
        name: 'Manual Renewal Required',
        value: 'No auto-renewal',
        threshold: 'Auto-renewal enabled',
        exceeded: true,
      });
      riskScore += 20;
    }

    if (indicators.length >= 2) {
      return {
        id: generateId(),
        contractId: contract.id,
        customerId: contract.customerId,
        riskType: RiskType.LATE_RENEWAL,
        riskScore: Math.min(riskScore, 100),
        indicators,
        flaggedAt: new Date(),
        status: RiskStatus.NEW,
      };
    }

    return null;
  }

  /**
   * Detect price sensitivity risk - customer may push back on pricing
   */
  private detectPriceSensitivityRisk(
    contract: Contract,
    invoices: Invoice[]
  ): RenewalRisk | null {
    const indicators: RiskIndicator[] = [];
    let riskScore = 0;

    // Check payment patterns for price sensitivity
    const paidInvoices = invoices.filter(inv => inv.status === InvoiceStatus.PAID);
    
    // Count late payments
    let lateCount = 0;

    for (const invoice of paidInvoices) {
      if (invoice.paidDate) {
        const daysToPay = daysBetween(invoice.dueDate, invoice.paidDate);
        if (daysToPay > 0) {
          lateCount++;
        }
      }
    }

    // Consistent late payments might indicate budget constraints
    const latePaymentRatio = paidInvoices.length > 0 ? lateCount / paidInvoices.length : 0;
    if (latePaymentRatio > 0.5) {
      indicators.push({
        name: 'Frequent Late Payments',
        value: `${(latePaymentRatio * 100).toFixed(0)}%`,
        threshold: '50%',
        exceeded: true,
      });
      riskScore += 35;
    }

    // High contract value relative to payment behavior
    if (contract.totalValue > 25000 && latePaymentRatio > 0.3) {
      indicators.push({
        name: 'Payment Pressure on Large Contract',
        value: contract.totalValue,
        threshold: 25000,
        exceeded: true,
      });
      riskScore += 30;
    }

    // Check for partial payments
    const partialPayments = invoices.filter(inv => inv.status === InvoiceStatus.PARTIAL);
    if (partialPayments.length > 0) {
      indicators.push({
        name: 'History of Partial Payments',
        value: partialPayments.length,
        threshold: 0,
        exceeded: true,
      });
      riskScore += 25;
    }

    if (indicators.length >= 2) {
      return {
        id: generateId(),
        contractId: contract.id,
        customerId: contract.customerId,
        riskType: RiskType.PRICE_SENSITIVITY,
        riskScore: Math.min(riskScore, 100),
        indicators,
        flaggedAt: new Date(),
        status: RiskStatus.NEW,
      };
    }

    return null;
  }

  /**
   * Get all risks
   */
  getRisks(): RenewalRisk[] {
    return this.risks;
  }

  /**
   * Get risks by customer
   */
  getRisksByCustomer(customerId: string): RenewalRisk[] {
    return this.risks.filter(risk => risk.customerId === customerId);
  }

  /**
   * Get risks by contract
   */
  getRisksByContract(contractId: string): RenewalRisk[] {
    return this.risks.filter(risk => risk.contractId === contractId);
  }

  /**
   * Get risks by type
   */
  getRisksByType(riskType: RiskType): RenewalRisk[] {
    return this.risks.filter(risk => risk.riskType === riskType);
  }

  /**
   * Get active risks (not resolved)
   */
  getActiveRisks(): RenewalRisk[] {
    return this.risks.filter(risk => risk.status !== RiskStatus.RESOLVED);
  }

  /**
   * Update risk status
   */
  updateRiskStatus(riskId: string, status: RiskStatus): boolean {
    const risk = this.risks.find(r => r.id === riskId);
    if (risk) {
      risk.status = status;
      logger.info('Risk status updated', { riskId, status });
      return true;
    }
    return false;
  }

  /**
   * Get risk summary
   */
  getRiskSummary(): {
    total: number;
    byType: Record<RiskType, number>;
    byStatus: Record<RiskStatus, number>;
    averageScore: number;
  } {
    const byType: Record<RiskType, number> = {
      [RiskType.CHURN]: 0,
      [RiskType.DOWNGRADE]: 0,
      [RiskType.LATE_RENEWAL]: 0,
      [RiskType.PRICE_SENSITIVITY]: 0,
    };

    const byStatus: Record<RiskStatus, number> = {
      [RiskStatus.NEW]: 0,
      [RiskStatus.ACKNOWLEDGED]: 0,
      [RiskStatus.IN_PROGRESS]: 0,
      [RiskStatus.RESOLVED]: 0,
    };

    let totalScore = 0;

    for (const risk of this.risks) {
      byType[risk.riskType]++;
      byStatus[risk.status]++;
      totalScore += risk.riskScore;
    }

    return {
      total: this.risks.length,
      byType,
      byStatus,
      averageScore: this.risks.length > 0 ? totalScore / this.risks.length : 0,
    };
  }

  /**
   * Clear all risks (for testing)
   */
  clearRisks(): void {
    this.risks = [];
  }
}

export const renewalRiskService = new RenewalRiskService();
