import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import { hardwareRouter } from '../src/server/routes/hardware.js';
import { bootstrapDefaultHardware } from '../src/server/services/hardwareIntegrationService.js';
import { upsertDoc } from '../src/server/services/db.js';

const app = express();
app.use(express.json());
app.use('/api/hardware', hardwareRouter);

async function makeRequest(
  path: string,
  options: { method?: string; token?: string; body?: any } = {}
) {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
  };

  return new Promise<{ status: number; body: any }>((resolve) => {
    const req: any = {
      method,
      url: path,
      originalUrl: path,
      headers,
      body: options.body || {},
      query: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      get: (header: string) => headers[header.toLowerCase()] || headers[header],
      header: (header: string) => headers[header.toLowerCase()] || headers[header]
    };

    let resStatus = 200;
    let resBody: any = null;

    const res: any = {
      status: (code: number) => {
        resStatus = code;
        return res;
      },
      setHeader: () => res,
      json: (data: any) => {
        resBody = data;
        resolve({ status: resStatus, body: resBody });
      },
      send: (data: any) => {
        try {
          resBody = JSON.parse(data);
        } catch {
          resBody = data;
        }
        resolve({ status: resStatus, body: resBody });
      }
    };

    app(req, res, (err?: any) => {
      if (err) {
        resolve({ status: 500, body: { error: err.message } });
      } else {
        resolve({ status: 404, body: { error: 'Not found' } });
      }
    });
  });
}

describe('GAO 216031A Physical Hardware Reader Ingestion', () => {
  beforeAll(async () => {
    await upsertDoc('hardware_readers', {
      id: '100EHH8325020026',
      readerId: '100EHH8325020026',
      name: 'Meeting Room Android Reader',
      antennas: [
        { port: 1, name: 'Antenna 1', zoneName: 'Zone 1 - Inside Meeting Room' },
        { port: 2, name: 'Antenna 2', zoneName: 'Zone 2 - Outside Meeting Room' }
      ]
    }, 'default');
  });

  it('successfully receives and processes Adam GAO 216031A native HTTP push payload without requiring auth tokens', async () => {
    const payload = [
      {
        ant: 1,
        count: 1,
        customcode: 'AndroidReader001',
        epc: '000000010000000000051509',
        rssi: 116,
        serialno: '100EHH8325020026',
        timestamp: '2025-09-15 11:12:24.834'
      },
      {
        ant: 2,
        count: 1,
        customcode: 'AndroidReader001',
        epc: 'E2806894',
        rssi: 101,
        serialno: '100EHH8325020026',
        timestamp: '2025-09-15 11:12:24.597'
      }
    ];

    const res = await makeRequest('/api/hardware/gao-native', {
      method: 'POST',
      body: payload
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.processedCount).toBe(2);
    expect(res.body.failedCount).toBe(0);

    // Antenna 1 should resolve to inside meeting room
    const scan1 = res.body.results.find((r: any) => r.epc === '000000010000000000051509');
    expect(scan1).toBeDefined();
    expect(scan1.antenna).toBe(1);
    expect(scan1.resolvedZone).toContain('Meeting Room');

    // Antenna 2 should resolve to outside meeting room
    const scan2 = res.body.results.find((r: any) => r.epc === 'E2806894');
    expect(scan2).toBeDefined();
    expect(scan2.antenna).toBe(2);
    expect(scan2.resolvedZone).toContain('Meeting Room');
  });
});
