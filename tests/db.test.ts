import { describe, it, expect } from 'vitest';
import {
  getCollectionDocs,
  upsertDoc,
  deleteDocById,
  getDocById,
  logAuditEvent,
  getAuditLogs
} from '../src/server/services/db.js';

describe('Database Service CRUD Helpers', () => {
  it('should upsert and retrieve a document in-memory', async () => {
    const testDoc = {
      id: 'test_doc_001',
      name: 'Test Device Node',
      type: 'UHF Reader',
      status: 'Active'
    };

    const saved = await upsertDoc('devices', testDoc);
    expect(saved.id).toBe('test_doc_001');

    const retrieved = await getDocById('devices', 'test_doc_001');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Test Device Node');
  });

  it('should list all collection documents', async () => {
    const docs = await getCollectionDocs('devices');
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.some(d => d.id === 'test_doc_001')).toBe(true);
  });

  it('should update an existing document on upsert', async () => {
    const updatedDoc = {
      id: 'test_doc_001',
      name: 'Updated Device Node',
      type: 'UHF Reader',
      status: 'Offline'
    };

    await upsertDoc('devices', updatedDoc);
    const retrieved = await getDocById('devices', 'test_doc_001');
    expect(retrieved?.name).toBe('Updated Device Node');
    expect(retrieved?.status).toBe('Offline');
  });

  it('should delete a document by id', async () => {
    const deleted = await deleteDocById('devices', 'test_doc_001');
    expect(deleted).toBe(true);

    const retrieved = await getDocById('devices', 'test_doc_001');
    expect(retrieved).toBeNull();
  });

  it('should record and retrieve audit log entries', async () => {
    await logAuditEvent({
      userId: 'usr_test_123',
      userEmail: 'auditor@test.com',
      action: 'TEST_ACTION',
      resource: 'test_resource',
      details: { foo: 'bar' }
    });

    const logs = await getAuditLogs();
    expect(logs.length).toBeGreaterThan(0);
    const logItem = logs.find(l => l.userEmail === 'auditor@test.com' && l.action === 'TEST_ACTION');
    expect(logItem).toBeDefined();
    expect(logItem.details.foo).toBe('bar');
  });
});
