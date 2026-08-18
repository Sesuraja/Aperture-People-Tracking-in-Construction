import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { aiRouter, markGeminiAuthFailed } from '../src/server/routes/ai.js';

describe('AI Copilot Endpoint Test Suite', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Disable external network attempts during test
    markGeminiAuthFailed('Unit testing mode - bypass outbound network calls');

    app = express();
    app.use(express.json());
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

  it('should accept copilot question with history and context and return structured JSON', async () => {
    const res = await fetch(`${baseUrl}/api/ai-copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Is there any crane exclusion zone breach right now?',
        history: [
          { role: 'user', text: 'Hello Copilot, give me a site safety briefing.' },
          { role: 'assistant', text: 'Site safety index is 94.2%.' }
        ],
        context: {
          activeWorkerTags: 12,
          recentScans: [{ tagId: 'TAG_001', zone: 'Crane Swing Zone' }]
        }
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answer).toBeDefined();
    expect(typeof data.answer).toBe('string');
    expect(Array.isArray(data.suggestedActions)).toBe(true);
    expect(data.suggestedActions.length).toBeGreaterThan(0);
  });

  it('should handle scaffold overcrowding queries with specific actionable insights', async () => {
    const res = await fetch(`${baseUrl}/api/ai-copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Check scaffolding density and overcrowding on Tier 3'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answer).toContain('Scaffolding');
    expect(Array.isArray(data.suggestedActions)).toBe(true);
  });

  it('should reject invalid non-string question payload with 400', async () => {
    const res = await fetch(`${baseUrl}/api/ai-copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 12345
      })
    });

    expect(res.status).toBe(400);
  });
});
