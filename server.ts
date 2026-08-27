import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initDatabase, startRealTimeTagsCleanupJob } from './src/server/services/db.js';
import { connectionsRouter } from './src/server/routes/connections.js';
import { startPollingService } from './src/server/services/connectionPoller.js';
import { initWebSocketServer } from './src/server/services/websocket.js';
import { authRouter, bootstrapAdminUser } from './src/server/routes/auth.js';
import { adminRouter } from './src/server/routes/admin.js';
import { rfidRouter } from './src/server/routes/rfid.js';
import { aiRouter } from './src/server/routes/ai.js';
import { dataRouter } from './src/server/routes/data.js';
import { eventsRouter } from './src/server/routes/events.js';
import { mongodbRouter } from './src/server/routes/mongodb.js';
import { hardwareRouter } from './src/server/routes/hardware.js';
import { realtimeRouter } from './src/server/routes/realtime.js';
import { demoRouter } from './src/server/routes/demo.js';
import { errorHandler } from './src/server/middleware/errorHandler.js';
import { initMockGaoAdapter } from './src/server/services/mockGaoAdapter.js';

export const app = express();
app.set('trust proxy', 1);

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = http.createServer(app);

  // Helmet HTTP security headers (configured for iframe & SPA compatibility)
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false
  }));

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // CORS restriction
  const configuredOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : [];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS restrictions'));
    },
    credentials: true
  }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/rfid', rfidRouter);
  app.use('/api', rfidRouter); // Register alias routes like /api/GetTagsInRealtime
  app.use('/api', aiRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/mongodb', mongodbRouter);
  app.use('/api/connections', connectionsRouter);
  app.use('/api/integrations', connectionsRouter);
  app.use('/api/hardware', hardwareRouter);
  app.use('/api/realtime', realtimeRouter);
  app.use('/api/demo', demoRouter);

  // Direct GAO RFID Root Aliases (allowing ${host}/GetHistoryTotalCount, ${host}/GetHistoryRecords/10/30, ${host}/GetTagsInRealtime)
  app.use('/GetHistoryTotalCount', rfidRouter);
  app.use('/GetHistoryRecords', rfidRouter);
  app.use('/GetTagsInRealtime', rfidRouter);

  // Centralized Error Handler Middleware
  app.use(errorHandler);

  // Vite development middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Initialize WebSocket and Background Services
  initWebSocketServer(httpServer);

  // Initialize DB asynchronously without blocking HTTP server startup
  initDatabase().then(async () => {
    startRealTimeTagsCleanupJob(15, 60);
    startPollingService();
    await bootstrapAdminUser();
  }).catch((e) => {
    console.warn('[DB Service] Async DB initialization note:', e?.message);
  });

  // Initialize GAO216031A Mock Adapter (bootstraps readers; auto-starts if GAO_SIMULATOR_ENABLED=true)
  initMockGaoAdapter().catch((e: any) => {
    console.warn('[Server] GAO Mock Adapter init warning (non-fatal):', e?.message);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=======================================================`);
    console.log(`🚀 Aperture Construction People Tracking System Ready!`);
    console.log(`🌐 Local Web Dashboard: http://localhost:${PORT}`);
    console.log(`📡 Network Access:      http://0.0.0.0:${PORT}`);
    console.log(`🔌 WebSocket Stream:    ws://localhost:${PORT}/ws`);
    console.log(`=======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal server startup error:', err);
});
