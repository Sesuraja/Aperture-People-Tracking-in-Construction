import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {}

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initDatabase } from '../src/server/services/db.js';
import { connectionsRouter } from '../src/server/routes/connections.js';
import { authRouter, bootstrapAdminUser } from '../src/server/routes/auth.js';
import { adminRouter } from '../src/server/routes/admin.js';
import { rfidRouter } from '../src/server/routes/rfid.js';
import { aiRouter } from '../src/server/routes/ai.js';
import { dataRouter } from '../src/server/routes/data.js';
import { eventsRouter } from '../src/server/routes/events.js';
import { mongodbRouter } from '../src/server/routes/mongodb.js';
import { hardwareRouter } from '../src/server/routes/hardware.js';
import { realtimeRouter } from '../src/server/routes/realtime.js';
import { demoRouter } from '../src/server/routes/demo.js';
import { errorHandler } from '../src/server/middleware/errorHandler.js';

export const app = express();
app.set('trust proxy', 1);

let dbInitPromise: Promise<void> | null = null;
function ensureDbInit() {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        await initDatabase();
        await bootstrapAdminUser();
      } catch (err) {
        console.error('[Vercel Serverless] DB init error:', err);
      }
    })();
  }
  return dbInitPromise;
}

// Middleware to ensure DB connection on serverless cold starts
app.use(async (req, res, next) => {
  await ensureDbInit();
  next();
});

// Helmet HTTP security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: false
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS
const configuredOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), platform: 'vercel' });
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

// Direct GAO RFID Root Aliases
app.use('/GetHistoryTotalCount', rfidRouter);
app.use('/GetHistoryRecords', rfidRouter);
app.use('/GetTagsInRealtime', rfidRouter);

// Centralized Error Handler Middleware
app.use(errorHandler);

export default app;
