import { Router, Request, Response } from 'express';
import {
  getPeopleTrackingApiHost,
  setPeopleTrackingApiHost,
  fetchHistoryTotalCount,
  fetchHistoryRecords,
  fetchTagsInRealtime,
  syncPeopleTrackingData,
  getPeopleTrackingSyncStatus
} from '../services/peopleTrackingApiService.js';

export const externalPeopleTrackingRouter = Router();

// GET /api/external-tracking/config - Get current host and sync metrics
externalPeopleTrackingRouter.get('/config', async (_req: Request, res: Response) => {
  try {
    const host = await getPeopleTrackingApiHost();
    const status = getPeopleTrackingSyncStatus();
    return res.json({
      success: true,
      host,
      status
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/external-tracking/config - Update host dynamically without hardcoding
externalPeopleTrackingRouter.post('/config', async (req: Request, res: Response) => {
  try {
    const { host } = req.body || {};
    if (!host || typeof host !== 'string') {
      return res.status(400).json({ success: false, error: 'host URL is required' });
    }
    const updated = await setPeopleTrackingApiHost(host);
    return res.json({
      success: true,
      message: 'People Tracking API host updated successfully',
      host: updated
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/external-tracking/history-total-count - Calls GET ${host}/api/GetHistoryTotalCount
externalPeopleTrackingRouter.get('/history-total-count', async (req: Request, res: Response) => {
  try {
    const customHost = req.query.host ? String(req.query.host) : undefined;
    const result = await fetchHistoryTotalCount(customHost);
    return res.json({
      success: true,
      totalCount: result.totalCount,
      raw: result.raw,
      latencyMs: result.latencyMs
    });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err.message });
  }
});

// GET /api/external-tracking/history-records - Calls GET ${host}/api/GetHistoryRecords/{SkipCount}/{TakeCount}
externalPeopleTrackingRouter.get('/history-records', async (req: Request, res: Response) => {
  try {
    const skip = parseInt(String(req.query.skip || '0'), 10) || 0;
    const take = parseInt(String(req.query.take || '50'), 10) || 50;
    const customHost = req.query.host ? String(req.query.host) : undefined;
    const records = await fetchHistoryRecords(skip, take, customHost);
    return res.json({
      success: true,
      skip,
      take,
      count: records.length,
      records
    });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err.message });
  }
});

// GET /api/external-tracking/tags-realtime - Calls GET ${host}/api/GetTagsInRealtime
externalPeopleTrackingRouter.get('/tags-realtime', async (req: Request, res: Response) => {
  try {
    const customHost = req.query.host ? String(req.query.host) : undefined;
    const tags = await fetchTagsInRealtime(customHost);
    return res.json({
      success: true,
      count: tags.length,
      tags
    });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err.message });
  }
});

// POST /api/external-tracking/sync - Full end-to-end sync through Multi-AI engine into MongoDB with 10-day retention
externalPeopleTrackingRouter.post('/sync', async (req: Request, res: Response) => {
  try {
    const { syncRealtime, syncHistory, historyTake, orgId } = req.body || {};
    const result = await syncPeopleTrackingData({
      syncRealtime: syncRealtime !== undefined ? Boolean(syncRealtime) : true,
      syncHistory: syncHistory !== undefined ? Boolean(syncHistory) : true,
      historyTake: historyTake ? Number(historyTake) : 25,
      orgId: orgId || (req as any).user?.organizationId || (req as any).user?.orgId || 'default'
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
