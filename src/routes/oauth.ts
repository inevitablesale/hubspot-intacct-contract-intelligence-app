import { Router, Request, Response } from 'express';
import { hubspotClient, createHubSpotClient } from '../clients/hubspot';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /oauth/authorize
 * Initiate OAuth flow - redirects to HubSpot authorization
 */
router.get('/authorize', (_req: Request, res: Response) => {
  try {
    const state = Math.random().toString(36).substring(7);
    const authUrl = hubspotClient.getAuthorizationUrl(state);
    
    logger.info('Initiating OAuth flow', { state });
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Failed to initiate OAuth flow', { error });
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

/**
 * GET /oauth/callback
 * Handle OAuth callback from HubSpot
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code) {
    logger.error('OAuth callback missing code');
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    logger.info('Processing OAuth callback', { state });
    
    const tokens = await hubspotClient.exchangeCodeForTokens(code as string);
    
    // Create timeline templates and properties on first connection
    const client = createHubSpotClient(tokens.accessToken);
    await client.createContractProperties();
    await client.createTimelineEventTemplates();

    logger.info('OAuth completed successfully', { portalId: tokens.portalId });

    // Redirect to success page or return JSON based on accept header
    if (req.accepts('html')) {
      res.redirect(`/oauth/success?portalId=${tokens.portalId}`);
    } else {
      res.json({
        success: true,
        portalId: tokens.portalId,
        message: 'OAuth completed successfully',
      });
    }
  } catch (error) {
    logger.error('OAuth callback failed', { error });
    res.status(500).json({ error: 'OAuth failed', message: (error as Error).message });
  }
});

/**
 * GET /oauth/success
 * Success page after OAuth completion
 */
router.get('/success', (req: Request, res: Response) => {
  const { portalId } = req.query;
  
  res.json({
    success: true,
    portalId,
    message: 'HubSpot connection established successfully. You can now close this window.',
  });
});

/**
 * POST /oauth/refresh
 * Manually refresh access token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { portalId } = req.body;

  if (!portalId) {
    res.status(400).json({ error: 'Portal ID is required' });
    return;
  }

  try {
    const tokens = await hubspotClient.refreshAccessToken(portalId);
    res.json({
      success: true,
      expiresAt: tokens.expiresAt,
    });
  } catch (error) {
    logger.error('Token refresh failed', { portalId, error });
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * GET /oauth/status
 * Check OAuth connection status
 */
router.get('/status', (req: Request, res: Response) => {
  const { portalId } = req.query;

  if (!portalId) {
    res.status(400).json({ error: 'Portal ID is required' });
    return;
  }

  const tokens = hubspotClient.getStoredTokens(portalId as string);
  
  if (!tokens) {
    res.json({
      connected: false,
      message: 'No tokens found for this portal',
    });
    return;
  }

  const isExpired = tokens.expiresAt <= new Date();

  res.json({
    connected: true,
    portalId: tokens.portalId,
    expiresAt: tokens.expiresAt,
    isExpired,
  });
});

export default router;
