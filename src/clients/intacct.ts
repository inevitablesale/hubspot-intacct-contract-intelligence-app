import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Contract, Invoice, Subscription, ContractStatus, InvoiceStatus, SubscriptionStatus, BillingFrequency } from '../models/types';

interface IntacctResponse<T> {
  success: boolean;
  data: T[];
  totalCount: number;
  error?: string;
}

/**
 * Intacct API Client
 * Handles communication with Sage Intacct API for contract, billing, and subscription data
 */
export class IntacctClient {
  private httpClient: AxiosInstance;
  private sessionId: string | null = null;
  private sessionExpiry: Date | null = null;

  constructor() {
    this.httpClient = axios.create({
      baseURL: config.intacct.endpoint,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  }

  /**
   * Authenticate with Intacct and get session ID
   */
  async authenticate(): Promise<string> {
    if (this.sessionId && this.sessionExpiry && this.sessionExpiry > new Date()) {
      return this.sessionId;
    }

    const requestXml = this.buildAuthRequest();
    
    try {
      const response = await this.httpClient.post('', requestXml);
      this.sessionId = this.parseSessionId(response.data);
      this.sessionExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      logger.info('Intacct authentication successful');
      return this.sessionId;
    } catch (error) {
      logger.error('Intacct authentication failed', { error });
      throw new Error('Failed to authenticate with Intacct');
    }
  }

  /**
   * Get all contracts from Intacct
   */
  async getContracts(offset: number = 0, limit: number = 100): Promise<IntacctResponse<Contract>> {
    await this.authenticate();

    const requestXml = this.buildReadRequest('CONTRACT', offset, limit);
    
    try {
      const response = await this.httpClient.post('', requestXml);
      const contracts = this.parseContracts(response.data);
      
      return {
        success: true,
        data: contracts,
        totalCount: contracts.length,
      };
    } catch (error) {
      logger.error('Failed to fetch contracts from Intacct', { error });
      return {
        success: false,
        data: [],
        totalCount: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get all invoices from Intacct
   */
  async getInvoices(offset: number = 0, limit: number = 100): Promise<IntacctResponse<Invoice>> {
    await this.authenticate();

    const requestXml = this.buildReadRequest('ARINVOICE', offset, limit);
    
    try {
      const response = await this.httpClient.post('', requestXml);
      const invoices = this.parseInvoices(response.data);
      
      return {
        success: true,
        data: invoices,
        totalCount: invoices.length,
      };
    } catch (error) {
      logger.error('Failed to fetch invoices from Intacct', { error });
      return {
        success: false,
        data: [],
        totalCount: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get all subscriptions from Intacct
   */
  async getSubscriptions(offset: number = 0, limit: number = 100): Promise<IntacctResponse<Subscription>> {
    await this.authenticate();

    const requestXml = this.buildReadRequest('SUBSCRIPTION', offset, limit);
    
    try {
      const response = await this.httpClient.post('', requestXml);
      const subscriptions = this.parseSubscriptions(response.data);
      
      return {
        success: true,
        data: subscriptions,
        totalCount: subscriptions.length,
      };
    } catch (error) {
      logger.error('Failed to fetch subscriptions from Intacct', { error });
      return {
        success: false,
        data: [],
        totalCount: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get contract by ID
   */
  async getContractById(contractId: string): Promise<Contract | null> {
    await this.authenticate();

    const requestXml = this.buildReadByIdRequest('CONTRACT', contractId);
    
    try {
      const response = await this.httpClient.post('', requestXml);
      const contracts = this.parseContracts(response.data);
      return contracts.length > 0 ? contracts[0] : null;
    } catch (error) {
      logger.error('Failed to fetch contract from Intacct', { contractId, error });
      return null;
    }
  }

  /**
   * Get invoices by customer ID
   */
  async getInvoicesByCustomer(customerId: string): Promise<Invoice[]> {
    await this.authenticate();

    const requestXml = this.buildQueryRequest('ARINVOICE', `CUSTOMERID = '${customerId}'`);
    
    try {
      const response = await this.httpClient.post('', requestXml);
      return this.parseInvoices(response.data);
    } catch (error) {
      logger.error('Failed to fetch customer invoices from Intacct', { customerId, error });
      return [];
    }
  }

  /**
   * Get subscriptions by contract ID
   */
  async getSubscriptionsByContract(contractId: string): Promise<Subscription[]> {
    await this.authenticate();

    const requestXml = this.buildQueryRequest('SUBSCRIPTION', `CONTRACTID = '${contractId}'`);
    
    try {
      const response = await this.httpClient.post('', requestXml);
      return this.parseSubscriptions(response.data);
    } catch (error) {
      logger.error('Failed to fetch contract subscriptions from Intacct', { contractId, error });
      return [];
    }
  }

  // Private helper methods

  private buildAuthRequest(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${config.intacct.senderId}</senderid>
    <password>${config.intacct.senderPassword}</password>
    <controlid>auth-${Date.now()}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>${config.intacct.userId}</userid>
        <companyid>${config.intacct.companyId}</companyid>
        <password>${config.intacct.userPassword}</password>
      </login>
    </authentication>
    <content>
      <function controlid="getAPISession">
        <getAPISession/>
      </function>
    </content>
  </operation>
</request>`;
  }

  private buildReadRequest(objectType: string, offset: number, limit: number): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${config.intacct.senderId}</senderid>
    <password>${config.intacct.senderPassword}</password>
    <controlid>read-${Date.now()}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <sessionid>${this.sessionId}</sessionid>
    </authentication>
    <content>
      <function controlid="readObjects">
        <readByQuery>
          <object>${objectType}</object>
          <fields>*</fields>
          <query></query>
          <pagesize>${limit}</pagesize>
          <returnFormat>xml</returnFormat>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>`;
  }

  private buildReadByIdRequest(objectType: string, id: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${config.intacct.senderId}</senderid>
    <password>${config.intacct.senderPassword}</password>
    <controlid>readById-${Date.now()}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <sessionid>${this.sessionId}</sessionid>
    </authentication>
    <content>
      <function controlid="readByKey">
        <read>
          <object>${objectType}</object>
          <keys>${id}</keys>
          <fields>*</fields>
        </read>
      </function>
    </content>
  </operation>
</request>`;
  }

  private buildQueryRequest(objectType: string, query: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${config.intacct.senderId}</senderid>
    <password>${config.intacct.senderPassword}</password>
    <controlid>query-${Date.now()}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <sessionid>${this.sessionId}</sessionid>
    </authentication>
    <content>
      <function controlid="queryObjects">
        <readByQuery>
          <object>${objectType}</object>
          <fields>*</fields>
          <query>${query}</query>
          <pagesize>1000</pagesize>
          <returnFormat>xml</returnFormat>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>`;
  }

  private parseSessionId(xmlResponse: string): string {
    const match = xmlResponse.match(/<sessionid>([^<]+)<\/sessionid>/);
    if (!match) {
      throw new Error('Session ID not found in Intacct response');
    }
    return match[1];
  }

  private parseContracts(xmlResponse: string): Contract[] {
    const contracts: Contract[] = [];
    const contractMatches = xmlResponse.matchAll(/<CONTRACT>([\s\S]*?)<\/CONTRACT>/g);
    
    for (const match of contractMatches) {
      const contractXml = match[1];
      contracts.push({
        id: this.extractXmlValue(contractXml, 'RECORDNO') || '',
        customerId: this.extractXmlValue(contractXml, 'CUSTOMERID') || '',
        customerName: this.extractXmlValue(contractXml, 'CUSTOMERNAME') || '',
        contractNumber: this.extractXmlValue(contractXml, 'CONTRACTID') || '',
        startDate: new Date(this.extractXmlValue(contractXml, 'BEGINDATE') || ''),
        endDate: new Date(this.extractXmlValue(contractXml, 'ENDDATE') || ''),
        renewalDate: new Date(this.extractXmlValue(contractXml, 'RENEWALDATE') || ''),
        totalValue: parseFloat(this.extractXmlValue(contractXml, 'TOTALVALUE') || '0'),
        currency: this.extractXmlValue(contractXml, 'CURRENCY') || 'USD',
        status: this.mapContractStatus(this.extractXmlValue(contractXml, 'STATUS') || ''),
        billingFrequency: this.mapBillingFrequency(this.extractXmlValue(contractXml, 'BILLINGFREQUENCY') || ''),
        autoRenewal: this.extractXmlValue(contractXml, 'AUTORENEWAL') === 'true',
        terms: this.extractXmlValue(contractXml, 'TERMNAME') || '',
        createdAt: new Date(this.extractXmlValue(contractXml, 'WHENCREATED') || ''),
        updatedAt: new Date(this.extractXmlValue(contractXml, 'WHENMODIFIED') || ''),
      });
    }
    
    return contracts;
  }

  private parseInvoices(xmlResponse: string): Invoice[] {
    const invoices: Invoice[] = [];
    const invoiceMatches = xmlResponse.matchAll(/<ARINVOICE>([\s\S]*?)<\/ARINVOICE>/g);
    
    for (const match of invoiceMatches) {
      const invoiceXml = match[1];
      invoices.push({
        id: this.extractXmlValue(invoiceXml, 'RECORDNO') || '',
        contractId: this.extractXmlValue(invoiceXml, 'CONTRACTID') || '',
        invoiceNumber: this.extractXmlValue(invoiceXml, 'RECORDID') || '',
        customerId: this.extractXmlValue(invoiceXml, 'CUSTOMERID') || '',
        amount: parseFloat(this.extractXmlValue(invoiceXml, 'TOTALDUE') || '0'),
        currency: this.extractXmlValue(invoiceXml, 'CURRENCY') || 'USD',
        dueDate: new Date(this.extractXmlValue(invoiceXml, 'WHENDUE') || ''),
        paidDate: this.extractXmlValue(invoiceXml, 'WHENPAID') 
          ? new Date(this.extractXmlValue(invoiceXml, 'WHENPAID') || '')
          : undefined,
        status: this.mapInvoiceStatus(this.extractXmlValue(invoiceXml, 'STATE') || ''),
        lineItems: [],
        createdAt: new Date(this.extractXmlValue(invoiceXml, 'WHENCREATED') || ''),
      });
    }
    
    return invoices;
  }

  private parseSubscriptions(xmlResponse: string): Subscription[] {
    const subscriptions: Subscription[] = [];
    const subMatches = xmlResponse.matchAll(/<SUBSCRIPTION>([\s\S]*?)<\/SUBSCRIPTION>/g);
    
    for (const match of subMatches) {
      const subXml = match[1];
      
      // Parse usage values with explicit null checking to handle 0 values correctly
      const usageAmountStr = this.extractXmlValue(subXml, 'USAGEAMOUNT');
      const usageLimitStr = this.extractXmlValue(subXml, 'USAGELIMIT');
      const usageAmount = usageAmountStr !== null ? parseFloat(usageAmountStr) : undefined;
      const usageLimit = usageLimitStr !== null ? parseFloat(usageLimitStr) : undefined;
      
      subscriptions.push({
        id: this.extractXmlValue(subXml, 'RECORDNO') || '',
        contractId: this.extractXmlValue(subXml, 'CONTRACTID') || '',
        customerId: this.extractXmlValue(subXml, 'CUSTOMERID') || '',
        productId: this.extractXmlValue(subXml, 'ITEMID') || '',
        productName: this.extractXmlValue(subXml, 'ITEMNAME') || '',
        quantity: parseFloat(this.extractXmlValue(subXml, 'QUANTITY') || '1'),
        unitPrice: parseFloat(this.extractXmlValue(subXml, 'PRICE') || '0'),
        totalPrice: parseFloat(this.extractXmlValue(subXml, 'TOTAL') || '0'),
        usageAmount: !isNaN(usageAmount as number) ? usageAmount : undefined,
        usageLimit: !isNaN(usageLimit as number) ? usageLimit : undefined,
        startDate: new Date(this.extractXmlValue(subXml, 'BEGINDATE') || ''),
        endDate: new Date(this.extractXmlValue(subXml, 'ENDDATE') || ''),
        status: this.mapSubscriptionStatus(this.extractXmlValue(subXml, 'STATUS') || ''),
      });
    }
    
    return subscriptions;
  }

  private extractXmlValue(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return match ? match[1] : null;
  }

  private mapContractStatus(status: string): ContractStatus {
    const statusMap: Record<string, ContractStatus> = {
      'Active': ContractStatus.ACTIVE,
      'Pending': ContractStatus.PENDING,
      'Expired': ContractStatus.EXPIRED,
      'Cancelled': ContractStatus.CANCELLED,
      'Renewed': ContractStatus.RENEWED,
    };
    return statusMap[status] || ContractStatus.ACTIVE;
  }

  private mapInvoiceStatus(status: string): InvoiceStatus {
    const statusMap: Record<string, InvoiceStatus> = {
      'Draft': InvoiceStatus.DRAFT,
      'Submitted': InvoiceStatus.SENT,
      'Paid': InvoiceStatus.PAID,
      'Overdue': InvoiceStatus.OVERDUE,
      'Void': InvoiceStatus.VOID,
      'Partial': InvoiceStatus.PARTIAL,
    };
    return statusMap[status] || InvoiceStatus.SENT;
  }

  private mapBillingFrequency(frequency: string): BillingFrequency {
    const freqMap: Record<string, BillingFrequency> = {
      'Monthly': BillingFrequency.MONTHLY,
      'Quarterly': BillingFrequency.QUARTERLY,
      'Annually': BillingFrequency.ANNUALLY,
      'One time': BillingFrequency.ONE_TIME,
    };
    return freqMap[frequency] || BillingFrequency.MONTHLY;
  }

  private mapSubscriptionStatus(status: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      'Active': SubscriptionStatus.ACTIVE,
      'Suspended': SubscriptionStatus.SUSPENDED,
      'Cancelled': SubscriptionStatus.CANCELLED,
      'Expired': SubscriptionStatus.EXPIRED,
    };
    return statusMap[status] || SubscriptionStatus.ACTIVE;
  }
}

export const intacctClient = new IntacctClient();
