import { logger } from '../utils/logger';
import { generateId, daysBetween } from '../utils/helpers';
import {
  Contract,
  Invoice,
  Subscription,
  UnderbillingAlert,
  UnderbillingType,
  AlertSeverity,
  InvoiceStatus,
  BillingFrequency,
} from '../models/types';

/**
 * Underbilling Detection Service
 * Identifies discrepancies between expected and actual billing
 */
export class UnderbillingDetector {
  private alerts: UnderbillingAlert[] = [];

  /**
   * Detect all underbilling issues for a contract
   */
  detectUnderbilling(
    contract: Contract,
    invoices: Invoice[],
    subscriptions: Subscription[]
  ): UnderbillingAlert[] {
    const alerts: UnderbillingAlert[] = [];

    // Check for usage overage
    const usageAlerts = this.detectUsageOverage(contract, subscriptions);
    alerts.push(...usageAlerts);

    // Check for missing invoices
    const missingInvoiceAlerts = this.detectMissingInvoices(contract, invoices);
    alerts.push(...missingInvoiceAlerts);

    // Check for rate mismatches
    const rateAlerts = this.detectRateMismatches(subscriptions, invoices);
    alerts.push(...rateAlerts);

    // Check for quantity mismatches
    const quantityAlerts = this.detectQuantityMismatches(subscriptions, invoices);
    alerts.push(...quantityAlerts);

    // Store alerts
    this.alerts.push(...alerts);

    logger.info('Underbilling detection completed', {
      contractId: contract.id,
      alertCount: alerts.length,
    });

    return alerts;
  }

  /**
   * Detect usage overage that hasn't been billed
   */
  private detectUsageOverage(
    contract: Contract,
    subscriptions: Subscription[]
  ): UnderbillingAlert[] {
    const alerts: UnderbillingAlert[] = [];

    for (const subscription of subscriptions) {
      if (
        subscription.usageAmount !== undefined &&
        subscription.usageLimit !== undefined &&
        subscription.usageAmount > subscription.usageLimit
      ) {
        const overage = subscription.usageAmount - subscription.usageLimit;
        const estimatedOverageValue = overage * (subscription.unitPrice / subscription.quantity);

        alerts.push({
          id: generateId(),
          contractId: contract.id,
          customerId: contract.customerId,
          type: UnderbillingType.USAGE_OVERAGE,
          expectedAmount: estimatedOverageValue,
          actualAmount: 0, // Not billed yet
          difference: estimatedOverageValue,
          period: `${subscription.startDate.toISOString().split('T')[0]} to ${subscription.endDate.toISOString().split('T')[0]}`,
          severity: this.calculateSeverity(estimatedOverageValue),
          detectedAt: new Date(),
          resolved: false,
        });

        logger.warn('Usage overage detected', {
          subscriptionId: subscription.id,
          overage,
          estimatedValue: estimatedOverageValue,
        });
      }
    }

    return alerts;
  }

  /**
   * Detect missing invoices based on billing frequency
   */
  private detectMissingInvoices(
    contract: Contract,
    invoices: Invoice[]
  ): UnderbillingAlert[] {
    const alerts: UnderbillingAlert[] = [];
    
    // Calculate expected number of invoices
    const contractStart = contract.startDate;
    const now = new Date();
    const contractDays = daysBetween(contractStart, now);

    let expectedInvoices: number;
    let expectedPerPeriod: number;

    switch (contract.billingFrequency) {
      case BillingFrequency.MONTHLY:
        expectedInvoices = Math.floor(contractDays / 30);
        expectedPerPeriod = contract.totalValue / 12;
        break;
      case BillingFrequency.QUARTERLY:
        expectedInvoices = Math.floor(contractDays / 90);
        expectedPerPeriod = contract.totalValue / 4;
        break;
      case BillingFrequency.ANNUALLY:
        expectedInvoices = Math.floor(contractDays / 365);
        expectedPerPeriod = contract.totalValue;
        break;
      default:
        return alerts; // One-time billing, can't detect missing
    }

    // Filter relevant invoices
    const relevantInvoices = invoices.filter(
      inv => inv.status !== InvoiceStatus.VOID && inv.status !== InvoiceStatus.DRAFT
    );

    if (relevantInvoices.length < expectedInvoices && expectedInvoices > 0) {
      const missingCount = expectedInvoices - relevantInvoices.length;
      const missingAmount = missingCount * expectedPerPeriod;

      alerts.push({
        id: generateId(),
        contractId: contract.id,
        customerId: contract.customerId,
        type: UnderbillingType.MISSING_INVOICE,
        expectedAmount: missingAmount,
        actualAmount: 0,
        difference: missingAmount,
        period: `Since ${contractStart.toISOString().split('T')[0]}`,
        severity: this.calculateSeverity(missingAmount),
        detectedAt: new Date(),
        resolved: false,
      });

      logger.warn('Missing invoices detected', {
        contractId: contract.id,
        expectedCount: expectedInvoices,
        actualCount: relevantInvoices.length,
        missingAmount,
      });
    }

    return alerts;
  }

