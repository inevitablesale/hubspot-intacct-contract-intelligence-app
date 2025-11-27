import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Error handling middleware
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

/**
 * Request logging middleware
 */
export function requestLogger(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
  });
  next();
}

/**
 * Validate portal ID middleware
 */
export function validatePortalId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const portalId = req.headers['x-hubspot-portal-id'] as string || req.query.portalId as string;
  
  if (!portalId) {
    res.status(400).json({ error: 'Portal ID is required' });
    return;
  }
  
  // Attach to request for use in route handlers
  req.portalId = portalId;
  next();
}

/**
 * Validate HubSpot signature for webhook requests
 */
export function validateHubSpotSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const signature = req.headers['x-hubspot-signature'] as string;
  
  if (!signature && process.env.NODE_ENV === 'production') {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }
  
  // In production, implement proper HMAC validation
  // For now, we'll allow requests through in development
  next();
}

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      portalId?: string;
    }
  }
}
