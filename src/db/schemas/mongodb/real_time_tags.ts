import { z } from 'zod';

export interface RealTimeTagDocument {
  id?: string;
  TagID: string;
  Timestamp: string; // Format: yyyy-MM-dd HH:mm:ss.fff
  Location: string;  // e.g. "Zone1", "d6"
  FirstName?: string;
  LastName?: string;
  rssi?: number;
  status?: string;
  lastSyncAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const realTimeTagSchema = z.object({
  id: z.string().optional(),
  TagID: z.string().min(1, 'TagID is required'),
  Timestamp: z.string(),
  Location: z.string().optional().default('Zone1'),
  FirstName: z.string().optional(),
  LastName: z.string().optional(),
  rssi: z.number().optional().default(-60),
  status: z.string().optional().default('Active'),
  lastSyncAt: z.string().optional()
});
