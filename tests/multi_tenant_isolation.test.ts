import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import { authRouter, bootstrapAdminUser } from '../src/server/routes/auth.js';
import { dataRouter } from '../src/server/routes/data.js';
import { adminRouter } from '../src/server/routes/admin.js';
import { hardwareRouter } from '../src/server/routes/hardware.js';
import { rfidRouter } from '../src/server/routes/rfid.js';
import { seedAllDemoData, getDocById, getCollectionDocs, upsertDoc } from '../src/server/services/db.js';

// Setup test express application
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/data', dataRouter);
app.use('/api/admin', adminRouter);
app.use('/api/hardware', hardwareRouter);
app.use('/api/rfid', rfidRouter);

let tokenCompanyA: string = '';
let tokenCompanyB: string = '';
let tokenDemo: string = '';
let orgIdA: string = '';
let orgIdB: string = '';

async function makeRequest(
  path: string,
  options: { method?: string; token?: string; body?: any } = {}
) {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
  };

  // Simulated in-process request handler
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

    // Extract query params
    const qIdx = path.indexOf('?');
    if (qIdx >= 0) {
      const qs = path.substring(qIdx + 1);
      req.url = path.substring(0, qIdx);
      const searchParams = new URLSearchParams(qs);
      for (const [k, v] of searchParams.entries()) {
        req.query[k] = v;
      }
    }

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

