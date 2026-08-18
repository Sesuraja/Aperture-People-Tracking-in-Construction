import { z } from 'zod';

export interface HistoryRecordDocument {
  id?: string;
  TagID: string;
  FirstName: string;
  LastName: string;
  LocationName: string;
  EnterTime: string; // Format: yyyy-MM-dd HH:mm:ss
  LeaveTime: string; // Format: yyyy-MM-dd HH:mm:ss
  EnterTimeStr?: string;
  LeaveTimeStr?: string;
  Duration: number; // Duration in hours e.g. 0.5, 1.2
  createdAt?: string;
  updatedAt?: string;
}

export const historyRecordSchema = z.object({
  id: z.string().optional(),
  TagID: z.string().min(1, 'TagID is required'),
  FirstName: z.string().optional().default('Staff'),
  LastName: z.string().optional().default('User'),
  LocationName: z.string().optional().default('Zone1'),
  EnterTime: z.string(),
  LeaveTime: z.string(),
  EnterTimeStr: z.string().optional(),
  LeaveTimeStr: z.string().optional(),
  Duration: z.number().optional().default(0)
});
