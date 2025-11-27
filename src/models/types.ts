// Contract data model
export interface Contract {
  id: string;
  customerId: string;
  customerName: string;
  contractNumber: string;
  startDate: Date;
  endDate: Date;
  renewalDate: Date;
  totalValue: number;
  currency: string;
  status: ContractStatus;
  billingFrequency: BillingFrequency;
  autoRenewal: boolean;
  terms: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum ContractStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  RENEWED = 'renewed',
}

export enum BillingFrequency {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually',
  ONE_TIME = 'one_time',
}

// Billing data model
export interface Invoice {
  id: string;
  contractId: string;
  invoiceNumber: string;
  customerId: string;
  amount: number;
  currency: string;
  dueDate: Date;
  paidDate?: Date;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  createdAt: Date;
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  VOID = 'void',
  PARTIAL = 'partial',
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

// Subscription data model
export interface Subscription {
  id: string;
  contractId: string;
  customerId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  usageAmount?: number;
  usageLimit?: number;
  startDate: Date;
  endDate: Date;
  status: SubscriptionStatus;
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

// Renewal Health Score
export interface RenewalHealthScore {
  contractId: string;
  customerId: string;
  score: number; // 0-100
  riskLevel: RiskLevel;
  factors: ScoreFactor[];
  recommendations: string[];
  calculatedAt: Date;
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ScoreFactor {
  name: string;
  weight: number;
  value: number;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

// Underbilling Detection
export interface UnderbillingAlert {
  id: string;
  contractId: string;
  customerId: string;
  type: UnderbillingType;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  period: string;
  severity: AlertSeverity;
  detectedAt: Date;
  resolved: boolean;
}

export enum UnderbillingType {
  USAGE_OVERAGE = 'usage_overage',
  MISSING_INVOICE = 'missing_invoice',
  RATE_MISMATCH = 'rate_mismatch',
  QUANTITY_MISMATCH = 'quantity_mismatch',
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

// Renewal Risk
export interface RenewalRisk {
  id: string;
  contractId: string;
  customerId: string;
  riskType: RiskType;
  riskScore: number;
  indicators: RiskIndicator[];
  flaggedAt: Date;
  status: RiskStatus;
}

export enum RiskType {
  CHURN = 'churn',
  DOWNGRADE = 'downgrade',
  LATE_RENEWAL = 'late_renewal',
  PRICE_SENSITIVITY = 'price_sensitivity',
}

export enum RiskStatus {
  NEW = 'new',
  ACKNOWLEDGED = 'acknowledged',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
}

export interface RiskIndicator {
  name: string;
  value: string | number;
  threshold: string | number;
  exceeded: boolean;
}

// HubSpot Integration Types
export interface HubSpotCompany {
  id: string;
  properties: Record<string, string>;
}

export interface HubSpotDeal {
  id: string;
  properties: Record<string, string>;
}

export interface CRMCardData {
  title: string;
  sections: CRMCardSection[];
  primaryAction?: CRMCardAction;
  secondaryActions?: CRMCardAction[];
}

export interface CRMCardSection {
  id: string;
  title: string;
  topLevelCards: CRMCardTopLevelCard[];
}

export interface CRMCardTopLevelCard {
  title: string;
  body: string | number;
  subTitle?: string;
  style?: 'DEFAULT' | 'WARNING' | 'DANGER' | 'SUCCESS';
}

export interface CRMCardAction {
  type: 'IFRAME' | 'ACTION_HOOK' | 'CONFIRMATION_ACTION_HOOK';
  width: number;
  height: number;
  uri: string;
  label: string;
}

// Timeline Event Types
export interface TimelineEvent {
  eventTemplateId: string;
  objectId: string;
  tokens: Record<string, string | number>;
  extraData?: Record<string, unknown>;
}

// OAuth Types
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  portalId: string;
}

// Sync Status
export interface SyncStatus {
  id: string;
  type: 'contracts' | 'invoices' | 'subscriptions';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  recordsProcessed: number;
  recordsTotal: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

// Dashboard Analytics
export interface DashboardMetrics {
  totalContracts: number;
  activeContracts: number;
  totalContractValue: number;
  renewalsDue30Days: number;
  renewalsDue60Days: number;
  renewalsDue90Days: number;
  atRiskContracts: number;
  criticalRiskContracts: number;
  healthyContracts: number;
  underbillingAlerts: number;
  averageHealthScore: number;
}

export interface ContractTrend {
  period: string;
  newContracts: number;
  renewedContracts: number;
  cancelledContracts: number;
  value: number;
}
