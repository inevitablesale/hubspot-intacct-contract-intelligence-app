import { Client } from '@hubspot/api-client';
import { FilterOperatorEnum } from '@hubspot/api-client/lib/codegen/crm/companies/models/Filter';
import { PropertyCreateTypeEnum, PropertyCreateFieldTypeEnum } from '@hubspot/api-client/lib/codegen/crm/properties/models/PropertyCreate';
import { config } from '../config';
import { logger } from '../utils/logger';
import { OAuthTokens, HubSpotCompany, HubSpotDeal, TimelineEvent } from '../models/types';

// In-memory token storage (replace with database in production)
const tokenStore = new Map<string, OAuthTokens>();

/**
 * HubSpot API Client
 * Handles HubSpot OAuth, CRM operations, and timeline events
 */
export class HubSpotClient {
  private client: Client;
  private portalId: string | null = null;

  constructor(accessToken?: string) {
    this.client = new Client({
      accessToken,
    });
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const scopes = config.hubspot.scopes;
    const params = new URLSearchParams({
      client_id: config.hubspot.clientId,
      redirect_uri: config.hubspot.redirectUri,
      scope: scopes.join(' '),
    });

    if (state) {
      params.append('state', state);
    }

    return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    try {
      const result = await this.client.oauth.tokensApi.create(
        'authorization_code',
        code,
        config.hubspot.redirectUri,
        config.hubspot.clientId,
        config.hubspot.clientSecret
      );

      const tokens: OAuthTokens = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: new Date(Date.now() + result.expiresIn * 1000),
        portalId: '',
      };

      // Get portal info
      this.client.setAccessToken(tokens.accessToken);
      const accessTokenInfo = await this.client.oauth.accessTokensApi.get(tokens.accessToken);
      tokens.portalId = accessTokenInfo.hubId?.toString() || '';
      this.portalId = tokens.portalId;

      // Store tokens
      tokenStore.set(tokens.portalId, tokens);

      logger.info('HubSpot OAuth tokens exchanged successfully', { portalId: tokens.portalId });
      return tokens;
    } catch (error) {
      logger.error('Failed to exchange OAuth code for tokens', { error });
      throw new Error('OAuth token exchange failed');
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(portalId: string): Promise<OAuthTokens> {
    const tokens = tokenStore.get(portalId);
    if (!tokens) {
      throw new Error('No tokens found for portal');
    }

    try {
      const result = await this.client.oauth.tokensApi.create(
        'refresh_token',
        undefined,
        undefined,
        config.hubspot.clientId,
        config.hubspot.clientSecret,
        tokens.refreshToken
      );

      const newTokens: OAuthTokens = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: new Date(Date.now() + result.expiresIn * 1000),
        portalId,
      };

      tokenStore.set(portalId, newTokens);
      this.client.setAccessToken(newTokens.accessToken);

      logger.info('HubSpot tokens refreshed successfully', { portalId });
      return newTokens;
    } catch (error) {
      logger.error('Failed to refresh HubSpot tokens', { portalId, error });
      throw new Error('Token refresh failed');
    }
  }

  /**
   * Get stored tokens
   */
  getStoredTokens(portalId: string): OAuthTokens | null {
    return tokenStore.get(portalId) || null;
  }

  /**
   * Set access token for API calls
   */
  setAccessToken(accessToken: string): void {
    this.client.setAccessToken(accessToken);
  }

  /**
   * Ensure valid token before API calls
   */
  async ensureValidToken(portalId: string): Promise<void> {
    const tokens = tokenStore.get(portalId);
    if (!tokens) {
      throw new Error('No tokens found for portal');
    }

    if (tokens.expiresAt <= new Date()) {
      await this.refreshAccessToken(portalId);
    } else {
      this.client.setAccessToken(tokens.accessToken);
    }
  }

  // Company Operations

  /**
   * Get company by ID
   */
  async getCompany(companyId: string): Promise<HubSpotCompany | null> {
    try {
      const response = await this.client.crm.companies.basicApi.getById(companyId);
      return {
        id: response.id,
        properties: response.properties as Record<string, string>,
      };
    } catch (error) {
      logger.error('Failed to get company', { companyId, error });
      return null;
    }
  }

