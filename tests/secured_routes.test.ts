import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { generateToken } from '../src/server/middleware/auth.js';
import { dataRouter } from '../src/server/routes/data.js';
import { mongodbRouter } from '../src/server/routes/mongodb.js';
import { connectionsRouter } from '../src/server/routes/connections.js';
import { aiRouter } from '../src/server/routes/ai.js';

describe('Secured Routes Access Control', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  const adminUser = { id: 'usr_admin', email: 'admin@gaostaff.com', role: 'admin' };
  const viewerUser = { id: 'usr_viewer', email: 'viewer@example.com', role: 'viewer' };

  const adminToken = generateToken(adminUser);
  const viewerToken = generateToken(viewerUser);

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    app.use('/api/data', dataRouter);
    app.use('/api/mongodb', mongodbRouter);
    app.use('/api/connections', connectionsRouter);
    app.use('/api', aiRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('/api/data/*', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/data/registered_people`);
      expect(res.status).toBe(401);
    });

    it('should allow authenticated users to access data endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/data/stats`, {
        headers: { Authorization: `Bearer ${viewerToken}` }
      });
      expect(res.status).toBe(200);
    });
  });

  describe('/api/mongodb/*', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/mongodb/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mongodbUri: 'mongodb://localhost:27017/test' })
      });
      expect(res.status).toBe(401);
    });

    it('should reject non-admin users with 403', async () => {
      const res = await fetch(`${baseUrl}/api/mongodb/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`
        },
        body: JSON.stringify({ mongodbUri: 'mongodb://localhost:27017/test' })
      });
      expect(res.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const res = await fetch(`${baseUrl}/api/mongodb/status`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(res.status).toBe(200);
    });
  });

  describe('/api/connections/*', () => {
    it('should reject unauthenticated requests on status endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/connections`);
      expect(res.status).toBe(401);
    });

    it('should allow authenticated users on read-only status endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/connections`, {
        headers: { Authorization: `Bearer ${viewerToken}` }
      });
      expect(res.status).toBe(200);
    });

    it('should reject non-admin users on config mutation endpoints with 403', async () => {
      const res = await fetch(`${baseUrl}/api/connections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`
        },
        body: JSON.stringify({ name: 'Test Connection', endpointUrl: 'http://example.com' })
      });
      expect(res.status).toBe(403);
    });

    it('should allow hardware ingest requests when device key is provided', async () => {
      const res = await fetch(`${baseUrl}/api/connections/hardware/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Key': 'aperture_test_device_key'
        },
        body: JSON.stringify([{ TagID: 'TAG_123', Location: 'Zone_A' }])
      });
      expect(res.status).toBe(200);
    });
  });

  describe('/api/ai/config-key', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/ai/config-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: 'test_key' })
      });
      expect(res.status).toBe(401);
    });

    it('should reject non-admin users with 403', async () => {
      const res = await fetch(`${baseUrl}/api/ai/config-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`
        },
        body: JSON.stringify({ geminiApiKey: 'test_key' })
      });
      expect(res.status).toBe(403);
    });

    it('should allow admin users to configure API key', async () => {
      const res = await fetch(`${baseUrl}/api/ai/config-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ geminiApiKey: 'test_key' })
      });
      expect(res.status).toBe(200);
    });
  });
});
