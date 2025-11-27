import { UnderbillingDetector } from '../../src/services/underbillingDetector';
import {
  Contract,
  Invoice,
  Subscription,
  ContractStatus,
  InvoiceStatus,
  SubscriptionStatus,
  BillingFrequency,
  UnderbillingType,
  AlertSeverity,
} from '../../src/models/types';

describe('UnderbillingDetector', () => {
  let detector: UnderbillingDetector;

  beforeEach(() => {
    detector = new UnderbillingDetector();
    detector.clearAlerts();
  });

  const createMockContract = (overrides: Partial<Contract> = {}): Contract => ({
    id: 'contract-1',
    customerId: 'customer-1',
    customerName: 'Test Customer',
    contractNumber: 'CTR-001',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    renewalDate: new Date('2024-12-31'),
    totalValue: 60000,
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

  describe('detectUnderbilling', () => {
    it('should detect usage overage', () => {
      const contract = createMockContract();
      const invoices = [createMockInvoice()];
      const subscriptions = [
        createMockSubscription({
          usageAmount: 1500, // Over limit
          usageLimit: 1000,
        }),
      ];

      const alerts = detector.detectUnderbilling(contract, invoices, subscriptions);

      const usageAlerts = alerts.filter(a => a.type === UnderbillingType.USAGE_OVERAGE);
      expect(usageAlerts.length).toBeGreaterThan(0);
      expect(usageAlerts[0].difference).toBeGreaterThan(0);
    });

    it('should not flag usage overage when within limits', () => {
      const contract = createMockContract();
      const invoices = [createMockInvoice()];
      const subscriptions = [
        createMockSubscription({
          usageAmount: 500, // Under limit
          usageLimit: 1000,
        }),
      ];

      const alerts = detector.detectUnderbilling(contract, invoices, subscriptions);

      const usageAlerts = alerts.filter(a => a.type === UnderbillingType.USAGE_OVERAGE);
      expect(usageAlerts.length).toBe(0);
    });

    it('should detect missing invoices', () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const contract = createMockContract({
        startDate: sixMonthsAgo,
        billingFrequency: BillingFrequency.MONTHLY,
        totalValue: 60000,
      });
      
      // Only 2 invoices for 6 months = 4 missing
      const invoices = [
        createMockInvoice({ status: InvoiceStatus.PAID }),
        createMockInvoice({ id: 'invoice-2', status: InvoiceStatus.PAID }),
      ];
      const subscriptions = [createMockSubscription()];

      const alerts = detector.detectUnderbilling(contract, invoices, subscriptions);

      const missingAlerts = alerts.filter(a => a.type === UnderbillingType.MISSING_INVOICE);
      expect(missingAlerts.length).toBeGreaterThan(0);
    });

    it('should handle one-time billing without flagging missing invoices', () => {
      const contract = createMockContract({
        billingFrequency: BillingFrequency.ONE_TIME,
      });
      const invoices: Invoice[] = [];
      const subscriptions = [createMockSubscription()];

      const alerts = detector.detectUnderbilling(contract, invoices, subscriptions);

      const missingAlerts = alerts.filter(a => a.type === UnderbillingType.MISSING_INVOICE);
      expect(missingAlerts.length).toBe(0);
    });

    it('should calculate severity based on amount', () => {
      const contract = createMockContract();
      const invoices = [createMockInvoice()];
      const subscriptions = [
        createMockSubscription({
          usageAmount: 2000, // 1000 over limit
          usageLimit: 1000,
          unitPrice: 20,
          quantity: 1,
        }),
      ];

      const alerts = detector.detectUnderbilling(contract, invoices, subscriptions);

      expect(alerts.length).toBeGreaterThan(0);
      // Severity should be based on the difference amount
      expect([AlertSeverity.LOW, AlertSeverity.MEDIUM, AlertSeverity.HIGH]).toContain(
        alerts[0].severity
      );
    });
  });

  describe('getAlerts', () => {
    it('should return all alerts', () => {
      const contract = createMockContract();
      const subscriptions = [
        createMockSubscription({
          usageAmount: 1500,
          usageLimit: 1000,
        }),
      ];

      detector.detectUnderbilling(contract, [], subscriptions);
      const alerts = detector.getAlerts();

      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should filter by customer', () => {
      const contract1 = createMockContract({ customerId: 'customer-1' });
      const contract2 = createMockContract({ id: 'contract-2', customerId: 'customer-2' });
      const subscriptions = [
        createMockSubscription({
          usageAmount: 1500,
          usageLimit: 1000,
        }),
      ];

      detector.detectUnderbilling(contract1, [], subscriptions);
      detector.detectUnderbilling(contract2, [], subscriptions);

      const customer1Alerts = detector.getAlertsByCustomer('customer-1');
      const customer2Alerts = detector.getAlertsByCustomer('customer-2');

      expect(customer1Alerts.every(a => a.customerId === 'customer-1')).toBe(true);
      expect(customer2Alerts.every(a => a.customerId === 'customer-2')).toBe(true);
    });
  });

  describe('resolveAlert', () => {
    it('should resolve an existing alert', () => {
      const contract = createMockContract();
      const subscriptions = [
        createMockSubscription({
          usageAmount: 1500,
          usageLimit: 1000,
        }),
      ];

      const alerts = detector.detectUnderbilling(contract, [], subscriptions);
      expect(alerts.length).toBeGreaterThan(0);

      const alertId = alerts[0].id;
      const result = detector.resolveAlert(alertId);

      expect(result).toBe(true);
      
      const unresolvedAlerts = detector.getUnresolvedAlerts();
      expect(unresolvedAlerts.find(a => a.id === alertId)).toBeUndefined();
    });

    it('should return false for non-existent alert', () => {
      const result = detector.resolveAlert('non-existent-id');
      expect(result).toBe(false);
    });
  });
});