  /**
   * Search companies by domain or custom property
   */
  async searchCompanies(query: string, property: string = 'domain'): Promise<HubSpotCompany[]> {
    try {
      const response = await this.client.crm.companies.searchApi.doSearch({
        filterGroups: [{
          filters: [{
            propertyName: property,
            operator: FilterOperatorEnum.Eq,
            value: query,
          }],
        }],
        limit: 100,
        properties: ['name', 'domain', 'intacct_customer_id', 'contract_health_score'],
        after: '0',
        sorts: [],
      });

      return response.results.map(company => ({
        id: company.id,
        properties: company.properties as Record<string, string>,
      }));
    } catch (error) {
      logger.error('Failed to search companies', { query, property, error });
      return [];
    }
  }

  /**
   * Update company properties
   */
  async updateCompany(companyId: string, properties: Record<string, string>): Promise<boolean> {
    try {
      await this.client.crm.companies.basicApi.update(companyId, {
        properties,
      });
      logger.info('Company updated successfully', { companyId });
      return true;
    } catch (error) {
      logger.error('Failed to update company', { companyId, error });
      return false;
    }
  }

  /**
   * Create custom company properties for contract data
   */
  async createContractProperties(): Promise<boolean> {
    // Properties will be created via HubSpot app settings UI
    // This method provides a programmatic fallback
    try {
      // Note: In production, properties should be defined in the HubSpot app manifest
      // The API approach below requires specific enum types from the HubSpot client
      
      // Simple properties without options
      const simpleProperties = [
        { name: 'intacct_customer_id', label: 'Intacct Customer ID', type: PropertyCreateTypeEnum.String, fieldType: PropertyCreateFieldTypeEnum.Text },
        { name: 'contract_health_score', label: 'Contract Health Score', type: PropertyCreateTypeEnum.Number, fieldType: PropertyCreateFieldTypeEnum.Number },
        { name: 'contract_value', label: 'Total Contract Value', type: PropertyCreateTypeEnum.Number, fieldType: PropertyCreateFieldTypeEnum.Number },
        { name: 'contract_renewal_date', label: 'Contract Renewal Date', type: PropertyCreateTypeEnum.Date, fieldType: PropertyCreateFieldTypeEnum.Date },
        { name: 'underbilling_alerts', label: 'Underbilling Alerts', type: PropertyCreateTypeEnum.Number, fieldType: PropertyCreateFieldTypeEnum.Number },
        { name: 'days_until_renewal', label: 'Days Until Renewal', type: PropertyCreateTypeEnum.Number, fieldType: PropertyCreateFieldTypeEnum.Number },
      ];

      for (const property of simpleProperties) {
        try {
          await this.client.crm.properties.coreApi.create('company', {
            name: property.name,
            label: property.label,
            type: property.type,
            fieldType: property.fieldType,
            groupName: 'companyinformation',
          });
          logger.info('Property created', { property: property.name });
        } catch (error: unknown) {
          // Property might already exist (409) - that's OK
          const err = error as { code?: number; status?: number };
          if (err.code !== 409 && err.status !== 409) {
            logger.warn('Failed to create property', { property: property.name, error });
          }
        }
      }

      // For enumeration properties, we'll skip programmatic creation
      // They should be configured in the HubSpot app settings
      logger.info('Simple properties created. Enumeration properties should be configured in HubSpot app settings.');
      
      return true;
    } catch (error) {
      logger.error('Failed to create contract properties', { error });
      return false;
    }
  }

  // Deal Operations

  /**
   * Get deal by ID
   */
  async getDeal(dealId: string): Promise<HubSpotDeal | null> {
    try {
      const response = await this.client.crm.deals.basicApi.getById(dealId);
      return {
        id: response.id,
        properties: response.properties as Record<string, string>,
      };
    } catch (error) {
      logger.error('Failed to get deal', { dealId, error });
      return null;
    }
  }

