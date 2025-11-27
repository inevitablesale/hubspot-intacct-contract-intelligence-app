# HubSpot-Intacct Contract Intelligence App

A HubSpot application that ingests Sage Intacct contract, billing, and subscription data to generate renewal health scores, expansion indicators, and contract risk alerts. Surfaces key dates, utilization metrics, invoice status, and renewal recommendations directly on Company and Deal records.

## Features

- **OAuth Integration**: Secure HubSpot OAuth 2.0 flow for app installation
- **Data Sync**: Automated synchronization of contracts, invoices, and subscriptions from Intacct
- **Renewal Health Scoring**: AI-powered scoring engine that calculates contract health (0-100)
- **Underbilling Detection**: Automatic detection of billing discrepancies and missed invoices
- **Renewal Risk Flagging**: Identifies churn, downgrade, late renewal, and price sensitivity risks
- **CRM Cards**: Real-time contract insights displayed on Company and Deal records
- **Timeline Events**: Automatic creation of timeline events for contract activities
- **Property Writes**: Sync contract data to custom HubSpot properties
- **Dashboard Analytics**: Comprehensive metrics, trends, and risk summaries

## Architecture

```
├── src/
│   ├── app.ts                 # Express application setup
│   ├── index.ts               # Application entry point
│   ├── config/                # Configuration management
│   ├── clients/               # External API clients
│   │   ├── hubspot.ts         # HubSpot API client
│   │   └── intacct.ts         # Sage Intacct API client
│   ├── models/                # TypeScript interfaces and types
│   ├── middleware/            # Express middleware
│   ├── routes/                # API endpoints
│   │   ├── oauth.ts           # OAuth flow endpoints
│   │   ├── sync.ts            # Data sync endpoints
│   │   ├── dashboard.ts       # Dashboard & analytics
│   │   ├── crmCards.ts        # CRM card endpoints
│   │   ├── timeline.ts        # Timeline event endpoints
│   │   └── properties.ts      # Property management
│   ├── services/              # Business logic
│   │   ├── syncService.ts     # Data synchronization
│   │   ├── dashboardService.ts
│   │   ├── underbillingDetector.ts
│   │   └── renewalRisk.ts
│   ├── scoring/               # Renewal health scoring
│   │   └── renewalEngine.ts
│   └── utils/                 # Utility functions
├── tests/
│   ├── unit/                  # Unit tests
│   └── integration/           # Integration tests
└── docs/                      # Documentation
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- HubSpot Developer Account
- Sage Intacct Account

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/hubspot-intacct-contract-intelligence-app.git
   cd hubspot-intacct-contract-intelligence-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables in `.env`:
   ```
   HUBSPOT_CLIENT_ID=your-client-id
   HUBSPOT_CLIENT_SECRET=your-client-secret
   HUBSPOT_REDIRECT_URI=http://localhost:3000/oauth/callback
   HUBSPOT_APP_ID=your-app-id
   
   INTACCT_COMPANY_ID=your-company-id
   INTACCT_USER_ID=your-user-id
   INTACCT_USER_PASSWORD=your-password
   INTACCT_SENDER_ID=your-sender-id
   INTACCT_SENDER_PASSWORD=your-sender-password
   ```

5. Build the application:
   ```bash
   npm run build
   ```

6. Start the server:
   ```bash
   npm start
   ```

### Development

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Type checking
npm run typecheck
```

## API Endpoints

### OAuth
- `GET /oauth/authorize` - Initiate OAuth flow
- `GET /oauth/callback` - Handle OAuth callback
- `GET /oauth/status` - Check connection status
- `POST /oauth/refresh` - Refresh access token

### Sync
- `POST /sync/contracts` - Sync contracts from Intacct
- `POST /sync/invoices` - Sync invoices from Intacct
- `POST /sync/subscriptions` - Sync subscriptions from Intacct
- `POST /sync/full` - Run full sync and analysis
- `GET /sync/status/:syncId` - Get sync status

### Dashboard
- `GET /dashboard/metrics` - Overview metrics
- `GET /dashboard/trends` - Contract trends
- `GET /dashboard/health-distribution` - Health score distribution
- `GET /dashboard/upcoming-renewals` - Upcoming renewals
- `GET /dashboard/at-risk-contracts` - At-risk contracts
- `GET /dashboard/underbilling` - Underbilling summary
- `GET /dashboard/renewal-risks` - Renewal risk summary
- `GET /dashboard/summary` - Complete dashboard summary

### CRM Cards
- `GET /crm-cards/contract-insights` - Contract insights card
- `GET /crm-cards/renewal-health` - Renewal health card
- `GET /crm-cards/billing-alerts` - Billing alerts card

### Timeline Events
- `POST /timeline/contract-synced` - Contract sync event
- `POST /timeline/renewal-risk` - Renewal risk event
- `POST /timeline/underbilling-alert` - Underbilling alert event
- `POST /timeline/health-score-changed` - Health score change event

### Properties
- `POST /properties/update-company` - Update company properties
- `POST /properties/update-deal` - Update deal properties
- `POST /properties/sync-contract-to-company` - Sync contract data to company
- `POST /properties/batch-update-companies` - Batch update companies
- `POST /properties/create-contract-properties` - Create custom properties

## Renewal Health Scoring

The scoring engine evaluates contracts based on multiple factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Invoice Status | 25% | Payment history and overdue invoices |
| Usage Trend | 20% | Product usage and engagement patterns |
| Contract Value | 15% | Total contract value tier |
| Renewal Proximity | 25% | Days until renewal date |
| Payment History | 15% | Historical payment behavior |

### Risk Levels
- **LOW** (80-100): Healthy contract, low risk
- **MEDIUM** (60-79): Some concerns, monitor closely
- **HIGH** (40-59): Significant risk, action needed
- **CRITICAL** (0-39): Immediate attention required

## Underbilling Detection

Automatically detects:
- **Usage Overage**: Usage exceeds contracted limits
- **Missing Invoices**: Expected invoices not generated
- **Rate Mismatches**: Invoice rates don't match contract
- **Quantity Mismatches**: Billed quantities incorrect

## HubSpot Custom Properties

The app creates these custom properties on Company records:

| Property | Type | Description |
|----------|------|-------------|
| `intacct_customer_id` | String | Intacct customer ID |
| `contract_health_score` | Number | Health score (0-100) |
| `contract_risk_level` | Enum | Risk level |
| `contract_value` | Number | Total contract value |
| `contract_renewal_date` | Date | Next renewal date |
| `contract_status` | Enum | Contract status |
| `underbilling_alerts` | Number | Active alert count |
| `days_until_renewal` | Number | Days to renewal |

## Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests in watch mode
npm run test:watch
```

## License

ISC