  /**
   * Detect rate mismatches between subscriptions and invoices
   */
  private detectRateMismatches(
    subscriptions: Subscription[],
    invoices: Invoice[]
  ): UnderbillingAlert[] {
    const alerts: UnderbillingAlert[] = [];

    for (const subscription of subscriptions) {
      // Find invoices that should include this subscription
      const relevantInvoices = invoices.filter(
        inv => inv.contractId === subscription.contractId &&
               new Date(inv.createdAt) >= subscription.startDate
      );

      for (const invoice of relevantInvoices) {
        // Check if the invoice amount seems too low
        const expectedMinAmount = subscription.totalPrice * 0.9; // 10% tolerance
        
        if (invoice.amount < expectedMinAmount && invoice.status !== InvoiceStatus.VOID) {
          const difference = subscription.totalPrice - invoice.amount;
          
          if (difference > 100) { // Only flag significant differences
            alerts.push({
              id: generateId(),
              contractId: subscription.contractId,
              customerId: subscription.customerId,
              type: UnderbillingType.RATE_MISMATCH,
              expectedAmount: subscription.totalPrice,
              actualAmount: invoice.amount,
              difference,
              period: invoice.invoiceNumber,
              severity: this.calculateSeverity(difference),
              detectedAt: new Date(),
              resolved: false,
            });
          }
        }
      }
    }

    return alerts;
  }

  /**
   * Detect quantity mismatches
   */
  private detectQuantityMismatches(
    subscriptions: Subscription[],
    invoices: Invoice[]
  ): UnderbillingAlert[] {
    const alerts: UnderbillingAlert[] = [];

    // Group subscriptions by contract
    const subsByContract = new Map<string, Subscription[]>();
    for (const sub of subscriptions) {
      const existing = subsByContract.get(sub.contractId) || [];
      existing.push(sub);
      subsByContract.set(sub.contractId, existing);
    }

    // Check each contract's total
    for (const [contractId, subs] of subsByContract) {
      const expectedTotal = subs.reduce((sum, s) => sum + s.totalPrice, 0);
      
      // Get recent invoices for this contract
      const contractInvoices = invoices.filter(inv => inv.contractId === contractId);
      
      if (contractInvoices.length > 0) {
        const recentInvoice = contractInvoices[0];
        const tolerance = expectedTotal * 0.05; // 5% tolerance
        
        if (Math.abs(recentInvoice.amount - expectedTotal) > tolerance && recentInvoice.amount < expectedTotal) {
          alerts.push({
            id: generateId(),
            contractId,
            customerId: subs[0].customerId,
            type: UnderbillingType.QUANTITY_MISMATCH,
            expectedAmount: expectedTotal,
            actualAmount: recentInvoice.amount,
            difference: expectedTotal - recentInvoice.amount,
            period: recentInvoice.invoiceNumber,
            severity: this.calculateSeverity(expectedTotal - recentInvoice.amount),
            detectedAt: new Date(),
            resolved: false,
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Calculate alert severity based on amount
   */
  private calculateSeverity(amount: number): AlertSeverity {
    if (amount >= 10000) {
      return AlertSeverity.HIGH;
    } else if (amount >= 1000) {
      return AlertSeverity.MEDIUM;
    } else {
      return AlertSeverity.LOW;
    }
  }

  /**
   * Get all alerts
   */
  getAlerts(): UnderbillingAlert[] {
    return this.alerts;
  }

  /**
   * Get alerts by customer
   */
  getAlertsByCustomer(customerId: string): UnderbillingAlert[] {
    return this.alerts.filter(alert => alert.customerId === customerId);
  }

  /**
   * Get alerts by contract
   */
  getAlertsByContract(contractId: string): UnderbillingAlert[] {
    return this.alerts.filter(alert => alert.contractId === contractId);
  }

  /**
   * Get unresolved alerts
   */
  getUnresolvedAlerts(): UnderbillingAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      logger.info('Alert resolved', { alertId });
      return true;
    }
    return false;
  }

  /**
   * Clear all alerts (for testing)
   */
  clearAlerts(): void {
    this.alerts = [];
  }
}

export const underbillingDetector = new UnderbillingDetector();
