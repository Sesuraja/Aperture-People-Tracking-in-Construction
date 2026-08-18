import { Router, Request, Response } from 'express';
import {
  getAllConnections,
  getConnectionById,
  saveConnection,
  deleteConnection,
  buildUrl,
  buildHeaders
} from '../services/connectionsService.js';
import { ingestTelemetry } from '../services/ingestionService.js';
import { pollSingleConnection } from '../services/connectionPoller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const connectionsRouter = Router();

// GET /api/connections - List all connections
connectionsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const list = await getAllConnections();
    return res.json({ success: true, count: list.length, apis: list, connections: list });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to list connections' });
  }
});

// GET /api/connections/:id - Get a connection by ID
connectionsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await getConnectionById(id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }
    return res.json({ success: true, connection: item });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/connections - Create or update connection
connectionsRouter.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.endpointUrl) {
      return res.status(400).json({ success: false, error: 'name and endpointUrl are required' });
    }

    const id = body.id || `api_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const saved = {
      id,
      name: body.name,
      description: body.description || '',
      endpointUrl: body.endpointUrl,
      method: body.method || 'GET',
      authType: body.authType || 'none',
      apiKey: body.apiKey,
      apiKeyHeader: body.apiKeyHeader || 'X-API-Key',
      apiKeyLocation: body.apiKeyLocation || 'header',
      bearerToken: body.bearerToken,
      basicUsername: body.basicUsername,
      basicPassword: body.basicPassword,
      customHeaders: body.customHeaders,
      requestBody: body.requestBody,
      pollingEnabled: body.pollingEnabled !== undefined ? body.pollingEnabled : false,
      pollingIntervalSeconds: Number(body.pollingIntervalSeconds) || 15,
      dataMapping: body.dataMapping,
      lastStatus: body.lastStatus || 'IDLE',
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveConnection(saved);
    return res.json({ success: true, message: 'Connection saved successfully', connection: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/connections/:id - Delete a connection
connectionsRouter.delete('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await getConnectionById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }
    await deleteConnection(id);
    return res.json({ success: true, message: 'Connection removed successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/connections/test - Connection Dry-Run Connection testing
connectionsRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const config = req.body || {};
    if (!config.endpointUrl) {
      return res.status(400).json({ success: false, error: 'endpointUrl is required for testing' });
    }

    const targetUrl = buildUrl(config);
    const headers = buildHeaders(config);
    const startTime = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const fetchOptions: RequestInit = {
        method: config.method || 'GET',
        headers,
        signal: controller.signal
      };

      if (config.method === 'POST' && config.requestBody) {
        fetchOptions.body = config.requestBody;
      }

      const fetchRes = await fetch(targetUrl, fetchOptions);
      const latencyMs = Date.now() - startTime;
      clearTimeout(timeout);

      const rawText = await fetchRes.text();
      let isJson = true;
      let parsed: any = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        isJson = false;
      }

      return res.json({
        success: fetchRes.ok,
        statusCode: fetchRes.status,
        statusText: fetchRes.statusText,
        latencyMs,
        responseHeaders: Object.fromEntries(fetchRes.headers.entries()),
        responseSnippet: rawText.length > 1000 ? rawText.substring(0, 1000) + '...' : rawText,
        isJson,
        parsed
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      return res.json({
        success: false,
        statusCode: 0,
        statusText: 'Network / Connection Failure',
        latencyMs: Date.now() - startTime,
        error: fetchErr.message || 'Failed to reach host endpoint'
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/connections/:id/sync - Trigger manual synchronization of connection
connectionsRouter.post('/:id/sync', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const config = await getConnectionById(id);
    if (!config) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    // Direct background execution
    await pollSingleConnection(config);
    
    // Retrieve updated status after sync runs
    const updated = await getConnectionById(id);
    return res.json({
      success: updated?.lastStatus === 'SUCCESS',
      lastStatus: updated?.lastStatus,
      lastError: updated?.lastError,
      lastLatencyMs: updated?.lastLatencyMs,
      totalRecordsIngested: updated?.totalRecordsIngested
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/connections/hardware/ingest - Direct Device Ingestion Endpoint (Authenticated per-device)
connectionsRouter.post('/hardware/ingest', async (req: Request, res: Response) => {
  try {
    const deviceKey = req.headers['x-device-key'] || req.headers['authorization'] || req.query.deviceKey;
    
    // Standard hardware authorization token verification
    if (!deviceKey || String(deviceKey).trim() === '') {
      return res.status(401).json({ success: false, error: 'Missing device authentication key (X-Device-Key)' });
    }

    const payload = req.body;
    const source = `Hardware Gateways: ${req.headers['x-device-id'] || 'Direct Scanner'}`;

    const result = await ingestTelemetry(payload, source);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    return res.json({
      success: true,
      recordsIngested: result.recordsProcessed,
      aiAnalyzed: result.aiAnalyzed,
      latencyMs: result.latencyMs
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
