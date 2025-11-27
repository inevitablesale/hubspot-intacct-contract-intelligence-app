import { config } from '../config';
import { logger } from '../utils/logger';
import {
  Contract,
  Invoice,
  Subscription,
  RenewalHealthScore,
  RiskLevel,
  ScoreFactor,
  InvoiceStatus,
} from '../models/types';
import { daysBetween, clamp, calculatePercentage } from '../utils/helpers';

/**
 * Renewal Health Scoring Engine
 * Calculates health scores based on multiple factors to predict renewal likelihood
 */
export class RenewalScoringEngine {
  private weights = config.scoring;

  /**
   * Calculate the overall renewal health score for a contract
   */
  calculateHealthScore(
    contract: Contract,
    invoices: Invoice[],
    subscriptions: Subscription[]
  ): RenewalHealthScore {
    const factors: ScoreFactor[] = [];
    
    // Factor 1: Invoice Payment Status
    const invoiceFactor = this.calculateInvoiceFactor(invoices);
    factors.push(invoiceFactor);

    // Factor 2: Usage/Engagement Trend
    const usageFactor = this.calculateUsageFactor(subscriptions);
    factors.push(usageFactor);

    // Factor 3: Contract Value
    const valueFactor = this.calculateValueFactor(contract);
    factors.push(valueFactor);

    // Factor 4: Renewal Proximity
    const proximityFactor = this.calculateRenewalProximityFactor(contract);
    factors.push(proximityFactor);

    // Factor 5: Payment History
    const paymentFactor = this.calculatePaymentHistoryFactor(invoices);
    factors.push(paymentFactor);

    // Calculate weighted score
    const score = this.calculateWeightedScore(factors);
    const riskLevel = this.determineRiskLevel(score);
    const recommendations = this.generateRecommendations(factors, riskLevel);

    return {
      contractId: contract.id,
      customerId: contract.customerId,
      score,
      riskLevel,
      factors,
      recommendations,
      calculatedAt: new Date(),
    };
  }

  /**
   * Calculate invoice-related health factor
   * Considers overdue invoices, payment delays, etc.
   */
  private calculateInvoiceFactor(invoices: Invoice[]): ScoreFactor {
    if (invoices.length === 0) {
      return {
        name: 'Invoice Status',
        weight: this.weights.invoiceOverdueWeight,
        value: 100,
        impact: 'neutral',
        description: 'No invoices to evaluate',
      };
    }

    const overdueInvoices = invoices.filter(inv => inv.status === InvoiceStatus.OVERDUE);
    const overdueCount = overdueInvoices.length;
    const totalOverdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    
    // Calculate base score based on overdue ratio
    const overdueRatio = overdueCount / invoices.length;
    let factorScore = 100 - (overdueRatio * 100);

    // Additional penalty for high overdue amounts
    if (totalOverdueAmount > 10000) {
      factorScore -= 20;
    } else if (totalOverdueAmount > 5000) {
      factorScore -= 10;
    }

    factorScore = clamp(factorScore, 0, 100);

    return {
      name: 'Invoice Status',
      weight: this.weights.invoiceOverdueWeight,
      value: factorScore,
      impact: factorScore >= 80 ? 'positive' : factorScore >= 50 ? 'neutral' : 'negative',
      description: overdueCount > 0 
        ? `${overdueCount} overdue invoice(s) totaling $${totalOverdueAmount.toFixed(2)}`
        : 'All invoices paid on time',
    };
  }