describe('Multi-Tenant B2B SaaS Architecture Verification', () => {
  beforeAll(async () => {
    // Bootstrap test demo admin and test workers
    await bootstrapAdminUser();
    await upsertDoc('registered_people', { id: 'demo_worker_1', name: 'Demo Worker 1', organizationId: 'demo' }, 'demo');
    await upsertDoc('registered_people', { id: 'demo_worker_2', name: 'Demo Worker 2', organizationId: 'demo' }, 'demo');
  });

  it('1. Bootstraps and isolates demo tenant data', async () => {
    // Login as default demo admin
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@aperture.com', password: 'AdminPassword123!' }
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.organizationId).toBe('demo');
    tokenDemo = res.body.token;

    // Verify organization endpoint returns demo organization details
    const orgRes = await makeRequest('/api/auth/organization', {
      token: tokenDemo
    });
    expect(orgRes.status).toBe(200);
    expect(orgRes.body.organization.id).toBe('demo');
    expect(orgRes.body.organization.name).toContain('Demo');
  });

  it('2. Registers Company A with dedicated organizationId', async () => {
    const res = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'admin@acme-builders.com',
        password: 'password123',
        name: 'Alice Acme Admin',
        role: 'admin',
        organizationName: 'Acme Construction Ltd.'
      }
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.organizationId).toBeDefined();
    expect(res.body.user.organizationId).not.toBe('demo');
    tokenCompanyA = res.body.token;
    orgIdA = res.body.user.organizationId;
  });

  it('3. Registers Company B with separate organizationId', async () => {
    const res = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'director@buildcorp-global.com',
        password: 'password123',
        name: 'Bob BuildCorp Director',
        role: 'admin',
        organizationName: 'BuildCorp Global Infrastructure'
      }
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.organizationId).toBeDefined();
    expect(res.body.user.organizationId).not.toBe('demo');
    expect(res.body.user.organizationId).not.toBe(orgIdA);
    tokenCompanyB = res.body.token;
    orgIdB = res.body.user.organizationId;
  });

  it('4. Enforces complete data isolation for CRUD records across tenants', async () => {
    // Company A creates worker A
    const workerA = {
      id: 'worker_acme_001',
      name: 'John Acme',
      role: 'Master Carpenter',
      hardhatTagId: 'TAG-ACME-01',
      currentZone: 'Zone A - Framing'
    };
    const createARes = await makeRequest('/api/data/registered_people', {
      method: 'POST',
      token: tokenCompanyA,
      body: workerA
    });
    expect(createARes.status).toBe(200);
    expect(createARes.body.organizationId).toBe(orgIdA);

    // Company B creates worker B
    const workerB = {
      id: 'worker_buildcorp_002',
      name: 'Brian BuildCorp',
      role: 'Heavy Rigging Lead',
      hardhatTagId: 'TAG-BUILDCORP-02',
      currentZone: 'Zone B - Foundation'
    };
    const createBRes = await makeRequest('/api/data/registered_people', {
      method: 'POST',
      token: tokenCompanyB,
      body: workerB
    });
    expect(createBRes.status).toBe(200);
    expect(createBRes.body.organizationId).toBe(orgIdB);

    // Company A lists registered_people -> sees ONLY worker A
    const listARes = await makeRequest('/api/data/registered_people', {
      token: tokenCompanyA
    });
    expect(listARes.status).toBe(200);
    const workerIdsA = listARes.body.map((w: any) => w.id);
    expect(workerIdsA).toContain('worker_acme_001');
    expect(workerIdsA).not.toContain('worker_buildcorp_002');

    // Company B lists registered_people -> sees ONLY worker B
    const listBRes = await makeRequest('/api/data/registered_people', {
      token: tokenCompanyB
    });
    expect(listBRes.status).toBe(200);
    const workerIdsB = listBRes.body.map((w: any) => w.id);
    expect(workerIdsB).toContain('worker_buildcorp_002');
    expect(workerIdsB).not.toContain('worker_acme_001');
  });

  it('5. Prevents IDOR (Insecure Direct Object Reference) across tenants', async () => {
    // Company A tries to fetch Company B's worker by ID directly
    const idorGet = await makeRequest('/api/data/registered_people/worker_buildcorp_002', {
      token: tokenCompanyA
    });
    expect(idorGet.status).toBe(404);

    // Company A tries to update Company B's worker directly
    const idorUpdate = await makeRequest('/api/data/registered_people/worker_buildcorp_002', {
      method: 'POST',
      token: tokenCompanyA,
      body: { name: 'Hacked Worker Name' }
    });
    expect(idorUpdate.status).toBe(404);

    // Company A tries to delete Company B's worker
    const idorDelete = await makeRequest('/api/data/registered_people/worker_buildcorp_002', {
      method: 'DELETE',
      token: tokenCompanyA
    });
    expect(idorDelete.status).toBe(404);

    // Verify Company B's worker still exists intact
    const verifyB = await makeRequest('/api/data/registered_people/worker_buildcorp_002', {
      token: tokenCompanyB
    });
    expect(verifyB.status).toBe(200);
    expect(verifyB.body.name).toBe('Brian BuildCorp');
  });

  it('6. Scopes dashboard statistics per tenant', async () => {
    // Stats for Company A
    const statsA = await makeRequest('/api/data/stats', {
      token: tokenCompanyA
    });
    expect(statsA.status).toBe(200);
    expect(statsA.body.organizationId).toBe(orgIdA);
    expect(statsA.body.registeredPeopleCount).toBe(1);

    // Stats for Company B
    const statsB = await makeRequest('/api/data/stats', {
      token: tokenCompanyB
    });
    expect(statsB.status).toBe(200);
    expect(statsB.body.organizationId).toBe(orgIdB);
    expect(statsB.body.registeredPeopleCount).toBe(1);

    // Demo stats still include full synthetic demo dataset
    const statsDemo = await makeRequest('/api/data/stats', {
      token: tokenDemo
    });
    expect(statsDemo.status).toBe(200);
    expect(statsDemo.body.organizationId).toBe('demo');
    expect(statsDemo.body.registeredPeopleCount).toBeGreaterThan(1);
  });

  it('7. Enforces tenant scoping on Admin User Management and Audit Logs', async () => {
    // Company A admin creates a user
    const newUserRes = await makeRequest('/api/admin/create-user', {
      method: 'POST',
      token: tokenCompanyA,
      body: {
        email: 'operator@acme-builders.com',
        password: 'password123',
        name: 'Operator Olivia',
        role: 'operator'
      }
    });
    expect(newUserRes.status).toBe(200);
    expect(newUserRes.body.user.email).toBe('operator@acme-builders.com');

    // Company B admin lists users -> cannot see Company A's users
    const usersB = await makeRequest('/api/admin/users', {
      token: tokenCompanyB
    });
    expect(usersB.status).toBe(200);
    const emailsB = usersB.body.users.map((u: any) => u.email);
    expect(emailsB).toContain('director@buildcorp-global.com');
    expect(emailsB).not.toContain('operator@acme-builders.com');
    expect(emailsB).not.toContain('admin@acme-builders.com');

    // Company A admin fetches audit logs -> sees only Company A actions
    const auditLogsA = await makeRequest('/api/admin/audit-logs', {
      token: tokenCompanyA
    });
    expect(auditLogsA.status).toBe(200);
    expect(Array.isArray(auditLogsA.body.logs)).toBe(true);
    for (const log of auditLogsA.body.logs) {
      expect(log.organizationId).toBe(orgIdA);
    }
  });

  it('8. Scopes Hardware Readers and Realtime RFID Ingestion to tenant', async () => {
    // Company A registers a hardware reader
    const readerA = {
      readerId: 'GAO-ACME-READER-01',
      name: 'Acme Gate 1 Portal'
    };
    const createReaderRes = await makeRequest('/api/hardware/readers', {
      method: 'POST',
      token: tokenCompanyA,
      body: readerA
    });
    expect(createReaderRes.status).toBe(200);

    // Company B lists hardware readers -> does not see Company A's reader
    const readersB = await makeRequest('/api/hardware/readers', {
      token: tokenCompanyB
    });
    expect(readersB.status).toBe(200);
    const readerIdsB = readersB.body.readers.map((r: any) => r.readerId);
    expect(readerIdsB).not.toContain('GAO-ACME-READER-01');

    // Perform direct hardware scan with Company A's organizationId
    const scanRes = await makeRequest('/api/hardware/scan', {
      method: 'POST',
      token: tokenCompanyA,
      body: {
        readerId: 'GAO-ACME-READER-01',
        tagId: 'TAG-ACME-01',
        rssi: -54
      }
    });
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.success).toBe(true);

    // Verify Company A live_tags received the scan
    const liveTagsA = await makeRequest('/api/data/live_tags', {
      token: tokenCompanyA
    });
    expect(liveTagsA.status).toBe(200);
    const tagIdsA = liveTagsA.body.map((t: any) => t.TagID || t.id);
    expect(tagIdsA).toContain('TAG-ACME-01');

    // Verify Company B live_tags has NOT received Company A's tag
    const liveTagsB = await makeRequest('/api/data/live_tags', {
      token: tokenCompanyB
    });
    expect(liveTagsB.status).toBe(200);
    const tagIdsB = liveTagsB.body.map((t: any) => t.TagID || t.id);
    expect(tagIdsB).not.toContain('TAG-ACME-01');
  });
});
