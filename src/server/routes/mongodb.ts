import { Router, Request, Response } from 'express';
import { getMongoStats, testMongoConnection, reconnectDatabase, getMongoUri } from '../services/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const mongodbRouter = Router();

// Secure all endpoints of this router with Admin authentication by default
mongodbRouter.use(requireAuth, requireRole('admin'));

// GET /api/mongodb/status
mongodbRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const stats = await getMongoStats();
    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({
      connected: false,
      connectionString: getMongoUri(),
      engine: 'In-Memory Fallback',
      collectionsCount: 0,
      totalRecords: 0,
      lastError: err.message || 'Error checking MongoDB status'
    });
  }
});

// POST /api/mongodb/test-connection
mongodbRouter.post('/test-connection', async (req: Request, res: Response) => {
  const { mongodbUri } = req.body || {};
  const uriToTest = mongodbUri || getMongoUri();
  if (!uriToTest || typeof uriToTest !== 'string') {
    return res.status(400).json({ success: false, error: 'MongoDB connection string is required for test' });
  }

  const result = await testMongoConnection(uriToTest);
  return res.json(result);
});

// POST /api/mongodb/config
mongodbRouter.post('/config', async (req: Request, res: Response) => {
  const { mongodbUri } = req.body || {};
  if (!mongodbUri || typeof mongodbUri !== 'string') {
    return res.status(400).json({ success: false, error: 'mongodbUri string is required' });
  }

  const result = await reconnectDatabase(mongodbUri);
  if (result.success) {
    const stats = await getMongoStats();
    return res.json({
      success: true,
      connected: true,
      latencyMs: result.latencyMs,
      stats,
      message: 'MongoDB connection established and runtime configuration saved successfully.'
    });
  } else {
    return res.status(400).json({
      success: false,
      connected: false,
      error: result.error || 'Failed to connect with provided MongoDB connection string'
    });
  }
});