  /**
   * Update deal properties
   */
  async updateDeal(dealId: string, properties: Record<string, string>): Promise<boolean> {
    try {
      await this.client.crm.deals.basicApi.update(dealId, {
        properties,
      });
      logger.info('Deal updated successfully', { dealId });
      return true;
    } catch (error) {
      logger.error('Failed to update deal', { dealId, error });
      return false;
    }
  }

  // Timeline Events

  /**
   * Create timeline event
   */
  async createTimelineEvent(event: TimelineEvent): Promise<boolean> {
    try {
      // Convert number tokens to strings for HubSpot API
      const stringTokens: Record<string, string> = {};
      for (const [key, value] of Object.entries(event.tokens)) {
        stringTokens[key] = String(value);
      }
      
      await this.client.crm.timeline.eventsApi.create({
        eventTemplateId: event.eventTemplateId,
        objectId: event.objectId,
        tokens: stringTokens,
        extraData: event.extraData as Record<string, string> | undefined,
      });
      logger.info('Timeline event created', { eventTemplateId: event.eventTemplateId, objectId: event.objectId });
      return true;
    } catch (error) {
      logger.error('Failed to create timeline event', { event, error });
      return false;
    }
  }

  /**
   * Create timeline event templates for contract events
   */
  async createTimelineEventTemplates(): Promise<Record<string, string>> {
    const templates: Record<string, string> = {};

    const templateConfigs = [
      {
        name: 'Contract Synced',
        headerTemplate: 'Contract {{contractNumber}} synced from Intacct',
        detailTemplate: 'Contract value: {{value}} | Status: {{status}} | Renewal: {{renewalDate}}',
        objectType: 'COMPANY',
      },
      {
        name: 'Renewal Risk Detected',
        headerTemplate: 'Renewal risk detected for {{contractNumber}}',
        detailTemplate: 'Risk level: {{riskLevel}} | Score: {{score}} | Factors: {{factors}}',
        objectType: 'COMPANY',
      },
      {
        name: 'Underbilling Alert',
        headerTemplate: 'Underbilling detected: {{amount}} difference',
        detailTemplate: 'Type: {{alertType}} | Expected: {{expected}} | Actual: {{actual}}',
        objectType: 'COMPANY',
      },
      {
        name: 'Health Score Changed',
        headerTemplate: 'Contract health score changed to {{newScore}}',
        detailTemplate: 'Previous score: {{previousScore}} | Change: {{change}}',
        objectType: 'COMPANY',
      },
    ];

    try {
      for (const templateConfig of templateConfigs) {
        try {
          // Timeline templates API requires specific HubSpot app configuration
          // This is a best-effort approach that may not work until app is registered
          const createParams = {
            name: templateConfig.name,
            headerTemplate: templateConfig.headerTemplate,
            detailTemplate: templateConfig.detailTemplate,
            objectType: templateConfig.objectType,
          };
          const appIdNum = parseInt(config.hubspot.appId, 10);
          if (isNaN(appIdNum)) {
            logger.warn('Invalid HubSpot app ID - skipping template creation');
            continue;
          }
          const result = await this.client.crm.timeline.templatesApi.create(
            appIdNum, 
            createParams as Parameters<typeof this.client.crm.timeline.templatesApi.create>[1]
          );
          templates[templateConfig.name] = result.id;
          logger.info('Timeline template created', { name: templateConfig.name, id: result.id });
        } catch (error: unknown) {
          // Template might already exist (409) or app not registered yet
          const err = error as { code?: number; status?: number };
          if (err.code !== 409 && err.status !== 409) {
            logger.warn('Failed to create timeline template', { name: templateConfig.name, error });
          }
        }
      }
      return templates;
    } catch (error) {
      logger.error('Failed to create timeline templates', { error });
      return templates;
    }
  }
}

export function createHubSpotClient(accessToken?: string): HubSpotClient {
  return new HubSpotClient(accessToken);
}

export const hubspotClient = new HubSpotClient();
