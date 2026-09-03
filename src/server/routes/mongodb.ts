import { Router, Request, Response } from 'express';
import { getMongoStats, testMongoConnection, reconnectDatabase, getMongoUri, isMongoConnected, pruneDuplicateAlerts, purgeLegacySampleWorkers } from '../services/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const mongodbRouter = Router();

// POST /api/mongodb/prune-alerts
mongodbRouter.post('/prune-alerts', async (_req: Request, res: Response) => {
  try {
    const prunedCount = await pruneDuplicateAlerts();
    return res.json({ success: true, prunedCount });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/mongodb/purge-samples
mongodbRouter.post('/purge-samples', async (_req: Request, res: Response) => {
  try {
    await purgeLegacySampleWorkers();
    return res.json({ success: true, message: 'Purged legacy sample worker data from MongoDB Atlas' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/mongodb/status - accessible for system health checks across all tabs
mongodbRouter.get('/status', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const isQuick = req.query.quick === 'true' || req.query.fast === '1';
    if (isQuick) {
      return res.json({
        connected: isMongoConnected(),
        engine: isMongoConnected() ? 'MongoDB Atlas / Cluster' : 'In-Memory Fallback'
      });
    }
    const forceRefresh = req.query.refresh === 'true';
    const stats = await getMongoStats(forceRefresh);
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

// Secure mutation endpoints with Admin authentication
mongodbRouter.use(requireAuth, requireRole('admin'));

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

