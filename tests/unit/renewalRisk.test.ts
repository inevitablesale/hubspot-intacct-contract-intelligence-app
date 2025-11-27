import { RenewalRiskService } from '../../src/services/renewalRisk';
import {
  Contract,
  Invoice,
  RenewalHealthScore,
  ContractStatus,
  InvoiceStatus,
  BillingFrequency,
  RiskLevel,
  RiskType,
  RiskStatus,
} from '../../src/models/types';

describe('RenewalRiskService', () => {
  let service: RenewalRiskService;

  beforeEach(() => {
    service = new RenewalRiskService();
    service.clearRisks();
  });

  const createMockContract = (overrides: Partial<Contract> = {}): Contract => ({
    id: 'contract-1',
    customerId: 'customer-1',
    customerName: 'Test Customer',
    contractNumber: 'CTR-001',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    renewalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
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

  const createMockHealthScore = (overrides: Partial<RenewalHealthScore> = {}): RenewalHealthScore => ({
    contractId: 'contract-1',
    customerId: 'customer-1',
    score: 75,
    riskLevel: RiskLevel.MEDIUM,
    factors: [
      { name: 'Invoice Status', weight: 0.25, value: 80, impact: 'positive', description: 'Good' },
      { name: 'Usage Trend', weight: 0.20, value: 70, impact: 'neutral', description: 'Moderate' },
    ],
    recommendations: [],
    calculatedAt: new Date(),
    ...overrides,
  });

  describe('analyzeRenewalRisks', () => {
    it('should detect churn risk for low health score', () => {
      const contract = createMockContract();
      const healthScore = createMockHealthScore({
        score: 30,
        riskLevel: RiskLevel.CRITICAL,
        factors: [
          { name: 'Invoice Status', weight: 0.25, value: 20, impact: 'negative', description: 'Multiple overdue' },
          { name: 'Usage Trend', weight: 0.20, value: 10, impact: 'negative', description: 'Very low usage' },
        ],
      });
      const invoices = [
        createMockInvoice({ status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-2', status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-3', status: InvoiceStatus.OVERDUE }),
      ];

      const risks = service.analyzeRenewalRisks(contract, healthScore, invoices);

      const churnRisks = risks.filter(r => r.riskType === RiskType.CHURN);
      expect(churnRisks.length).toBeGreaterThan(0);
    });

    it('should detect late renewal risk for imminent renewals', () => {
      const contract = createMockContract({
        renewalDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days
        autoRenewal: false,
      });
      const healthScore = createMockHealthScore({ score: 70 });
      const invoices = [
        createMockInvoice({ status: InvoiceStatus.SENT }), // Unpaid invoice
      ];

      const risks = service.analyzeRenewalRisks(contract, healthScore, invoices);

      const lateRenewalRisks = risks.filter(r => r.riskType === RiskType.LATE_RENEWAL);
      expect(lateRenewalRisks.length).toBeGreaterThan(0);
    });

    it('should detect price sensitivity from late payment patterns', () => {
      const contract = createMockContract({ totalValue: 30000 });
      const healthScore = createMockHealthScore({ score: 60 });
      
      const now = new Date();
      const invoices = [
        // Create invoices with late payment history
        createMockInvoice({
          id: 'inv-1',
          status: InvoiceStatus.PAID,
          dueDate: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
          paidDate: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000), // 15 days late
        }),
        createMockInvoice({
          id: 'inv-2',
          status: InvoiceStatus.PAID,
          dueDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          paidDate: new Date(now.getTime() - 70 * 24 * 60 * 60 * 1000), // 20 days late
        }),
        createMockInvoice({
          id: 'inv-3',
          status: InvoiceStatus.PARTIAL,
        }),
      ];

      const risks = service.analyzeRenewalRisks(contract, healthScore, invoices);

      const priceSensitivityRisks = risks.filter(r => r.riskType === RiskType.PRICE_SENSITIVITY);
      expect(priceSensitivityRisks.length).toBeGreaterThan(0);
    });

    it('should detect downgrade risk for moderate health score with low usage', () => {
      const contract = createMockContract({ totalValue: 60000 });
      const healthScore = createMockHealthScore({
        score: 55,
        riskLevel: RiskLevel.MEDIUM,
        factors: [
          { name: 'Usage Trend', weight: 0.20, value: 30, impact: 'negative', description: 'Low usage' },
          { name: 'Invoice Status', weight: 0.25, value: 70, impact: 'neutral', description: 'OK' },
        ],
      });
      const invoices = [createMockInvoice()];

      const risks = service.analyzeRenewalRisks(contract, healthScore, invoices);

      const downgradeRisks = risks.filter(r => r.riskType === RiskType.DOWNGRADE);
      expect(downgradeRisks.length).toBeGreaterThan(0);
    });

    it('should not flag risks for healthy contracts', () => {
      const contract = createMockContract({
        autoRenewal: true,
        renewalDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
      });
      const healthScore = createMockHealthScore({
        score: 90,
        riskLevel: RiskLevel.LOW,
        factors: [
          { name: 'Invoice Status', weight: 0.25, value: 100, impact: 'positive', description: 'All paid' },
          { name: 'Usage Trend', weight: 0.20, value: 85, impact: 'positive', description: 'High usage' },
        ],
      });
      const invoices = [createMockInvoice({ status: InvoiceStatus.PAID })];

      const risks = service.analyzeRenewalRisks(contract, healthScore, invoices);

      // Should have minimal or no risks for a healthy contract
      expect(risks.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getRisks', () => {
    it('should filter by customer', () => {
      const contract1 = createMockContract({ customerId: 'customer-1' });
      const contract2 = createMockContract({ id: 'contract-2', customerId: 'customer-2' });
      const healthScore = createMockHealthScore({
        score: 30,
        riskLevel: RiskLevel.CRITICAL,
        factors: [
          { name: 'Invoice Status', weight: 0.25, value: 20, impact: 'negative', description: 'Bad' },
          { name: 'Usage', weight: 0.20, value: 10, impact: 'negative', description: 'Low' },
        ],
      });
      const invoices = [
        createMockInvoice({ status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-2', status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-3', status: InvoiceStatus.OVERDUE }),
      ];

      service.analyzeRenewalRisks(contract1, healthScore, invoices);
      service.analyzeRenewalRisks(contract2, { ...healthScore, customerId: 'customer-2' }, invoices);

      const customer1Risks = service.getRisksByCustomer('customer-1');
      const customer2Risks = service.getRisksByCustomer('customer-2');

      expect(customer1Risks.every(r => r.customerId === 'customer-1')).toBe(true);
      expect(customer2Risks.every(r => r.customerId === 'customer-2')).toBe(true);
    });

    it('should filter by type', () => {
      const contract = createMockContract({
        renewalDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        autoRenewal: false,
      });
      const healthScore = createMockHealthScore({ score: 35, riskLevel: RiskLevel.HIGH });
      const invoices = [
        createMockInvoice({ status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-2', status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-3', status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-4', status: InvoiceStatus.SENT }),
      ];

      service.analyzeRenewalRisks(contract, healthScore, invoices);

      const churnRisks = service.getRisksByType(RiskType.CHURN);
      const lateRenewalRisks = service.getRisksByType(RiskType.LATE_RENEWAL);

      expect(churnRisks.every(r => r.riskType === RiskType.CHURN)).toBe(true);
      expect(lateRenewalRisks.every(r => r.riskType === RiskType.LATE_RENEWAL)).toBe(true);
    });
  });

  describe('updateRiskStatus', () => {
    it('should update risk status', () => {
      const contract = createMockContract({
        renewalDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        autoRenewal: false,
      });
      const healthScore = createMockHealthScore({ score: 50 });
      const invoices = [createMockInvoice({ status: InvoiceStatus.SENT })];

      const risks = service.analyzeRenewalRisks(contract, healthScore, invoices);
      expect(risks.length).toBeGreaterThan(0);

      const riskId = risks[0].id;
      const result = service.updateRiskStatus(riskId, RiskStatus.IN_PROGRESS);

      expect(result).toBe(true);
      
      const updatedRisks = service.getRisks();
      const updatedRisk = updatedRisks.find(r => r.id === riskId);
      expect(updatedRisk?.status).toBe(RiskStatus.IN_PROGRESS);
    });

    it('should return false for non-existent risk', () => {
      const result = service.updateRiskStatus('non-existent', RiskStatus.RESOLVED);
      expect(result).toBe(false);
    });
  });

  describe('getRiskSummary', () => {
    it('should return summary statistics', () => {
      const contract = createMockContract({
        renewalDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        autoRenewal: false,
      });
      const healthScore = createMockHealthScore({
        score: 30,
        riskLevel: RiskLevel.CRITICAL,
        factors: [
          { name: 'Invoice Status', weight: 0.25, value: 20, impact: 'negative', description: 'Bad' },
          { name: 'Usage', weight: 0.20, value: 10, impact: 'negative', description: 'Low' },
        ],
      });
      const invoices = [
        createMockInvoice({ status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-2', status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-3', status: InvoiceStatus.OVERDUE }),
        createMockInvoice({ id: 'inv-4', status: InvoiceStatus.SENT }),
      ];

      service.analyzeRenewalRisks(contract, healthScore, invoices);

      const summary = service.getRiskSummary();

      expect(summary.total).toBeGreaterThan(0);
      expect(summary.byType).toBeDefined();
      expect(summary.byStatus).toBeDefined();
      expect(typeof summary.averageScore).toBe('number');
    });
  });
});