  /**
   * Calculate usage/engagement trend factor
   * Considers subscription usage patterns
   */
  private calculateUsageFactor(subscriptions: Subscription[]): ScoreFactor {
    if (subscriptions.length === 0) {
      return {
        name: 'Usage Trend',
        weight: this.weights.usageDeclineWeight,
        value: 100,
        impact: 'neutral',
        description: 'No subscriptions to evaluate',
      };
    }

    // Check subscriptions with usage data
    const subsWithUsage = subscriptions.filter(sub => 
      sub.usageAmount !== undefined && sub.usageLimit !== undefined
    );

    if (subsWithUsage.length === 0) {
      return {
        name: 'Usage Trend',
        weight: this.weights.usageDeclineWeight,
        value: 75, // Default neutral score
        impact: 'neutral',
        description: 'No usage data available',
      };
    }

    // Calculate average usage percentage
    const usagePercentages = subsWithUsage.map(sub => 
      calculatePercentage(sub.usageAmount!, sub.usageLimit!)
    );
    const avgUsage = usagePercentages.reduce((a, b) => a + b, 0) / usagePercentages.length;

    // High usage = good engagement, low usage = risk
    let factorScore: number;
    let impact: 'positive' | 'negative' | 'neutral';
    let description: string;

    if (avgUsage >= 70) {
      factorScore = 100;
      impact = 'positive';
      description = `High engagement: ${avgUsage.toFixed(0)}% average usage`;
    } else if (avgUsage >= 40) {
      factorScore = 70;
      impact = 'neutral';
      description = `Moderate engagement: ${avgUsage.toFixed(0)}% average usage`;
    } else if (avgUsage >= 20) {
      factorScore = 40;
      impact = 'negative';
      description = `Low engagement: ${avgUsage.toFixed(0)}% average usage`;
    } else {
      factorScore = 20;
      impact = 'negative';
      description = `Very low engagement: ${avgUsage.toFixed(0)}% average usage - churn risk`;
    }

    return {
      name: 'Usage Trend',
      weight: this.weights.usageDeclineWeight,
      value: factorScore,
      impact,
      description,
    };
  }

  /**
   * Calculate contract value factor
   * Higher value contracts may indicate stronger commitment
   */
  private calculateValueFactor(contract: Contract): ScoreFactor {
    const value = contract.totalValue;
    let factorScore: number;
    let impact: 'positive' | 'negative' | 'neutral';
    let description: string;

    // Tier-based scoring (adjust thresholds based on business)
    if (value >= 100000) {
      factorScore = 100;
      impact = 'positive';
      description = `Enterprise contract: $${value.toLocaleString()}`;
    } else if (value >= 50000) {
      factorScore = 85;
      impact = 'positive';
      description = `Large contract: $${value.toLocaleString()}`;
    } else if (value >= 10000) {
      factorScore = 70;
      impact = 'neutral';
      description = `Mid-tier contract: $${value.toLocaleString()}`;
    } else if (value >= 1000) {
      factorScore = 50;
      impact = 'neutral';
      description = `Small contract: $${value.toLocaleString()}`;
    } else {
      factorScore = 30;
      impact = 'negative';
      description = `Micro contract: $${value.toLocaleString()}`;
    }

    return {
      name: 'Contract Value',
      weight: this.weights.contractValueWeight,
      value: factorScore,
      impact,
      description,
    };
  }

  /**
   * Calculate renewal proximity factor
   * Contracts closer to renewal need more attention
   */
  private calculateRenewalProximityFactor(contract: Contract): ScoreFactor {
    const daysUntilRenewal = daysBetween(new Date(), contract.renewalDate);
    
    let factorScore: number;
    let impact: 'positive' | 'negative' | 'neutral';
    let description: string;

    if (daysUntilRenewal <= 0) {
      factorScore = 20;
      impact = 'negative';
      description = 'Contract has passed renewal date!';
    } else if (daysUntilRenewal <= 30) {
      factorScore = 40;
      impact = 'negative';
      description = `Urgent: ${daysUntilRenewal} days until renewal`;
    } else if (daysUntilRenewal <= 60) {
      factorScore = 60;
      impact = 'neutral';
      description = `Approaching: ${daysUntilRenewal} days until renewal`;
    } else if (daysUntilRenewal <= 90) {
      factorScore = 80;
      impact = 'neutral';
      description = `${daysUntilRenewal} days until renewal`;
    } else {
      factorScore = 100;
      impact = 'positive';
      description = `${daysUntilRenewal} days until renewal - plenty of time`;
    }

    // Auto-renewal bonus
    if (contract.autoRenewal) {
      factorScore = Math.min(factorScore + 10, 100);
      description += ' (Auto-renewal enabled)';
    }

    return {
      name: 'Renewal Proximity',
      weight: this.weights.renewalProximityWeight,
      value: factorScore,
      impact,
      description,
    };
  }

