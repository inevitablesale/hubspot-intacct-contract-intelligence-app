import { RenewalScoringEngine } from '../../src/scoring/renewalEngine';
import {
  Contract,
  Invoice,
  Subscription,
  ContractStatus,
  InvoiceStatus,
  SubscriptionStatus,
  BillingFrequency,
  RiskLevel,
} from '../../src/models/types';

describe('RenewalScoringEngine', () => {
  let engine: RenewalScoringEngine;

  beforeEach(() => {
    engine = new RenewalScoringEngine();
  });

  const createMockContract = (overrides: Partial<Contract> = {}): Contract => ({
    id: 'contract-1',
    customerId: 'customer-1',
    customerName: 'Test Customer',
    contractNumber: 'CTR-001',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    renewalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
    totalValue: 50000,
    currency: 'USD',
    status: ContractStatus.ACTIVE,
    billingFrequency: BillingFrequency.MONTHLY,
    autoRenewal: true,
    terms: 'Annual',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    id: 'invoice-1',
    contractId: 'contract-1',
    invoiceNumber: 'INV-001',
    customerId: 'customer-1',
    amount: 5000,
    currency: 'USD',
    dueDate: new Date(),
    status: InvoiceStatus.PAID,
    paidDate: new Date(),
    lineItems: [],
    createdAt: new Date(),
    ...overrides,
  });

  const createMockSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
    id: 'sub-1',
    contractId: 'contract-1',
    customerId: 'customer-1',
    productId: 'product-1',
    productName: 'Test Product',
    quantity: 10,
    unitPrice: 500,
    totalPrice: 5000,
    usageAmount: 700,
    usageLimit: 1000,
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    status: SubscriptionStatus.ACTIVE,
    ...overrides,
  });

  describe('calculateHealthScore', () => {
    it('should return a health score with all factors', () => {
      const contract = createMockContract();
      const invoices = [createMockInvoice()];
      const subscriptions = [createMockSubscription()];

      const result = engine.calculateHealthScore(contract, invoices, subscriptions);

      expect(result).toBeDefined();
      expect(result.contractId).toBe(contract.id);
      expect(result.customerId).toBe(contract.customerId);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.riskLevel).toBeDefined();
      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.calculatedAt).toBeInstanceOf(Date);
    });

    it('should return HIGH risk level for contracts with overdue invoices', () => {
      const contract = createMockContract();
      const invoices = [
        createMockInvoice({ status: InvoiceStatus.OVERDUE, amount: 10000 }),
        createMockInvoice({ status: InvoiceStatus.OVERDUE, amount: 8000 }),
        createMockInvoice({ status: InvoiceStatus.OVERDUE, amount: 5000 }),
      ];
      const subscriptions = [createMockSubscription({ usageAmount: 100, usageLimit: 1000 })];

      const result = engine.calculateHealthScore(contract, invoices, subscriptions);

      expect(result.riskLevel).toBe(RiskLevel.HIGH);
      expect(result.score).toBeLessThan(60);
    });

    it('should return LOW risk level for healthy contracts', () => {
      const contract = createMockContract({
        autoRenewal: true,
        totalValue: 100000,
        renewalDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
      });
      const invoices = [
        createMockInvoice({ status: InvoiceStatus.PAID }),
        createMockInvoice({ status: InvoiceStatus.PAID }),
      ];
      const subscriptions = [createMockSubscription({ usageAmount: 800, usageLimit: 1000 })];

      const result = engine.calculateHealthScore(contract, invoices, subscriptions);

      expect(result.riskLevel).toBe(RiskLevel.LOW);
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should include recommendations for negative factors', () => {
      const contract = createMockContract({
        renewalDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days
      });
      const invoices = [createMockInvoice({ status: InvoiceStatus.OVERDUE })];
      const subscriptions = [createMockSubscription({ usageAmount: 50, usageLimit: 1000 })];

      const result = engine.calculateHealthScore(contract, invoices, subscriptions);

      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle empty invoices and subscriptions', () => {
      const contract = createMockContract();
      const invoices: Invoice[] = [];
      const subscriptions: Subscription[] = [];

      const result = engine.calculateHealthScore(contract, invoices, subscriptions);

      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should factor in auto-renewal status', () => {
      const contractWithAutoRenewal = createMockContract({ autoRenewal: true });
      const contractWithoutAutoRenewal = createMockContract({ autoRenewal: false });
      const invoices = [createMockInvoice()];
      const subscriptions = [createMockSubscription()];

      const resultWithAuto = engine.calculateHealthScore(contractWithAutoRenewal, invoices, subscriptions);
      const resultWithoutAuto = engine.calculateHealthScore(contractWithoutAutoRenewal, invoices, subscriptions);

      expect(resultWithAuto.score).toBeGreaterThanOrEqual(resultWithoutAuto.score);
    });
  });

  describe('calculateBatchScores', () => {
    it('should calculate scores for multiple contracts', () => {
      const contracts = [
        createMockContract({ id: 'contract-1' }),
        createMockContract({ id: 'contract-2' }),
        createMockContract({ id: 'contract-3' }),
      ];

      const invoicesByContract = new Map<string, Invoice[]>();
      invoicesByContract.set('contract-1', [createMockInvoice({ contractId: 'contract-1' })]);
      invoicesByContract.set('contract-2', [createMockInvoice({ contractId: 'contract-2' })]);

      const subscriptionsByContract = new Map<string, Subscription[]>();
      subscriptionsByContract.set('contract-1', [createMockSubscription({ contractId: 'contract-1' })]);

      const results = engine.calculateBatchScores(contracts, invoicesByContract, subscriptionsByContract);

      expect(results.length).toBe(3);
      expect(results.every(r => r.score >= 0 && r.score <= 100)).toBe(true);
    });
  });
});
