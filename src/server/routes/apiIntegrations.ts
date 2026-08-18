import { Router, Request, Response } from 'express';
import {
  getCollectionDocs,
  upsertDoc,
  deleteDocById
} from '../services/db.js';
import {
  testThirdPartyApi,
  executeThirdPartyApiSync,
  ThirdPartyApiConfig,
  bootstrapDefaultThirdPartyApis,
  extractTelemetryFromPayload
} from '../services/apiIntegrationService.js';
import { processTelemetryWithAI } from '../services/aiPipeline.js';

export const apiIntegrationsRouter = Router();

// GET /api/integrations/third-party
apiIntegrationsRouter.get('/third-party', async (req: Request, res: Response) => {
  try {
    await bootstrapDefaultThirdPartyApis();
    const apis = await getCollectionDocs('third_party_apis');
    return res.json({ success: true, count: apis.length, apis });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to list third-party APIs' });
  }
});

// POST /api/integrations/third-party
apiIntegrationsRouter.post('/third-party', async (req: Request, res: Response) => {
  try {
    const config: Partial<ThirdPartyApiConfig> = req.body || {};
    if (!config.name || !config.endpointUrl) {
      return res.status(400).json({ success: false, error: 'name and endpointUrl are required' });
    }

    const nowIso = new Date().toISOString();
    const savedConfig: ThirdPartyApiConfig = {
      id: config.id || `api_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: config.name,
      description: config.description || '',
      endpointUrl: config.endpointUrl,
      method: config.method || 'GET',
      authType: config.authType || 'none',
      apiKey: config.apiKey,
      apiKeyHeader: config.apiKeyHeader || 'X-API-Key',
      apiKeyLocation: config.apiKeyLocation || 'header',
      bearerToken: config.bearerToken,
      basicUsername: config.basicUsername,
      basicPassword: config.basicPassword,
      customHeaders: config.customHeaders,
      requestBody: config.requestBody,
      pollingEnabled: config.pollingEnabled !== undefined ? config.pollingEnabled : true,
      pollingIntervalSeconds: config.pollingIntervalSeconds || 10,
      dataMapping: config.dataMapping,
      lastStatus: config.lastStatus || 'IDLE',
      createdAt: config.createdAt || nowIso,
      updatedAt: nowIso
    };

    await upsertDoc('third_party_apis', savedConfig);
    return res.json({ success: true, message: 'API integration configuration saved in MongoDB', api: savedConfig });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to save API integration' });
  }
});

// DELETE /api/integrations/third-party/:id
apiIntegrationsRouter.delete('/third-party/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteDocById('third_party_apis', id);
    return res.json({ success: deleted, message: deleted ? 'API integration removed' : 'API integration not found' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/integrations/third-party/test (Live connection testing for GET/POST with latency and response inspection)
apiIntegrationsRouter.post('/third-party/test', async (req: Request, res: Response) => {
  try {
    const config: Partial<ThirdPartyApiConfig> = req.body || {};
    if (!config.endpointUrl) {
      return res.status(400).json({ success: false, error: 'endpointUrl is required for testing' });
    }

    const testResult = await testThirdPartyApi(config);
    return res.json(testResult);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Connection test failed' });
  }
});

// POST /api/integrations/third-party/sync (Runs full data flow: API → AI Engine → MongoDB → Dashboard)
apiIntegrationsRouter.post('/third-party/sync', async (req: Request, res: Response) => {
  try {
    const { apiId, config } = req.body || {};
    const target = config || apiId;
    if (!target) {
      return res.status(400).json({ success: false, error: 'apiId or config object is required' });
    }

    const syncResult = await executeThirdPartyApiSync(target);
    return res.json(syncResult);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'API data sync failed' });
  }
});

// POST /api/integrations/third-party/webhook/:id (Incoming external push webhook)
apiIntegrationsRouter.post('/third-party/webhook/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const apis = await getCollectionDocs('third_party_apis');
    const matched = apis.find((a: any) => a.id === id);

    const payload = req.body;
    const telemetry = extractTelemetryFromPayload(payload, matched?.dataMapping);
    
    // Pass into AI pipeline and store in MongoDB
    const aiResult = await processTelemetryWithAI(telemetry, `Webhook API: ${matched?.name || id}`);

    return res.json({
      success: true,
      receivedRecords: telemetry.length,
      aiProcessed: aiResult.processedCount,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