  /**
   * Calculate payment history factor
   * Based on historical payment behavior
   */
  private calculatePaymentHistoryFactor(invoices: Invoice[]): ScoreFactor {
    const paidInvoices = invoices.filter(inv => 
      inv.status === InvoiceStatus.PAID && inv.paidDate
    );

    if (paidInvoices.length === 0) {
      return {
        name: 'Payment History',
        weight: 0.10,
        value: 75,
        impact: 'neutral',
        description: 'No payment history available',
      };
    }

    // Calculate average days to payment
    let totalDaysLate = 0;
    let lateCount = 0;

    for (const invoice of paidInvoices) {
      if (invoice.paidDate) {
        const daysToPay = daysBetween(invoice.dueDate, invoice.paidDate);
        if (daysToPay > 0) {
          totalDaysLate += daysToPay;
          lateCount++;
        }
      }
    }

    const avgDaysLate = lateCount > 0 ? totalDaysLate / lateCount : 0;
    const onTimeRatio = (paidInvoices.length - lateCount) / paidInvoices.length;

    let factorScore = (onTimeRatio * 100) - (avgDaysLate * 2);
    factorScore = clamp(factorScore, 0, 100);

    let impact: 'positive' | 'negative' | 'neutral';
    let description: string;

    if (factorScore >= 80) {
      impact = 'positive';
      description = `Excellent payment history: ${(onTimeRatio * 100).toFixed(0)}% on-time`;
    } else if (factorScore >= 50) {
      impact = 'neutral';
      description = `Average payment history: ${avgDaysLate.toFixed(0)} avg days late`;
    } else {
      impact = 'negative';
      description = `Poor payment history: ${avgDaysLate.toFixed(0)} avg days late`;
    }

    return {
      name: 'Payment History',
      weight: 0.10,
      value: factorScore,
      impact,
      description,
    };
  }

  /**
   * Calculate the weighted total score
   */
  private calculateWeightedScore(factors: ScoreFactor[]): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const factor of factors) {
      weightedSum += factor.value * factor.weight;
      totalWeight += factor.weight;
    }

    // Normalize to 0-100
    const score = totalWeight > 0 ? weightedSum / totalWeight : 50;
    return Math.round(clamp(score, 0, 100));
  }

  /**
   * Determine risk level based on score
   */
  private determineRiskLevel(score: number): RiskLevel {
    if (score >= 80) {
      return RiskLevel.LOW;
    } else if (score >= this.weights.riskThreshold) {
      return RiskLevel.MEDIUM;
    } else if (score >= this.weights.criticalThreshold) {
      return RiskLevel.HIGH;
    } else {
      return RiskLevel.CRITICAL;
    }
  }

  /**
   * Generate recommendations based on risk factors
   */
  private generateRecommendations(factors: ScoreFactor[], riskLevel: RiskLevel): string[] {
    const recommendations: string[] = [];

    // Get negative factors
    const negativeFactors = factors.filter(f => f.impact === 'negative');

    for (const factor of negativeFactors) {
      switch (factor.name) {
        case 'Invoice Status':
          recommendations.push('Follow up on overdue invoices immediately');
          recommendations.push('Consider offering payment plan options');
          break;
        case 'Usage Trend':
          recommendations.push('Schedule customer success check-in');
          recommendations.push('Offer training or onboarding refresher');
          recommendations.push('Review if current plan fits customer needs');
          break;
        case 'Contract Value':
          recommendations.push('Identify upsell opportunities');
          recommendations.push('Review pricing strategy');
          break;
        case 'Renewal Proximity':
          recommendations.push('Initiate renewal conversation immediately');
          recommendations.push('Prepare renewal proposal with value summary');
          break;
        case 'Payment History':
          recommendations.push('Review credit terms with customer');
          recommendations.push('Set up automated payment reminders');
          break;
      }
    }

    // Risk-level specific recommendations
    if (riskLevel === RiskLevel.CRITICAL) {
      recommendations.unshift('CRITICAL: Executive escalation required');
      recommendations.push('Consider retention offer or discount');
    } else if (riskLevel === RiskLevel.HIGH) {
      recommendations.unshift('HIGH PRIORITY: Immediate attention required');
    }

    // Remove duplicates and limit
    return [...new Set(recommendations)].slice(0, 5);
  }

  /**
   * Batch calculate scores for multiple contracts
   */
  calculateBatchScores(
    contracts: Contract[],
    invoicesByContract: Map<string, Invoice[]>,
    subscriptionsByContract: Map<string, Subscription[]>
  ): RenewalHealthScore[] {
    const scores: RenewalHealthScore[] = [];

    for (const contract of contracts) {
      const invoices = invoicesByContract.get(contract.id) || [];
      const subscriptions = subscriptionsByContract.get(contract.id) || [];
      
      try {
        const score = this.calculateHealthScore(contract, invoices, subscriptions);
        scores.push(score);
      } catch (error) {
        logger.error('Failed to calculate health score for contract', { 
          contractId: contract.id, 
          error 
        });
      }
    }

    return scores;
  }
}

export const renewalScoringEngine = new RenewalScoringEngine();
