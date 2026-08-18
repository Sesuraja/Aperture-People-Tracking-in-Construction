import { Router, Request, Response } from 'express';
import { addSseSubscriber, removeSseSubscriber } from '../services/sse.js';

export const eventsRouter = Router();

// GET /api/events/subscribe
eventsRouter.get('/subscribe', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Initial connection payload
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  addSseSubscriber(res);

  req.on('close', () => {
    removeSseSubscriber(res);
  });
});
