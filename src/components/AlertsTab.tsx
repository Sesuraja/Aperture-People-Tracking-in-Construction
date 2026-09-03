import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AIAlert, AlertCategory, AlertPriority, AlertStatus, AlertComment, AlertRule, EmergencyBroadcast } from '../types';
import { 
  BellRing, AlertTriangle, ShieldAlert, Zap, Radio, HardHat, UserX, 
  Wrench, CloudLightning, Cpu, Search, Filter, CheckCircle2, Clock, 
  ArrowUpRight, UserCheck, MessageSquare, FileText, ChevronRight, X, 
  Plus, Download, Printer, RefreshCw, Send, ShieldCheck, Eye, Shield, 
  MapPin, Camera, Activity, AlertCircle, Info, Sparkles, Flame, Siren, 
  Check, CheckSquare, Wifi, WifiOff, Volume2, VolumeX, BarChart2,
  Sliders, Trash2, Layers, Users, SlidersHorizontal, Layers3, Play,
  Database
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDocs, db } from '../lib/db';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';
import { useWebSocket } from '../lib/useWebSocket';
import { useTerminology } from '../context/TrackingContext';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, PieChart, Pie, Cell, CartesianGrid } from 'recharts';


const CATEGORY_CONFIG: Record<AlertCategory, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  Emergency: { icon: Siren, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200 dark:border-rose-800' },
  Safety: { icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800' },
  Security: { icon: Shield, color: 'text-rose-700', bg: 'bg-rose-100/60 dark:bg-rose-900/40', border: 'border-rose-300 dark:border-rose-800' },
  Equipment: { icon: Zap, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-800' },
  Reader: { icon: Radio, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-200 dark:border-indigo-800' },
  Worker: { icon: HardHat, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800' },
  Visitor: { icon: UserX, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-200 dark:border-violet-800' },
  Maintenance: { icon: Wrench, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800' },
  Weather: { icon: CloudLightning, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-200 dark:border-cyan-800' },
  System: { icon: Cpu, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-300 dark:border-slate-700' }
};

const CATEGORIES_LIST: AlertCategory[] = [
  'Emergency', 'Safety', 'Security', 'Equipment', 
  'Reader', 'Worker', 'Visitor', 'Maintenance', 
  'Weather', 'System'
];

const OFFICERS_LIST = [
  'Operations Duty Lead',
  'Field Safety Lead',
  'Facility Equipment Manager',
  'Gate Security Lead',
  'IT Network Systems Admin',
  'Site Operations Duty Manager'
];

function formatAlertTimestamp(ts: any): string {
  if (!ts) return '';
  if (typeof ts === 'string') return ts;
  if (ts instanceof Date) {
    return ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof ts.seconds === 'number') {
    return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  try {
    return String(ts);
  } catch {
    return '';
  }
}

function getTimestampMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.getTime === 'function') return ts.getTime();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

import { INDUSTRY_PRESET_PROFILES } from '../types/industryIntelligence';

export interface AIRuleDefinition {
  id: string;
  name: string;
  tier: 'Critical' | 'Warning' | 'Information';
  tierEmoji: '🔴' | '🟠' | '🔵';
  category: AlertCategory;
  defaultZone: string;
  description: string;
  sampleMessage: string;
  triggerSiren: boolean;
  priority: AlertPriority;
}

export const AI_ALERT_RULES_CATALOG: AIRuleDefinition[] = [
  // 🔴 Critical
  {
    id: 'after_hours_entry',
    name: 'After-hours meeting room entry',
    tier: 'Critical',
    tierEmoji: '🔴',
    category: 'Security',
    defaultZone: 'Executive Meeting Room A',
    description: 'Triggered when badge access is recorded outside facility operating hours (19:00 - 07:00).',
    sampleMessage: 'Unauthorized personnel detected in Executive Meeting Room A outside operating hours (21:45).',
    triggerSiren: true,
    priority: 'Critical'
  },
  {
    id: 'capacity_exceeded',
    name: 'Capacity exceeded',
    tier: 'Critical',
    tierEmoji: '🔴',
    category: 'Safety',
    defaultZone: 'Main Conference Suite',
    description: 'Triggered when active room occupant count exceeds the designated safe capacity threshold.',
    sampleMessage: 'Active headcount in Main Conference Suite reached 12 occupants, exceeding maximum limit of 8.',
    triggerSiren: true,
    priority: 'Critical'
  },
  {
    id: 'unknown_tag_detected',
    name: 'Unknown/unassigned tag detected',
    tier: 'Critical',
    tierEmoji: '🔴',
    category: 'Security',
    defaultZone: 'Facility Secure Gate 1',
    description: 'Triggered when an unregistered UHF RFID tag or unassigned worker badge transponder is detected.',
    sampleMessage: 'Unregistered UHF RFID transponder [TAG_UNKNOWN_9921] detected at Facility Secure Gate 1 without assigned personnel profile.',
    triggerSiren: true,
    priority: 'Critical'
  },
  {
    id: 'persistent_zone_conflict',
    name: 'Persistent zone detection conflict',
    tier: 'Critical',
    tierEmoji: '🔴',
    category: 'System',
    defaultZone: 'Zone 1 & Zone 2 Boundary Array',
    description: 'Triggered when contradictory antenna portals simultaneously register the same tag ID.',
    sampleMessage: 'Tag E28011606000020788842D21 detected across contradictory antennas (Portal Gate 1 & Boardroom Array) simultaneously.',
    triggerSiren: false,
    priority: 'Critical'
  },
  // 🟠 Warning
  {
    id: 'meeting_overstay',
    name: 'Meeting room overstay',
    tier: 'Warning',
    tierEmoji: '🟠',
    category: 'Worker',
    defaultZone: 'Meeting Room B',
    description: 'Triggered when meeting room occupancy duration exceeds scheduled reservation (>60m).',
    sampleMessage: 'Personnel John Doe Testing occupied Meeting Room B for 82 minutes (exceeding 45-minute scheduled reservation).',
    triggerSiren: false,
    priority: 'High'
  },
  {
    id: 'repeated_zone_movement',
    name: 'Repeated zone movement',
    tier: 'Warning',
    tierEmoji: '🟠',
    category: 'Worker',
    defaultZone: 'Corridor & Staging Bay',
    description: 'Triggered when rapid oscillation between adjacent zone boundaries is detected.',
    sampleMessage: 'Rapid zone oscillation (6 transitions in 4 mins) detected for worker John Miller between Staging Bay and Hallway.',
    triggerSiren: false,
    priority: 'High'
  },
  {
    id: 'unusual_movement_pattern',
    name: 'Unusual movement pattern',
    tier: 'Warning',
    tierEmoji: '🟠',
    category: 'Safety',
    defaultZone: 'Pedestrian Walkway Sector',
    description: 'Triggered when velocity anomalies (>3.0 m/s) or erratic worker trajectories are detected.',
    sampleMessage: 'Kinematic speed anomaly: Velocity of 3.6 m/s recorded for personnel inside pedestrian-restricted Zone 2 corridor.',
    triggerSiren: false,
    priority: 'Medium'
  },
  {
    id: 'zone_detection_overlap',
    name: 'Zone detection overlap',
    tier: 'Warning',
    tierEmoji: '🟠',
    category: 'Reader',
    defaultZone: 'Antenna Portal Array 3',
    description: 'Triggered when overlapping RFID antenna lobes produce boundary read jitter.',
    sampleMessage: 'High-power RF lobe interference (-44 dBm / -48 dBm) registered at Antenna Portal Array 3 boundary.',
    triggerSiren: false,
    priority: 'Medium'
  },
  // 🔵 Information
  {
    id: 'person_entered_room',
    name: 'Person entered meeting room',
    tier: 'Information',
    tierEmoji: '🔵',
    category: 'Worker',
    defaultZone: 'Conference Suite 1',
    description: 'Informational log generated when verified personnel enter a meeting room.',
    sampleMessage: 'Staff User (TAG_123) entered Conference Suite 1.',
    triggerSiren: false,
    priority: 'Low'
  },
  {
    id: 'person_left_room',
    name: 'Person left meeting room',
    tier: 'Information',
    tierEmoji: '🔵',
    category: 'Worker',
    defaultZone: 'Conference Suite 1',
    description: 'Informational log generated when personnel exit a meeting room with dwell duration.',
    sampleMessage: 'Staff User departed Conference Suite 1 after 38 minutes dwell.',
    triggerSiren: false,
    priority: 'Low'
  },
  {
    id: 'person_in_room',
    name: 'Person currently in meeting room',
    tier: 'Information',
    tierEmoji: '🔵',
    category: 'Worker',
    defaultZone: 'Executive Boardroom',
    description: 'Continuous presence heartbeat confirming personnel active in meeting room.',
    sampleMessage: 'Active heartbeat presence verified for John Doe Testing in Executive Boardroom.',
    triggerSiren: false,
    priority: 'Low'
  },
  {
    id: 'occupancy_changed',
    name: 'Occupancy changed',
    tier: 'Information',
    tierEmoji: '🔵',
    category: 'Operational' as AlertCategory,
    defaultZone: 'Training & Meeting Hall',
    description: 'Room headcount delta event logged as personnel enter or leave.',
    sampleMessage: 'Occupancy headcount in Training & Meeting Hall updated from 5 to 6 persons.',
    triggerSiren: false,
    priority: 'Low'
  },
  {
    id: 'tag_detected',
    name: 'Tag detected',
    tier: 'Information',
    tierEmoji: '🔵',
    category: 'Reader',
    defaultZone: 'Facility Entrance Portal',
    description: 'Routine antenna beacon telemetry scan acknowledged and logged.',
    sampleMessage: 'UHF RFID badge transponder E28011606000020788842D21 scanned at Facility Entrance Portal (RSSI: -58 dBm).',
    triggerSiren: false,
    priority: 'Low'
  }
];

const DEFAULT_AI_ALERTS: AIAlert[] = [
  // 🔴 Critical
  {
    id: 'ALT-CRIT-101',
    type: 'security',
    category: 'Security',
    priority: 'Critical',
    status: 'New',
    title: 'After-hours meeting room entry',
    message: 'Unauthorized personnel [Staff User / TAG_123] entered Executive Meeting Room A outside operating hours (21:45).',
    timestamp: new Date(Date.now() - 6 * 60000),
    assignedTo: 'Operations Duty Lead',
    assignedRole: 'Security Lead',
    aiSummary: {
      rootCause: 'Cardholder access recorded during locked facility window (19:00 - 07:00).',
      threatScore: 92,
      recommendedActions: [
        'Dispatch gatehouse officer to verify credentials.',
        'Review CCTV camera stream for Executive Meeting Room A.',
        'Validate after-hours work permit authorization.'
      ]
    },
    evidence: {
      locationZone: 'Executive Meeting Room A',
      cctvCameraId: 'CAM-MEET-01',
      rfidReaderId: 'RD-EXEC-PORTAL',
      rfidTagId: 'TAG_123',
      telemetryLog: '[AI_RULE_CRITICAL] After-hours entry detected at 21:45:12 in Executive Meeting Room A.'
    }
  },
  {
    id: 'ALT-CRIT-102',
    type: 'security',
    category: 'Safety',
    priority: 'Critical',
    status: 'In Progress',
    title: 'Capacity exceeded',
    message: 'Active headcount in Main Conference Suite reached 12 occupants, exceeding maximum safety limit of 8.',
    timestamp: new Date(Date.now() - 15 * 60000),
    assignedTo: 'Field Safety Lead',
    assignedRole: 'Safety Lead',
    aiSummary: {
      rootCause: 'Room headcount surged beyond fire marshal safety threshold.',
      threatScore: 88,
      recommendedActions: [
        'Notify meeting organizer to adhere to room capacity limits.',
        'Re-route excess attendees to overflow conference annex.',
        'Verify emergency egress pathways remain unobstructed.'
      ]
    },
    evidence: {
      locationZone: 'Main Conference Suite',
      cctvCameraId: 'CAM-CONF-MAIN',
      rfidReaderId: 'RD-CONF-PORTAL',
      telemetryLog: '[AI_RULE_CRITICAL] Headcount: 12 / Capacity: 8. Density limit exceeded.'
    }
  },
  {
    id: 'ALT-CRIT-103',
    type: 'security',
    category: 'Security',
    priority: 'Critical',
    status: 'New',
    title: 'Unknown/unassigned tag detected',
    message: 'Unregistered UHF RFID transponder [TAG_UNKNOWN_9921] detected at Facility Secure Gate 1 without assigned personnel profile.',
    timestamp: new Date(Date.now() - 25 * 60000),
    assignedTo: 'Gate Security Lead',
    assignedRole: 'Security Officer',
    aiSummary: {
      rootCause: 'Rogue or unprovisioned transponder beacon detected in active portal beam.',
      threatScore: 95,
      recommendedActions: [
        'Intercept individual at Gate 1 turnstile.',
        'Enroll or confiscate unprovisioned transponder.',
        'Log visitor badge reconciliation audit.'
      ]
    },
    evidence: {
      locationZone: 'Facility Secure Gate 1',
      cctvCameraId: 'CAM-GATE-1A',
      rfidReaderId: 'RD-GATE-01-TURNSTILE',
      rfidTagId: 'TAG_UNKNOWN_9921',
      telemetryLog: '[AI_RULE_CRITICAL] Unregistered tag detected in active RFID beam.'
    }
  },
  {
    id: 'ALT-CRIT-104',
    type: 'security',
    category: 'System',
    priority: 'Critical',
    status: 'New',
    title: 'Persistent zone detection conflict',
    message: 'Tag E28011606000020788842D21 detected across contradictory antennas (Portal Gate 1 & Boardroom Array) simultaneously.',
    timestamp: new Date(Date.now() - 35 * 60000),
    assignedTo: 'IT Network Systems Admin',
    assignedRole: 'Systems Admin',
    aiSummary: {
      rootCause: 'RF reflection multipath loop or dual simultaneous antenna boundary read conflict.',
      threatScore: 84,
      recommendedActions: [
        'Calibrate antenna gain and signal RSSI squelch thresholds.',
        'Verify portal isolation barrier.'
      ]
    },
    evidence: {
      locationZone: 'Portal Gate 1 & Boardroom Array',
      rfidReaderId: 'RD-ARRAY-03',
      rfidTagId: 'E28011606000020788842D21',
      telemetryLog: '[AI_RULE_CRITICAL] Simultaneous dual-portal read conflict logged.'
    }
  },
  // 🟠 Warning
  {
    id: 'ALT-WARN-201',
    type: 'warning',
    category: 'Worker',
    priority: 'High',
    status: 'In Progress',
    title: 'Meeting room overstay',
    message: 'Personnel John Doe Testing occupied Meeting Room B for 82 minutes (exceeding 45-minute scheduled reservation).',
    timestamp: new Date(Date.now() - 45 * 60000),
    assignedTo: 'Operations Duty Lead',
    assignedRole: 'Operations Duty Lead',
    aiSummary: {
      rootCause: 'Dwell duration exceeded booking window by 37 minutes.',
      threatScore: 65,
      recommendedActions: [
        'Send digital chime notification to in-room display.',
        'Check upcoming reservation queue.'
      ]
    },
    evidence: {
      locationZone: 'Meeting Room B',
      rfidReaderId: 'RD-MEET-B',
      rfidTagId: 'E28011606000020788842D21',
      telemetryLog: '[AI_RULE_WARNING] Dwell time: 82m > 45m threshold.'
    }
  },
  {
    id: 'ALT-WARN-202',
    type: 'warning',
    category: 'Worker',
    priority: 'High',
    status: 'New',
    title: 'Repeated zone movement',
    message: 'Rapid zone oscillation (6 transitions in 4 mins) detected for worker John Miller between Staging Bay and Hallway.',
    timestamp: new Date(Date.now() - 55 * 60000),
    assignedTo: 'Field Safety Lead',
    assignedRole: 'Field Safety Lead',
    aiSummary: {
      rootCause: 'Frequent boundary crossings indicative of workflow bottleneck or material transit delay.',
      threatScore: 60,
      recommendedActions: [
        'Inspect task staging area for workflow obstruction.'
      ]
    },
    evidence: {
      locationZone: 'Staging Bay & Corridor',
      rfidReaderId: 'RD-STAGING-01',
      rfidTagId: 'W-101',
      telemetryLog: '[AI_RULE_WARNING] 6 rapid transitions recorded across boundary portal.'
    }
  },
  {
    id: 'ALT-WARN-203',
    type: 'warning',
    category: 'Safety',
    priority: 'Medium',
    status: 'New',
    title: 'Unusual movement pattern',
    message: 'Kinematic speed anomaly: Velocity of 3.6 m/s recorded for personnel inside pedestrian-restricted Zone 2 corridor.',
    timestamp: new Date(Date.now() - 70 * 60000),
    assignedTo: 'Field Safety Lead',
    assignedRole: 'Safety Lead',
    aiSummary: {
      rootCause: 'Speed threshold exceeded in restricted indoor pedestrian corridor.',
      threatScore: 58,
      recommendedActions: [
        'Verify worker safety condition.',
        'Issue gentle safety compliance reminder.'
      ]
    },
    evidence: {
      locationZone: 'Zone 2 Pedestrian Corridor',
      rfidReaderId: 'RD-ZONE2-01',
      rfidTagId: 'TAG_123',
      telemetryLog: '[AI_RULE_WARNING] Velocity: 3.6 m/s in pedestrian safety zone.'
    }
  },
  {
    id: 'ALT-WARN-204',
    type: 'warning',
    category: 'Reader',
    priority: 'Medium',
    status: 'New',
    title: 'Zone detection overlap',
    message: 'High-power RF lobe interference (-44 dBm / -48 dBm) registered at Antenna Portal Array 3 boundary.',
    timestamp: new Date(Date.now() - 90 * 60000),
    assignedTo: 'IT Network Systems Admin',
    assignedRole: 'Systems Admin',
    aiSummary: {
      rootCause: 'Antenna beam angle cross-talk causing dual zone registration.',
      threatScore: 50,
      recommendedActions: [
        'Tune antenna power level by -2 dBm.',
        'Verify antenna beam tilt angle.'
      ]
    },
    evidence: {
      locationZone: 'Antenna Portal Array 3',
      rfidReaderId: 'RD-ARRAY-03',
      telemetryLog: '[AI_RULE_WARNING] Dual boundary lobe signal overlap detected.'
    }
  },
  // 🔵 Information
  {
    id: 'ALT-INFO-301',
    type: 'info',
    category: 'Worker',
    priority: 'Low',
    status: 'Resolved',
    title: 'Person entered meeting room',
    message: 'Staff User (TAG_123) entered Conference Suite 1.',
    timestamp: new Date(Date.now() - 110 * 60000),
    assignedTo: 'Operations Duty Lead',
    assignedRole: 'Operations Duty Lead',
    aiSummary: {
      rootCause: 'Standard scheduled meeting entry event.',
      threatScore: 10,
      recommendedActions: ['No action required. Normal operational entry.']
    },
    evidence: {
      locationZone: 'Conference Suite 1',
      rfidReaderId: 'RD-CONF-01',
      rfidTagId: 'TAG_123',
      telemetryLog: '[AI_RULE_INFO] Entry scan registered at 14:02:10.'
    }
  },
  {
    id: 'ALT-INFO-302',
    type: 'info',
    category: 'Worker',
    priority: 'Low',
    status: 'Resolved',
    title: 'Person left meeting room',
    message: 'Staff User departed Conference Suite 1 after 38 minutes dwell.',
    timestamp: new Date(Date.now() - 120 * 60000),
    assignedTo: 'Operations Duty Lead',
    assignedRole: 'Operations Duty Lead',
    aiSummary: {
      rootCause: 'Standard meeting room exit event.',
      threatScore: 10,
      recommendedActions: ['Room status updated to Available.']
    },
    evidence: {
      locationZone: 'Conference Suite 1',
      rfidReaderId: 'RD-CONF-01',
      rfidTagId: 'TAG_123',
      telemetryLog: '[AI_RULE_INFO] Exit scan registered at 14:40:15.'
    }
  },
  {
    id: 'ALT-INFO-303',
    type: 'info',
    category: 'Worker',
    priority: 'Low',
    status: 'In Progress',
    title: 'Person currently in meeting room',
    message: 'Active heartbeat presence verified for John Doe Testing in Executive Boardroom.',
    timestamp: new Date(Date.now() - 130 * 60000),
    assignedTo: 'Operations Duty Lead',
    assignedRole: 'Operations Duty Lead',
    aiSummary: {
      rootCause: 'Active meeting room occupancy telemetry heartbeat.',
      threatScore: 10,
      recommendedActions: ['Normal in-session meeting verification.']
    },
    evidence: {
      locationZone: 'Executive Boardroom',
      rfidReaderId: 'RD-EXEC-PORTAL',
      rfidTagId: 'E28011606000020788842D21',
      telemetryLog: '[AI_RULE_INFO] Heartbeat presence verified.'
    }
  },
  {
    id: 'ALT-INFO-304',
    type: 'info',
    category: 'Worker',
    priority: 'Low',
    status: 'Resolved',
    title: 'Occupancy changed',
    message: 'Occupancy headcount in Training & Meeting Hall updated from 5 to 6 persons.',
    timestamp: new Date(Date.now() - 150 * 60000),
    assignedTo: 'Operations Duty Lead',
    assignedRole: 'Operations Duty Lead',
    aiSummary: {
      rootCause: 'Room headcount sensor delta update.',
      threatScore: 10,
      recommendedActions: ['Occupancy within permitted limits (6/20).']
    },
    evidence: {
      locationZone: 'Training & Meeting Hall',
      rfidReaderId: 'RD-TRAIN-01',
      telemetryLog: '[AI_RULE_INFO] Occupancy delta counter: +1 (Total: 6).'
    }
  },
  {
    id: 'ALT-INFO-305',
    type: 'info',
    category: 'Reader',
    priority: 'Low',
    status: 'Resolved',
    title: 'Tag detected',
    message: 'UHF RFID badge transponder E28011606000020788842D21 scanned at Facility Entrance Portal (RSSI: -58 dBm).',
    timestamp: new Date(Date.now() - 180 * 60000),
    assignedTo: 'Operations Duty Lead',
    assignedRole: 'Operations Duty Lead',
    aiSummary: {
      rootCause: 'Routine RFID portal antenna scan registered.',
      threatScore: 10,
      recommendedActions: ['Standard telemetry heartbeat logged.']
    },
    evidence: {
      locationZone: 'Facility Entrance Portal',
      rfidReaderId: 'RD-GATE-01-TURNSTILE',
      rfidTagId: 'E28011606000020788842D21',
      telemetryLog: '[AI_RULE_INFO] Antenna scan: RSSI -58 dBm.'
    }
  }
];

function getRulesForIndustry(industryId: string = 'construction'): AlertRule[] {
  const profile = INDUSTRY_PRESET_PROFILES[industryId as keyof typeof INDUSTRY_PRESET_PROFILES] || INDUSTRY_PRESET_PROFILES.construction;
  return profile.alertRuleTemplates.map((t, idx) => ({
    id: t.id,
    name: t.name,
    category: (t.category as AlertCategory) || 'Safety',
    priorityThreshold: t.priorityThreshold,
    targetZone: t.targetZone,
    slaMinutes: t.slaMinutes,
    autoAssignOfficer: 'Operations Duty Lead',
    autoEscalateTier: 'Tier 2 (EHS Director)',
    triggerSiren: Boolean(t.triggerSiren),
    notifySmsEmail: Boolean(t.notifySmsEmail),
    enabled: true,
    triggerCount: 4 + idx * 3
  }));
}

const DEFAULT_ALERT_RULES: AlertRule[] = getRulesForIndustry('construction');
const DEFAULT_BROADCASTS: EmergencyBroadcast[] = [];

export default function AlertsTab({ alerts: _propAlerts }: { alerts?: AIAlert[] }) {
  const { config, intelligenceProfile, personnelSingular, personnelPlural, roleLabel, idBadgeLabel, safetyComplianceLabel, zoneLabel, siteLabel, organizationType } = useTerminology();
  const activeIndustry = config?.industryId || intelligenceProfile?.industry || 'construction';
  const [activeSubTab, setActiveSubTab] = useState<'feed' | 'rules' | 'broadcast' | 'heatmap' | 'analytics'>('feed');

  // Filters & State
  const [selectedCategory, setSelectedCategory] = useState<AlertCategory | 'All'>('All');
  const [selectedPriority, setSelectedPriority] = useState<AlertPriority | 'All'>('All');
  const [selectedStatus, setSelectedStatus] = useState<AlertStatus | 'All'>('All');
  const [selectedZone, setSelectedZone] = useState<string>('All');
  const [selectedAiTier, setSelectedAiTier] = useState<'all' | 'Critical' | 'Warning' | 'Information'>('all');
  const [selectedAiRule, setSelectedAiRule] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data lists synced to DB
  const [alertList, setAlertList] = useState<AIAlert[]>([]);
  const [ruleList, setRuleList] = useState<AlertRule[]>(() => getRulesForIndustry(activeIndustry));
  const [broadcastList, setBroadcastList] = useState<EmergencyBroadcast[]>([]);

  useEffect(() => {
    setRuleList(getRulesForIndustry(config?.industryId || intelligenceProfile?.industry));
  }, [config?.industryId, intelligenceProfile?.industry]);

  const [mongoStatus, setMongoStatus] = useState<{
    connected: boolean;
    engine?: string;
    database?: string;
    totalRecords?: number;
    latencyMs?: number;
  }>({ connected: true, engine: 'MongoDB Atlas', database: 'Lat-Aperture-People-Tracking' });

  useEffect(() => {
    const checkMongo = async () => {
      try {
        const start = Date.now();
        const res = await fetch('/api/mongodb/status');
        const latency = Date.now() - start;
        if (res.ok) {
          const data = await res.json();
          setMongoStatus({
            connected: Boolean(data.connected),
            engine: data.engine || 'MongoDB Atlas',
            database: 'Lat-Aperture-People-Tracking',
            totalRecords: data.totalRecords || 0,
            latencyMs: latency
          });
        }
      } catch {}
    };
    checkMongo();
  }, []);

  // Selection & Modals
  const [selectedAlert, setSelectedAlert] = useState<AIAlert | null>(null);
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateRuleModalOpen, setIsCreateRuleModalOpen] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'ai_summary' | 'evidence' | 'timeline' | 'resolution' | 'comments'>('ai_summary');

  // New Alert Form State
  const [newAlert, setNewAlert] = useState<{
    category: AlertCategory;
    priority: AlertPriority;
    title: string;
    message: string;
    assignedTo: string;
    locationZone: string;
    cctvCameraId: string;
    rfidReaderId: string;
  }>({
    category: 'Safety',
    priority: 'High',
    title: '',
    message: '',
    assignedTo: OFFICERS_LIST[0],
    locationZone: 'Main Gate 1',
    cctvCameraId: 'CAM-GATE-1A',
    rfidReaderId: 'RD-GATE-01-TURNSTILE'
  });

  // New Rule Form State
  const [newRule, setNewRule] = useState<{
    name: string;
    category: AlertCategory | 'All';
    priorityThreshold: AlertPriority;
    targetZone: string;
    slaMinutes: number;
    autoAssignOfficer: string;
    autoEscalateTier: 'Tier 1 (Gatehouse)' | 'Tier 2 (EHS Director)' | 'Tier 3 (Site Operations VP)';
    triggerSiren: boolean;
    notifySmsEmail: boolean;
  }>({
    name: '',
    category: 'All',
    priorityThreshold: 'High',
    targetZone: 'Confined Shaft & Tunneling',
    slaMinutes: 15,
    autoAssignOfficer: OFFICERS_LIST[0],
    autoEscalateTier: 'Tier 2 (EHS Director)',
    triggerSiren: true,
    notifySmsEmail: true
  });

  // New Comment Input
  const [newCommentText, setNewCommentText] = useState('');

  // Resolution Form
  const [resolutionData, setResolutionData] = useState({
    rootCause: '',
    correctiveAction: '',
    verificationOfficer: OFFICERS_LIST[0]
  });

  // Notification Toast
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Handle WebSocket messages
  const handleWSMessage = useCallback((msg: any) => {
    if (msg.type === 'safety_alert' || msg.type === 'trigger_safety_alert') {
      const p = msg.payload || {};
      const newWsAlert: AIAlert = {
        id: p.id || `ALT-${Math.floor(Math.random() * 9000) + 1000}`,
        type: p.severity === 'critical' ? 'security' : 'warning',
        category: (p.category as AlertCategory) || 'Safety',
        priority: p.severity === 'critical' ? 'Critical' : 'High',
        status: 'New',
        title: p.title || 'Zero-Latency WS Emergency Hazard Alert',
        message: p.location ? `Real-time hazard triggered at ${p.location}` : 'Immediate worker safety response required.',
        timestamp: new Date(),
        assignedTo: OFFICERS_LIST[0],
        evidence: { locationZone: p.location || 'Site Perimeter' }
      };

      setAlertList(prev => [newWsAlert, ...prev.filter(a => a.id !== newWsAlert.id)]);
      setNotificationMsg({ type: 'error', text: `⚡ ZERO-LATENCY WS ALERT: ${newWsAlert.title}` });
    } else if (msg.type === 'alert_acknowledged') {
      const p = msg.payload || {};
      setAlertList(prev => prev.map(a => a.id === p.alertId ? { ...a, status: 'In Progress' } : a));
      setNotificationMsg({ type: 'info', text: `⚡ WS Alert ${p.alertId} acknowledged` });
    }
  }, []);

  const { isConnected: isWsConnected, triggerSafetyAlert: wsTriggerSafetyAlert } = useWebSocket(handleWSMessage);

  // Persistent Resolved & Dismissed Alerts state (stored in localStorage & React state)
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('aperture_resolved_alert_ids');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('aperture_dismissed_alert_ids');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const saveResolvedId = (id: string) => {
    setResolvedIds(prev => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem('aperture_resolved_alert_ids', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const saveDismissedId = (id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem('aperture_dismissed_alert_ids', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // MongoDB Sync
  useEffect(() => {
    let entAlerts: AIAlert[] = [];
    let stdAlerts: AIAlert[] = [];
    let incAlerts: AIAlert[] = [];

    const mergeAndSetAlerts = () => {
      const map = new Map<string, AIAlert>();
      // Include built-in AI alert rule templates so all 13 rules are immediately visible and testable
      DEFAULT_AI_ALERTS.forEach(a => map.set(a.id!, a));
      const baseAlerts = [...entAlerts, ...stdAlerts, ...incAlerts];
      baseAlerts.forEach(a => map.set(a.id!, a));

      const combined = Array.from(map.values())
        .filter(a => !dismissedIds.has(a.id!))
        .map(a => {
          if (resolvedIds.has(a.id!) || (a.status as string) === 'Closed' || a.status === 'Resolved') {
            return { ...a, status: 'Resolved' as AlertStatus, resolved: true };
          }
          return a;
        })
        .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));

      setAlertList(combined);
    };

    // 1. Sync Alerts from MongoDB
    const unsubAlerts = onSnapshot(collection(db, 'alerts_enterprise'), (snapshot) => {
      entAlerts = snapshot.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          ...d,
          id: docSnap.id,
          timestamp: typeof d.timestamp === 'string' ? new Date(d.timestamp) : (d.timestamp?.toDate ? d.timestamp.toDate() : new Date())
        } as AIAlert;
      });
      mergeAndSetAlerts();
    });

    const unsubStandardAlerts = onSnapshot(collection(db, 'alerts'), (snapshot) => {
      stdAlerts = snapshot.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          ...d,
          id: docSnap.id,
          title: d.title || d.message || 'Safety Alert',
          category: d.category || 'Safety',
          priority: d.priority || d.severity || 'High',
          status: d.status || 'In Progress',
          timestamp: typeof d.timestamp === 'string' ? new Date(d.timestamp) : (d.timestamp?.toDate ? d.timestamp.toDate() : new Date())
        } as AIAlert;
      });
      mergeAndSetAlerts();
    });

    const unsubIncidentsAlerts = onSnapshot(collection(db, 'incidents'), (snapshot) => {
      incAlerts = snapshot.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: `INC-ALT-${docSnap.id}`,
          type: d.severity === 'Critical' || d.severity === 'High' ? 'security' : 'warning',
          category: 'Safety',
          priority: d.severity === 'Critical' ? 'Critical' : d.severity === 'High' ? 'High' : 'Medium',
          status: d.status === 'Closed' ? 'Resolved' : 'In Progress',
          title: d.title || 'Logged MongoDB Incident Alert',
          message: d.description || `Incident logged at ${d.zone || siteLabel || 'Facility'} for ${d.personName || personnelSingular}`,
          timestamp: typeof d.timestamp === 'string' ? new Date(d.timestamp) : new Date(),
          assignedTo: d.assignedOfficer || OFFICERS_LIST[0],
          evidence: {
            locationZone: d.zone || siteLabel || 'Facility Zone',
            rfidReaderId: d.tagId ? `${idBadgeLabel}-${d.tagId}` : 'RD-GAO-01'
          }
        } as AIAlert;
      });
      mergeAndSetAlerts();
    });

    // 2. Sync Rules
    const unsubRules = onSnapshot(collection(db, 'alert_rules'), (snapshot) => {
      const data = snapshot.docs.map(docSnap => docSnap.data() as AlertRule);
      setRuleList(data.length > 0 ? data : getRulesForIndustry(activeIndustry));
    }, () => {
      setRuleList(getRulesForIndustry(activeIndustry));
    });

    // 3. Sync Broadcasts
    const unsubBroadcasts = onSnapshot(collection(db, 'emergency_broadcasts'), (snapshot) => {
      const data = snapshot.docs.map(docSnap => docSnap.data() as EmergencyBroadcast);
      setBroadcastList(data);
    }, () => {
      setBroadcastList([]);
    });

    return () => {
      unsubAlerts();
      unsubStandardAlerts();
      unsubIncidentsAlerts();
      unsubRules();
      unsubBroadcasts();
    };
  }, []);

  // Filtered Alert Roster
  const filteredAlerts = useMemo(() => {
    return alertList.filter(a => {
      const matchesCategory = selectedCategory === 'All' || a.category === selectedCategory;
      const matchesPriority = selectedPriority === 'All' || a.priority === selectedPriority;
      const matchesStatus = selectedStatus === 'All' || a.status === selectedStatus;
      const matchesZone = selectedZone === 'All' || (a.evidence?.locationZone && a.evidence.locationZone.includes(selectedZone));
      
      // AI Tier Filter
      let matchesAiTier = true;
      if (selectedAiTier === 'Critical') {
        matchesAiTier = a.priority === 'Critical' || a.category === 'Emergency';
      } else if (selectedAiTier === 'Warning') {
        matchesAiTier = a.priority === 'High' || a.priority === 'Medium';
      } else if (selectedAiTier === 'Information') {
        matchesAiTier = a.priority === 'Low' || a.type === 'info';
      }

      // AI Rule Filter
      const matchesAiRule = !selectedAiRule || (a.title && a.title.toLowerCase().includes(selectedAiRule.toLowerCase()));

      const searchLower = (searchTerm || "").toLowerCase();
      const matchesSearch = !searchTerm ||
        (a.id && (a.id || "").toLowerCase().includes(searchLower)) ||
        (a.title && (a.title || "").toLowerCase().includes(searchLower)) ||
        (a.message || "").toLowerCase().includes(searchLower) ||
        (a.assignedTo && (a.assignedTo || "").toLowerCase().includes(searchLower)) ||
        (a.evidence?.locationZone && (a.evidence.locationZone || "").toLowerCase().includes(searchLower));

      return matchesCategory && matchesPriority && matchesStatus && matchesZone && matchesAiTier && matchesAiRule && matchesSearch;
    });
  }, [alertList, selectedCategory, selectedPriority, selectedStatus, selectedZone, selectedAiTier, selectedAiRule, searchTerm]);

  // Key KPI Metrics
  const metrics = useMemo(() => {
    const total = alertList.length;
    const critical = alertList.filter(a => a.priority === 'Critical' && a.status !== 'Resolved').length;
    const inProgress = alertList.filter(a => a.status === 'In Progress').length;
    const escalated = alertList.filter(a => a.status === 'Escalated' || a.escalation?.isEscalated).length;
    const resolved = alertList.filter(a => a.status === 'Resolved' || a.resolved).length;
    const emergencyCount = alertList.filter(a => a.category === 'Emergency' && a.status !== 'Resolved').length;

    const criticalCount = alertList.filter(a => a.priority === 'Critical' || a.category === 'Emergency').length;
    const warningCount = alertList.filter(a => a.priority === 'High' || a.priority === 'Medium').length;
    const infoCount = alertList.filter(a => a.priority === 'Low' || a.type === 'info').length;

    const alertsWithSla = alertList.filter(a => a.escalation?.elapsedMinutes !== undefined && a.escalation.elapsedMinutes > 0);
    const avgSla = alertsWithSla.length > 0 
      ? `${(alertsWithSla.reduce((sum, a) => sum + (a.escalation?.elapsedMinutes || 0), 0) / alertsWithSla.length).toFixed(1)}m` 
      : '5.4m';

    return { total, critical, inProgress, escalated, resolved, emergencyCount, criticalCount, warningCount, infoCount, avgSla };
  }, [alertList]);

  // Trigger / Simulate an AI Feature Rule
  const handleTriggerAiRule = async (rule: AIRuleDefinition) => {
    const alertId = `ALT-AI-${Math.floor(Math.random() * 8999) + 1000}`;
    const now = new Date();

    const createdRecord: AIAlert = {
      id: alertId,
      type: rule.tier === 'Critical' ? 'security' : rule.tier === 'Warning' ? 'warning' : 'info',
      category: rule.category,
      priority: rule.priority,
      status: 'New',
      title: rule.name,
      message: `${rule.sampleMessage} (Target Zone: ${rule.defaultZone})`,
      timestamp: now,
      assignedTo: OFFICERS_LIST[0],
      assignedRole: rule.tier === 'Critical' ? 'EHS Duty Controller' : 'Field Safety Lead',
      assignedAt: now.toISOString(),
      aiSummary: {
        rootCause: `[AI_RULE_ENGINE] Triggered rule '${rule.name}' [${rule.tierEmoji} ${rule.tier} Tier] under active telemetry stream.`,
        threatScore: rule.tier === 'Critical' ? 95 : rule.tier === 'Warning' ? 65 : 15,
        recommendedActions: [
          rule.tier === 'Critical' ? 'Dispatch immediate field response team.' : 'Acknowledge event and verify zone telemetry.',
          'Review camera feed for ' + rule.defaultZone,
          'Log containment measures in MongoDB audit thread.'
        ]
      },
      evidence: {
        locationZone: rule.defaultZone,
        telemetryLog: `[AI_EVENT_TRIGGER] Rule: ${rule.name} | Tier: ${rule.tier} | Zone: ${rule.defaultZone} | Timestamp: ${now.toISOString()}`
      },
      comments: [
        {
          id: `c_${Date.now()}`,
          author: 'AI Safety Engine',
          role: 'Autonomous System',
          timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `Automated rule evaluation triggered: ${rule.name} (${rule.description})`
        }
      ],
      timeline: [
        {
          time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          title: `AI Rule Triggered: ${rule.name}`,
          description: rule.sampleMessage,
          actor: 'AI Safety Engine',
          type: 'trigger'
        }
      ],
      escalation: {
        level: rule.tier === 'Critical' ? 'Tier 2 (EHS Director)' : 'Tier 1 (Gatehouse)',
        slaMinutes: rule.tier === 'Critical' ? 15 : rule.tier === 'Warning' ? 45 : 120,
        elapsedMinutes: 0,
        autoEscalateTarget: OFFICERS_LIST[0],
        isEscalated: rule.tier === 'Critical'
      }
    };

    setAlertList(prev => [createdRecord, ...prev]);
    setSelectedAlert(createdRecord);
    setNotificationMsg({
      type: rule.tier === 'Critical' ? 'error' : rule.tier === 'Warning' ? 'info' : 'success',
      text: `⚡ AI Rule Event Triggered: ${rule.tierEmoji} ${rule.name} (${alertId})`
    });

    if (rule.triggerSiren) {
      wsTriggerSafetyAlert(`🚨 ${rule.tierEmoji} ${rule.name}: ${rule.defaultZone}`, rule.defaultZone, 'critical');
    }

    try {
      await setDoc(doc(db, 'alerts_enterprise', alertId), {
        ...createdRecord,
        timestamp: now.toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('MongoDB sync error on AI trigger:', err);
    }
  };

  // Handle Acknowledge Alert (New -> In Progress)
  const handleAcknowledgeAlert = async (alert: AIAlert) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const updatedHistory = [...(alert.history || []), {
      timestamp: nowStr,
      action: 'Acknowledged by EHS Control Officer',
      user: 'EHS Controller'
    }];
    const updatedTimeline = [...(alert.timeline || []), {
      time: nowStr,
      title: 'Acknowledged',
      description: 'Incident acknowledged and converted to In Progress state.',
      actor: 'EHS Controller',
      type: 'assignment' as const
    }];

    const updatedAlert: AIAlert = {
      ...alert,
      status: 'In Progress',
      history: updatedHistory,
      timeline: updatedTimeline
    };

    setAlertList(prev => prev.map(a => a.id === alert.id ? updatedAlert : a));
    if (selectedAlert && selectedAlert.id === alert.id) {
      setSelectedAlert(updatedAlert);
    }
    setNotificationMsg({ type: 'success', text: `Alert ${alert.id} acknowledged & set to IN PROGRESS!` });

    try {
      await setDoc(doc(db, 'alerts_enterprise', alert.id!), {
        ...updatedAlert,
        timestamp: updatedAlert.timestamp instanceof Date ? updatedAlert.timestamp.toISOString() : updatedAlert.timestamp
      }, { merge: true });
    } catch (err) {
      console.warn('MongoDB sync note:', err);
    }
  };

  // Handle Reassign Officer
  const handleReassignOfficer = async (alert: AIAlert, newOfficer: string) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const updatedHistory = [...(alert.history || []), {
      timestamp: nowStr,
      action: `Reassigned to ${newOfficer}`,
      user: 'EHS Officer'
    }];

    const updatedAlert: AIAlert = {
      ...alert,
      assignedTo: newOfficer,
      assignedAt: new Date().toISOString(),
      history: updatedHistory
    };

    setAlertList(prev => prev.map(a => a.id === alert.id ? updatedAlert : a));
    if (selectedAlert && selectedAlert.id === alert.id) {
      setSelectedAlert(updatedAlert);
    }
    setNotificationMsg({ type: 'info', text: `Alert ${alert.id} reassigned to ${newOfficer}` });

    try {
      await setDoc(doc(db, 'alerts_enterprise', alert.id!), {
        ...updatedAlert,
        timestamp: updatedAlert.timestamp instanceof Date ? updatedAlert.timestamp.toISOString() : updatedAlert.timestamp
      }, { merge: true });
    } catch (err) {
      console.warn('MongoDB sync note:', err);
    }
  };

  // Handle Create New Alert
  const handleCreateAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlert.title || !newAlert.message) return;

    const alertId = `ALT-${Math.floor(Math.random() * 8999) + 1000}`;
    const now = new Date();

    const createdRecord: AIAlert = {
      id: alertId,
      type: newAlert.priority === 'Critical' || newAlert.priority === 'High' ? 'security' : 'warning',
      category: newAlert.category,
      priority: newAlert.priority,
      status: 'New',
      title: newAlert.title,
      message: newAlert.message,
      timestamp: now,
      assignedTo: newAlert.assignedTo,
      assignedRole: 'Field Officer',
      assignedAt: now.toISOString(),
      aiSummary: {
        rootCause: `Manual incident logged under ${newAlert.category} protocol at ${newAlert.locationZone}.`,
        threatScore: newAlert.priority === 'Critical' ? 95 : newAlert.priority === 'High' ? 80 : 50,
        recommendedActions: [
          'Dispatch assigned field responder immediately.',
          'Verify CCTV camera telemetry feed.',
          'Log containment measures in comments thread.'
        ]
      },
      evidence: {
        locationZone: newAlert.locationZone,
        cctvCameraId: newAlert.cctvCameraId,
        rfidReaderId: newAlert.rfidReaderId,
        telemetryLog: `[MANUAL_TRIGGER] Alert ID: ${alertId} | Priority: ${newAlert.priority} | Zone: ${newAlert.locationZone}`
      },
      comments: [
        { id: `c_${Date.now()}`, author: 'Current User', role: 'EHS Controller', timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: `Alert manually initiated: ${newAlert.title}` }
      ],
      timeline: [
        { time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), title: 'Alert Created', description: newAlert.message, actor: 'User Input', type: 'trigger' }
      ],
      escalation: {
        level: 'Tier 1 (Gatehouse)',
        slaMinutes: newAlert.priority === 'Critical' ? 15 : 60,
        elapsedMinutes: 0,
        autoEscalateTarget: OFFICERS_LIST[0],
        isEscalated: false
      },
      history: [
        { timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), action: 'Created Alert', user: 'User' }
      ]
    };

    setAlertList(prev => [createdRecord, ...prev]);
    setSelectedAlert(createdRecord);
    setNotificationMsg({ type: 'success', text: `Enterprise Alert ${alertId} generated & persisted to MongoDB!` });
    setIsCreateModalOpen(false);

    try {
      await setDoc(doc(db, 'alerts_enterprise', alertId), {
        ...createdRecord,
        timestamp: now.toISOString()
      }, { merge: true });
      setNewAlert({
        category: 'Safety',
        priority: 'High',
        title: '',
        message: '',
        assignedTo: OFFICERS_LIST[0],
        locationZone: 'Main Gate 1',
        cctvCameraId: 'CAM-GATE-1A',
        rfidReaderId: 'RD-GATE-01-TURNSTILE'
      });
    } catch (err) {
      console.error('Error creating alert:', err);
    }
  };

  // Add Comment to Alert
  const handleAddComment = async () => {
    if (!selectedAlert || !newCommentText.trim()) return;

    const newComment: AlertComment = {
      id: `comment_${Date.now()}`,
      author: 'EHS Control Officer',
      role: 'Site Safety Team',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: newCommentText.trim()
    };

    const updatedComments = [...(selectedAlert.comments || []), newComment];
    const updatedHistory = [...(selectedAlert.history || []), {
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'Added Comment',
      user: 'EHS Officer'
    }];

    const updatedAlert: AIAlert = {
      ...selectedAlert,
      comments: updatedComments,
      history: updatedHistory
    };

    setAlertList(prev => prev.map(a => a.id === selectedAlert.id ? updatedAlert : a));
    setSelectedAlert(updatedAlert);
    setNewCommentText('');
    setNotificationMsg({ type: 'success', text: 'Comment added to activity thread in MongoDB.' });

    try {
      await setDoc(doc(db, 'alerts_enterprise', selectedAlert.id!), {
        ...updatedAlert,
        timestamp: updatedAlert.timestamp instanceof Date ? updatedAlert.timestamp.toISOString() : updatedAlert.timestamp
      }, { merge: true });
    } catch (err) {
      console.warn('MongoDB sync note:', err);
    }
  };

  // Escalate Alert
  const handleEscalateAlert = async (alert: AIAlert) => {
    const updatedEscalation = {
      level: 'Tier 2 (EHS Director)' as const,
      slaMinutes: 15,
      elapsedMinutes: alert.escalation?.elapsedMinutes || 10,
      autoEscalateTarget: 'VP Site Operations',
      isEscalated: true
    };

    const updatedHistory = [...(alert.history || []), {
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'Manually Escalated to Tier 2 (EHS Director)',
      user: 'EHS Controller'
    }];

    const updatedAlert: AIAlert = {
      ...alert,
      status: 'Escalated',
      escalation: updatedEscalation,
      history: updatedHistory
    };

    setAlertList(prev => prev.map(a => a.id === alert.id ? updatedAlert : a));
    if (selectedAlert && selectedAlert.id === alert.id) {
      setSelectedAlert(updatedAlert);
    }
    setNotificationMsg({ type: 'error', text: `Alert ${alert.id} ESCALATED to Tier 2 Executive Protocol!` });

    try {
      await setDoc(doc(db, 'alerts_enterprise', alert.id!), {
        ...updatedAlert,
        timestamp: updatedAlert.timestamp instanceof Date ? updatedAlert.timestamp.toISOString() : updatedAlert.timestamp
      }, { merge: true });
    } catch (err) {
      console.warn('MongoDB sync note:', err);
    }
  };

  // Resolve Alert Submit
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlert) return;

    saveResolvedId(selectedAlert.id!);

    const resInfo = {
      resolvedBy: resolutionData.verificationOfficer,
      resolvedAt: new Date().toISOString(),
      rootCause: resolutionData.rootCause || 'Root cause analyzed & risk contained.',
      correctiveAction: resolutionData.correctiveAction || 'Field inspection completed & safety sign-off verified.',
      verificationOfficer: resolutionData.verificationOfficer
    };

    const updatedHistory = [...(selectedAlert.history || []), {
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: `Resolved by ${resolutionData.verificationOfficer}`,
      user: resolutionData.verificationOfficer
    }];

    const updatedAlert: AIAlert = {
      ...selectedAlert,
      status: 'Resolved',
      resolved: true,
      resolution: resInfo,
      history: updatedHistory
    };

    setAlertList(prev => prev.map(a => a.id === selectedAlert.id ? updatedAlert : a));
    setSelectedAlert(updatedAlert);

    setIsResolveModalOpen(false);
    setNotificationMsg({ type: 'success', text: `Alert ${selectedAlert.id} marked RESOLVED with EHS sign-off in MongoDB!` });
    setResolutionData({
      rootCause: '',
      correctiveAction: '',
      verificationOfficer: OFFICERS_LIST[0]
    });

    try {
      await setDoc(doc(db, 'alerts_enterprise', selectedAlert.id!), {
        ...updatedAlert,
        timestamp: updatedAlert.timestamp instanceof Date ? updatedAlert.timestamp.toISOString() : updatedAlert.timestamp
      }, { merge: true });

      if (selectedAlert.id?.startsWith('INC-ALT-')) {
        const rawIncId = selectedAlert.id.replace('INC-ALT-', '');
        await setDoc(doc(db, 'incidents', rawIncId), { status: 'Closed', workflowStatus: 'Closed' }, { merge: true });
        await setDoc(doc(db, 'incidents_enterprise', rawIncId), { workflowStatus: 'Closed' }, { merge: true });
      }
    } catch (err) {
      console.warn('MongoDB sync note:', err);
    }
  };

  // 1-Click Direct Close & Resolve Alert
  const handleDirectCloseAlert = async (alert: AIAlert) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const updatedHistory = [...(alert.history || []), {
      timestamp: nowStr,
      action: 'Directly Resolved & Closed by EHS Controller',
      user: 'EHS Controller'
    }];

    const updatedAlert: AIAlert = {
      ...alert,
      status: 'Resolved',
      resolved: true,
      history: updatedHistory
    };

    saveResolvedId(alert.id!);
    setAlertList(prev => prev.map(a => a.id === alert.id ? updatedAlert : a));
    if (selectedAlert && selectedAlert.id === alert.id) {
      setSelectedAlert(updatedAlert);
    }
    setNotificationMsg({ type: 'success', text: `Alert ${alert.id} closed & resolved permanently!` });

    try {
      await setDoc(doc(db, 'alerts_enterprise', alert.id!), {
        ...updatedAlert,
        status: 'Resolved',
        resolved: true,
        timestamp: updatedAlert.timestamp instanceof Date ? updatedAlert.timestamp.toISOString() : updatedAlert.timestamp
      }, { merge: true });

      await setDoc(doc(db, 'alerts', alert.id!), {
        status: 'Resolved',
        resolved: true
      }, { merge: true });

      if (alert.id?.startsWith('INC-ALT-')) {
        const rawIncId = alert.id.replace('INC-ALT-', '');
        await setDoc(doc(db, 'incidents', rawIncId), { status: 'Closed', workflowStatus: 'Closed' }, { merge: true });
        await setDoc(doc(db, 'incidents_enterprise', rawIncId), { workflowStatus: 'Closed' }, { merge: true });
      }
    } catch (err) {
      console.warn('MongoDB sync note:', err);
    }
  };

  // 1-Click Dismiss / Delete Alert
  const handleDeleteAlert = async (alertId: string) => {
    saveDismissedId(alertId);
    setAlertList(prev => prev.filter(a => a.id !== alertId));
    if (selectedAlert && selectedAlert.id === alertId) {
      setSelectedAlert(null);
    }
    setNotificationMsg({ type: 'info', text: `Alert ${alertId} dismissed and removed.` });

    try {
      await deleteDoc(doc(db, 'alerts_enterprise', alertId));
      await deleteDoc(doc(db, 'alerts', alertId));
      if (alertId.startsWith('INC-ALT-')) {
        const rawIncId = alertId.replace('INC-ALT-', '');
        await deleteDoc(doc(db, 'incidents', rawIncId));
        await deleteDoc(doc(db, 'incidents_enterprise', rawIncId));
      }
    } catch (e) {
      console.warn(e);
    }
  };

  // Bulk Operations
  const handleBulkAcknowledge = async () => {
    if (selectedAlertIds.length === 0) return;
    setAlertList(prev => prev.map(a => selectedAlertIds.includes(a.id) ? { ...a, status: 'In Progress' } : a));
    setNotificationMsg({ type: 'success', text: `Bulk acknowledged ${selectedAlertIds.length} alerts.` });

    try {
      for (const id of selectedAlertIds) {
        await setDoc(doc(db, 'alerts_enterprise', id), { status: 'In Progress' }, { merge: true });
      }
    } catch (err) {
      console.warn('Error in bulk acknowledge:', err);
    }
    setSelectedAlertIds([]);
  };

  const handleBulkEscalate = async () => {
    if (selectedAlertIds.length === 0) return;
    setAlertList(prev => prev.map(a => selectedAlertIds.includes(a.id) ? { ...a, status: 'Escalated' } : a));
    setNotificationMsg({ type: 'error', text: `Bulk escalated ${selectedAlertIds.length} alerts to Tier 2!` });

    try {
      for (const id of selectedAlertIds) {
        await setDoc(doc(db, 'alerts_enterprise', id), { status: 'Escalated' }, { merge: true });
      }
    } catch (err) {
      console.warn('Error in bulk escalate:', err);
    }
    setSelectedAlertIds([]);
  };

  // Create Escalation Rule
  const handleCreateRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.name) return;

    const ruleId = `RULE-${Math.floor(Math.random() * 899) + 100}`;
    const ruleObj: AlertRule = {
      id: ruleId,
      ...newRule,
      enabled: true,
      triggerCount: 0,
      lastTriggered: 'Never'
    };

    try {
      await setDoc(doc(db, 'alert_rules', ruleId), ruleObj);
      setNotificationMsg({ type: 'success', text: `Escalation Rule ${ruleId} created & saved to MongoDB!` });
      setIsCreateRuleModalOpen(false);
      setNewRule({
        name: '',
        category: 'All',
        priorityThreshold: 'High',
        targetZone: 'Confined Shaft & Tunneling',
        slaMinutes: 15,
        autoAssignOfficer: OFFICERS_LIST[0],
        autoEscalateTier: 'Tier 2 (EHS Director)',
        triggerSiren: true,
        notifySmsEmail: true
      });
    } catch (err) {
      console.error('Error creating rule:', err);
    }
  };

  // Toggle Rule Enable/Disable
  const handleToggleRule = async (rule: AlertRule) => {
    try {
      await updateDoc(doc(db, 'alert_rules', rule.id), {
        enabled: !rule.enabled
      });
      setNotificationMsg({ type: 'info', text: `Rule ${rule.id} ${!rule.enabled ? 'Enabled' : 'Disabled'}` });
    } catch (err) {
      console.error('Error toggling rule:', err);
    }
  };

  // Delete Rule
  const handleDeleteRule = async (ruleId: string) => {
    try {
      await deleteDoc(doc(db, 'alert_rules', ruleId));
      setNotificationMsg({ type: 'info', text: `Rule ${ruleId} deleted from database.` });
    } catch (err) {
      console.error('Error deleting rule:', err);
    }
  };

  // Trigger Emergency Broadcast Siren
  const handleTriggerBroadcast = async (zone: string, type: EmergencyBroadcast['type'], title: string) => {
    const bcId = `BC-${Math.floor(Math.random() * 8999) + 1000}`;
    const bcObj: EmergencyBroadcast = {
      id: bcId,
      title,
      zone,
      type,
      activatedBy: 'Operations Duty Lead',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      musterTarget: 25,
      musterAccounted: 22,
      status: 'ACTIVE'
    };

    try {
      await setDoc(doc(db, 'emergency_broadcasts', bcId), bcObj);
      wsTriggerSafetyAlert(`⚡ EMERGENCY SIREN: ${title}`, zone, 'critical');
      setNotificationMsg({ type: 'error', text: `🚨 SIREN BROADCAST ACTIVATED FOR ${(zone || "").toUpperCase()}!` });
    } catch (err) {
      console.error('Error triggering broadcast:', err);
    }
  };

  // Clear Emergency Broadcast
  const handleClearBroadcast = async (bcId: string) => {
    try {
      await updateDoc(doc(db, 'emergency_broadcasts', bcId), {
        status: 'CLEARED'
      });
      setNotificationMsg({ type: 'success', text: `Broadcast ${bcId} marked CLEARED & siren deactivated.` });
    } catch (err) {
      console.error('Error clearing broadcast:', err);
    }
  };

  // Export CSV & PDF
  const handleExportCSV = () => {
    const columns = [
      { key: 'id', label: 'ALERT ID' },
      { key: 'category', label: 'CATEGORY' },
      { key: 'priority', label: 'PRIORITY' },
      { key: 'title', label: 'TITLE' },
      { key: 'status', label: 'STATUS' },
      { key: 'assignedTo', label: 'ASSIGNED OFFICER' },
      { key: 'locationZone', label: 'ZONE LOCATION' }
    ];

    const data = alertList.map(a => ({
      id: a.id,
      category: a.category || 'General',
      priority: a.priority || 'Medium',
      title: a.title || a.message,
      status: a.status || 'New',
      assignedTo: a.assignedTo || 'Unassigned',
      locationZone: a.evidence?.locationZone || 'Site Area'
    }));

    exportToCSV('Enterprise_Alert_Center_Log', data, columns);
  };

  const handleExportPDF = () => {
    const columns = [
      { key: 'id', label: 'Alert ID' },
      { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority' },
      { key: 'title', label: 'Alert Summary' },
      { key: 'status', label: 'Status' },
      { key: 'assignedTo', label: 'Assigned Officer' }
    ];

    const rows = alertList.map(a => ({
      id: a.id,
      category: a.category || 'Safety',
      priority: a.priority || 'High',
      title: a.title || a.message,
      status: a.status || 'Active',
      assignedTo: a.assignedTo || 'EHS Team'
    }));

    const metricsData = [
      { label: 'Total Incidents Logged', value: metrics.total },
      { label: 'Active Critical Hazards', value: metrics.critical },
      { label: 'In-Progress Containments', value: metrics.inProgress },
      { label: 'Escalated Alerts', value: metrics.escalated },
      { label: 'Resolved Incidents', value: metrics.resolved }
    ];

    generatePDFReport(
      'Aperture Enterprise Alert & Safety Incident Audit',
      'Official EHS Command Center Log & Response Summary',
      columns,
      rows,
      metricsData
    );
  };

  // Chart Data for Analytics Tab
  const categoryChartData = useMemo(() => {
    return CATEGORIES_LIST.map(cat => ({
      name: cat,
      count: alertList.filter(a => a.category === cat).length
    })).filter(c => c.count > 0);
  }, [alertList]);

  const priorityPieData = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    alertList.forEach(a => {
      const p = a.priority || 'Medium';
      if (counts[p] !== undefined) counts[p]++;
    });
    return [
      { name: 'Critical', value: counts.Critical, color: '#e11d48' },
      { name: 'High', value: counts.High, color: '#f59e0b' },
      { name: 'Medium', value: counts.Medium, color: '#3b82f6' },
      { name: 'Low', value: counts.Low, color: '#64748b' }
    ];
  }, [alertList]);

  return (
    <div className="w-full flex flex-col p-4 sm:p-6 max-w-[1760px] mx-auto space-y-6 min-w-0">
      
      {/* Top Header & Sub-Nav Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Siren className="w-7 h-7 text-rose-600 animate-pulse" />
              Enterprise Alert Command Center
            </h2>
            {/* Live MongoDB Atlas Connection Status */}
            {mongoStatus.connected ? (
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700 flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Database size={13} className="text-emerald-600" />
                MongoDB Atlas: Lat-Aperture-People-Tracking (Connected)
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-700 flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <Database size={13} className="text-rose-600" />
                MongoDB Disconnected
              </span>
            )}
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 border ${
              isWsConnected 
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
            }`}>
              {isWsConnected ? <Wifi className="w-3 h-3 text-emerald-500 animate-pulse" /> : <WifiOff className="w-3 h-3 text-amber-500" />}
              {isWsConnected ? 'WebSocket: 0ms Sync' : 'WebSocket: Connecting...'}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm mt-0.5">
            Zero-latency emergency sirens, AI hazard diagnostics, automated dispatch rules & MongoDB persistence
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              wsTriggerSafetyAlert(
                '⚡ INSTANT WS PANIC: High Voltage Perimeter Breach',
                'Zone 4 High Voltage Substation',
                'critical'
              );
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white rounded-xl text-xs font-black shadow-md transition flex items-center gap-1.5"
            title="Broadcast Zero-Latency WebSocket Panic Alert"
          >
            <Zap size={14} className="fill-current" /> Instant WS Panic
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2"
          >
            <Plus size={15} /> Trigger Incident
          </button>

          <button
            onClick={handleExportCSV}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 transition"
            title="Export CSV Log"
          >
            <Download size={15} />
          </button>

          <button
            onClick={handleExportPDF}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 transition"
            title="Export Official PDF Report"
          >
            <Printer size={15} />
          </button>
        </div>
      </div>

      {/* Main Subtabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('feed')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'feed'
              ? 'bg-[#007BC4] text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <BellRing size={15} /> Live Incident Stream ({alertList.length})
        </button>

        <button
          onClick={() => setActiveSubTab('rules')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'rules'
              ? 'bg-[#007BC4] text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <SlidersHorizontal size={15} /> Automated Dispatch Rules ({ruleList.length})
        </button>

        <button
          onClick={() => setActiveSubTab('broadcast')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'broadcast'
              ? 'bg-[#007BC4] text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Volume2 size={15} /> Emergency Siren & Muster Control
        </button>

        <button
          onClick={() => setActiveSubTab('heatmap')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'heatmap'
              ? 'bg-[#007BC4] text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Layers3 size={15} /> Spatial Hazard Heatmap
        </button>

        <button
          onClick={() => setActiveSubTab('analytics')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'analytics'
              ? 'bg-[#007BC4] text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <BarChart2 size={15} /> SLA Compliance & Metrics
        </button>
      </div>

      {/* Notification Toast */}
      {notificationMsg && (
        <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm border ${
          notificationMsg.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
          notificationMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
          'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {notificationMsg.type === 'error' ? <ShieldAlert size={16} className="text-rose-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
            {notificationMsg.text}
          </div>
          <button onClick={() => setNotificationMsg(null)} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ==================== SUBTAB 1: LIVE INCIDENT STREAM ==================== */}
      {activeSubTab === 'feed' && (
        <div className="space-y-6">
          
          {/* KPI Cards Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Incidents</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">{metrics.total}</span>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Emergency & Critical</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-2xl font-black text-rose-600">{metrics.critical + metrics.emergencyCount}</span>
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">In Progress</span>
              <span className="text-2xl font-black text-amber-600">{metrics.inProgress}</span>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Escalated (Tier 2/3)</span>
              <span className="text-2xl font-black text-indigo-600">{metrics.escalated}</span>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Resolved & Cleared</span>
              <span className="text-2xl font-black text-emerald-600">{metrics.resolved}</span>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Avg SLA Response</span>
              <span className="text-2xl font-black text-slate-800 dark:text-slate-200">{metrics.avgSla}</span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* AI Spatial & Zone Rules Intelligence Hub (🔴 Critical | 🟠 Warning | 🔵 Information) */}
          {/* ========================================================================= */}
          <div className="bg-white text-slate-900 rounded-3xl p-5 md:p-6 border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-gradient-to-br from-[#007BC4] to-indigo-600 rounded-xl text-white shadow-sm">
                    <Sparkles size={20} className="animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
                      AI Spatial & Zone Rules Intelligence Hub
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#007BC4] border border-blue-200">
                        13 Active Detection Rules
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Real-time edge rule evaluations for facility meeting rooms, high-hazard sectors, occupancy thresholds & RFID badge kinematics
                    </p>
                  </div>
                </div>
              </div>

              {/* AI Tier Filter Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap bg-slate-100 p-1 rounded-2xl border border-slate-200">
                <button
                  onClick={() => { setSelectedAiTier('all'); setSelectedAiRule(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    selectedAiTier === 'all' && !selectedAiRule
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  All Tiers (13)
                </button>

                <button
                  onClick={() => { setSelectedAiTier('Critical'); setSelectedAiRule(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    selectedAiTier === 'Critical'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-rose-700 hover:bg-rose-100/70'
                  }`}
                >
                  🔴 Critical ({AI_ALERT_RULES_CATALOG.filter(r => r.tier === 'Critical').length})
                </button>

                <button
                  onClick={() => { setSelectedAiTier('Warning'); setSelectedAiRule(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    selectedAiTier === 'Warning'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-amber-700 hover:bg-amber-100/70'
                  }`}
                >
                  🟠 Warning ({AI_ALERT_RULES_CATALOG.filter(r => r.tier === 'Warning').length})
                </button>

                <button
                  onClick={() => { setSelectedAiTier('Information'); setSelectedAiRule(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    selectedAiTier === 'Information'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-blue-700 hover:bg-blue-100/70'
                  }`}
                >
                  🔵 Information ({AI_ALERT_RULES_CATALOG.filter(r => r.tier === 'Information').length})
                </button>
              </div>
            </div>

            {/* AI Rules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {AI_ALERT_RULES_CATALOG
                .filter(r => selectedAiTier === 'all' || r.tier === selectedAiTier)
                .map(rule => {
                  const matchingCount = alertList.filter(a => a.title && a.title.toLowerCase().includes(rule.name.toLowerCase())).length;
                  const isSelectedRule = selectedAiRule === rule.name;

                  return (
                    <div
                      key={rule.id}
                      className={`p-3.5 rounded-2xl border transition flex flex-col justify-between space-y-3 ${
                        isSelectedRule
                          ? 'bg-blue-50/90 border-[#007BC4] ring-2 ring-blue-300 shadow-md'
                          : rule.tier === 'Critical'
                          ? 'bg-rose-50/60 hover:bg-rose-50 border-rose-200'
                          : rule.tier === 'Warning'
                          ? 'bg-amber-50/60 hover:bg-amber-50 border-amber-200'
                          : 'bg-blue-50/60 hover:bg-blue-50 border-blue-200'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-black flex items-center gap-1.5">
                            <span className="text-sm">{rule.tierEmoji}</span>
                            <span className={
                              rule.tier === 'Critical' ? 'text-rose-700 font-black' :
                              rule.tier === 'Warning' ? 'text-amber-800 font-black' : 'text-blue-800 font-black'
                            }>
                              {rule.tier}
                            </span>
                          </span>

                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 shadow-2xs">
                            {matchingCount} in Feed
                          </span>
                        </div>

                        <h4 className="font-bold text-slate-900 text-xs md:text-sm leading-snug">
                          {rule.name}
                        </h4>

                        <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                          {rule.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            if (selectedAiRule === rule.name) {
                              setSelectedAiRule(null);
                            } else {
                              setSelectedAiRule(rule.name);
                              setSelectedAiTier('all');
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer border ${
                            isSelectedRule
                              ? 'bg-[#007BC4] text-white border-[#007BC4]'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Filter size={11} /> {isSelectedRule ? 'Filtered' : 'Filter Feed'}
                        </button>

                        <button
                          onClick={() => handleTriggerAiRule(rule)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-sm transition flex items-center gap-1 cursor-pointer ${
                            rule.tier === 'Critical'
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : rule.tier === 'Warning'
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                          title={`Simulate and trigger an event for ${rule.name}`}
                        >
                          <Play size={11} className="fill-current" /> Trigger Test
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {selectedAiRule && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
                <span className="flex items-center gap-2 font-medium">
                  <Filter size={14} className="text-[#007BC4]" />
                  Live stream currently filtered by rule: <strong className="text-slate-900">{selectedAiRule}</strong>
                </span>
                <button
                  onClick={() => setSelectedAiRule(null)}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold cursor-pointer shadow-xs"
                >
                  Clear Rule Filter
                </button>
              </div>
            )}
          </div>

          {/* Category & Tier Quick Pills Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => { setSelectedCategory('All'); setSelectedAiTier('all'); setSelectedAiRule(null); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                selectedCategory === 'All' && selectedAiTier === 'all' && !selectedAiRule
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              All Alerts ({alertList.length})
            </button>

            <button
              onClick={() => { setSelectedAiTier(selectedAiTier === 'Critical' ? 'all' : 'Critical'); setSelectedCategory('All'); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap border ${
                selectedAiTier === 'Critical'
                  ? 'bg-rose-500 text-white border-rose-600 shadow-sm'
                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 hover:bg-rose-100'
              }`}
            >
              🔴 Critical ({metrics.criticalCount})
            </button>

            <button
              onClick={() => { setSelectedAiTier(selectedAiTier === 'Warning' ? 'all' : 'Warning'); setSelectedCategory('All'); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap border ${
                selectedAiTier === 'Warning'
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 hover:bg-amber-100'
              }`}
            >
              🟠 Warning ({metrics.warningCount})
            </button>

            <button
              onClick={() => { setSelectedAiTier(selectedAiTier === 'Information' ? 'all' : 'Information'); setSelectedCategory('All'); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap border ${
                selectedAiTier === 'Information'
                  ? 'bg-blue-500 text-white border-blue-600 shadow-sm'
                  : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-100'
              }`}
            >
              🔵 Information ({metrics.infoCount})
            </button>

            {CATEGORIES_LIST.map(cat => {
              const cfg = CATEGORY_CONFIG[cat];
              const Icon = cfg.icon;
              const count = alertList.filter(a => a.category === cat).length;

              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap border ${
                    selectedCategory === cat
                      ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-offset-1 ring-current shadow-sm`
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={14} className={cfg.color} />
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Filter Toolbar & Bulk Operations */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-3.5" />
              <input
                type="text"
                placeholder="Search incident ID, title, zone, officer..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              <select
                value={selectedPriority}
                onChange={e => setSelectedPriority(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 px-3 py-1.5 outline-none"
              >
                <option value="All">All Priorities</option>
                <option value="Critical">Critical Priority</option>
                <option value="High">High Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="Low">Low Priority</option>
              </select>

              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 px-3 py-1.5 outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="New">New</option>
                <option value="In Progress">In Progress</option>
                <option value="Escalated">Escalated</option>
                <option value="Resolved">Resolved</option>
              </select>

              {selectedAlertIds.length > 0 && (
                <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-700 pl-2">
                  <span className="text-[10px] font-bold text-slate-500">{selectedAlertIds.length} Selected</span>
                  <button
                    onClick={handleBulkAcknowledge}
                    className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold hover:bg-amber-100"
                  >
                    Acknowledge All
                  </button>
                  <button
                    onClick={handleBulkEscalate}
                    className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold hover:bg-rose-100"
                  >
                    Escalate All
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Incident List Cards */}
          <div className="space-y-3">
            {filteredAlerts.map(alert => {
              const cat = alert.category || 'Safety';
              const cfg = CATEGORY_CONFIG[cat];
              const Icon = cfg.icon;
              const isSelected = selectedAlertIds.includes(alert.id!);

              return (
                <div
                  key={alert.id}
                  className={`p-4 md:p-5 rounded-2xl border transition shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    alert.priority === 'Critical' ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900' :
                    alert.priority === 'High' ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900' :
                    'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSelectedAlertIds(prev => 
                          prev.includes(alert.id!) ? prev.filter(i => i !== alert.id) : [...prev, alert.id!]
                        );
                      }}
                      className="mt-1 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />

                    <div className={`p-3 rounded-2xl shrink-0 ${cfg.bg} ${cfg.border} border shadow-inner`}>
                      <Icon size={22} className={cfg.color} />
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-rose-600 bg-rose-50 dark:bg-rose-900/50 px-2 py-0.5 rounded-md border border-rose-200">
                          {alert.id}
                        </span>

                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                          {cat}
                        </span>

                        {alert.priority === 'Critical' && (
                          <Badge variant="outline" className="bg-rose-600 text-white font-black text-[10px] uppercase border-0 animate-pulse">
                            Critical Priority
                          </Badge>
                        )}
                        {alert.priority === 'High' && (
                          <Badge variant="outline" className="bg-amber-500 text-white font-black text-[10px] uppercase border-0">
                            High Priority
                          </Badge>
                        )}
                        {alert.priority === 'Medium' && (
                          <Badge variant="outline" className="bg-blue-500 text-white font-black text-[10px] uppercase border-0">
                            Medium
                          </Badge>
                        )}
                        {alert.priority === 'Low' && (
                          <Badge variant="outline" className="bg-slate-400 text-white font-black text-[10px] uppercase border-0">
                            Low
                          </Badge>
                        )}

                        <span className="text-xs text-slate-400 font-mono">
                          {alert.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug">
                        {alert.title || alert.message}
                      </h3>

                      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium line-clamp-2">
                        {alert.message}
                      </p>

                      <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 pt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-[#007BC4]" />
                          {alert.evidence?.locationZone || 'Site Main Area'}
                        </span>

                        <div className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
                          <UserCheck size={12} className="text-emerald-600" />
                          <span>Assigned:</span>
                          <select
                            value={alert.assignedTo || OFFICERS_LIST[0]}
                            onChange={e => handleReassignOfficer(alert, e.target.value)}
                            className="bg-transparent font-bold border-b border-dashed border-slate-400 outline-none cursor-pointer text-xs"
                          >
                            {OFFICERS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>

                        {alert.comments && alert.comments.length > 0 && (
                          <span className="flex items-center gap-1 text-slate-600">
                            <MessageSquare size={12} />
                            {alert.comments.length} Comments
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status & Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end lg:self-center flex-wrap">
                    {alert.status === 'New' && (
                      <button
                        onClick={() => handleAcknowledgeAlert(alert)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1 cursor-pointer"
                        title="Acknowledge Alert & Begin Incident Handling"
                      >
                        <Check size={14} /> Acknowledge
                      </button>
                    )}

                    {alert.status === 'Resolved' || alert.resolved ? (
                      <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                        <CheckCircle2 size={15} /> Resolved
                      </span>
                    ) : alert.status === 'Escalated' ? (
                      <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5 animate-pulse">
                        <ShieldAlert size={15} /> Escalated (Tier 2)
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                        <Clock size={15} /> In Progress
                      </span>
                    )}

                    {alert.status !== 'Resolved' && !alert.resolved && (
                      <>
                        <button
                          onClick={() => handleDirectCloseAlert(alert)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1 cursor-pointer"
                          title="1-Click Resolve & Close Incident permanently"
                        >
                          <CheckCircle2 size={14} /> Resolve & Close
                        </button>

                        <button
                          onClick={() => handleEscalateAlert(alert)}
                          className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="Escalate Alert to Executive Tier 2"
                        >
                          <ArrowUpRight size={14} /> Escalate
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => {
                        setSelectedAlert(alert);
                        setActiveDetailTab('ai_summary');
                      }}
                      className="px-3 py-1.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye size={14} /> Details
                    </button>

                    <button
                      onClick={() => handleDeleteAlert(alert.id!)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
                      title="Permanently Dismiss & Delete Alert"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredAlerts.length === 0 && (
              <div className="py-16 text-center text-slate-500 font-medium bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
                No active alerts matching search criteria.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SUBTAB 2: AUTOMATED DISPATCH RULES ==================== */}
      {activeSubTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Automated Escalation & Dispatch Policy Engine</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure automated policies that trigger PA sirens, auto-assign safety officers & escalate SLAs based on hazard conditions.</p>
            </div>
            <button
              onClick={() => setIsCreateRuleModalOpen(true)}
              className="px-4 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={15} /> Create Escalation Rule
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ruleList.map(rule => (
              <div key={rule.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3 relative">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#007BC4] bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded">
                    {rule.id}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRule(rule)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition ${
                        rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Delete Rule"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{rule.name}</h4>

                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                  <div><strong>Category:</strong> {rule.category} | <strong>Min Priority:</strong> {rule.priorityThreshold}</div>
                  <div><strong>Target Zone:</strong> {rule.targetZone}</div>
                  <div><strong>Trigger SLA:</strong> {rule.slaMinutes} Mins</div>
                  <div><strong>Auto-Assign:</strong> {rule.autoAssignOfficer}</div>
                  <div><strong>Auto-Escalate:</strong> {rule.autoEscalateTier}</div>
                  <div className="flex gap-2 pt-1">
                    {rule.triggerSiren && <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-bold rounded">Siren Enabled</span>}
                    {rule.notifySmsEmail && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">SMS & Email</span>}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center text-[11px] text-slate-400 font-mono">
                  <span>Triggers: {rule.triggerCount} times</span>
                  <span>Last: {rule.lastTriggered || 'Never'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== SUBTAB 3: EMERGENCY SIREN & MUSTER CONTROL ==================== */}
      {activeSubTab === 'broadcast' && (
        <div className="space-y-6">
          
          {/* Master Emergency Siren Activation Box */}
          <div className="bg-gradient-to-r from-rose-50/80 via-white to-rose-50/80 border-2 border-rose-200 text-slate-900 rounded-3xl p-6 shadow-sm relative overflow-hidden space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
              <div>
                <span className="px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-black uppercase tracking-wider border border-rose-300 inline-flex items-center gap-1.5 mb-2">
                  <Siren size={14} className="animate-pulse text-rose-600" /> Site-Wide PA & Siren Controller
                </span>
                <h3 className="text-2xl font-black text-slate-900">Emergency Siren & Evacuation Broadcast Command</h3>
                <p className="text-slate-600 text-xs mt-1 max-w-xl">
                  Broadcast instant audio sirens, send automated SMS alerts to all active on-site personnel, and initiate real-time muster clearance tracking.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleTriggerBroadcast('ALL SITE ZONES', 'Siren Alarm', 'SITE-WIDE EMERGENCY SIREN & EVACUATION ORDER')}
                  className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-sm rounded-2xl shadow-lg transition flex items-center gap-2 animate-bounce cursor-pointer"
                >
                  <Volume2 size={20} /> ACTIVATE SITE-WIDE SIREN
                </button>
              </div>
            </div>

            {/* Quick Zone Siren Buttons */}
            <div className="pt-4 border-t border-rose-100 grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10">
              {[
                { name: 'Confined Shaft L3', icon: Flame },
                { name: 'Scaffolding Level 1-4', icon: HardHat },
                { name: 'Heavy Crane Yard', icon: Zap },
                { name: 'Gatehouse Gate 1', icon: Shield }
              ].map(z => (
                <button
                  key={z.name}
                  onClick={() => handleTriggerBroadcast(z.name, 'Evacuation Order', `${z.name} Immediate Local Zone Evacuation`)}
                  className="p-3 bg-white hover:bg-rose-50 border border-rose-200 rounded-xl text-left text-xs font-bold transition flex items-center justify-between text-slate-800 shadow-2xs cursor-pointer"
                >
                  <span className="truncate">{z.name} Siren</span>
                  <Volume2 size={14} className="text-rose-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Active Emergency Broadcasts Table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Siren size={18} className="text-rose-600" /> Active Emergency Broadcast Log
            </h3>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Broadcast ID</TableHead>
                    <TableHead>Title & Type</TableHead>
                    <TableHead>Target Zone</TableHead>
                    <TableHead>Activated By</TableHead>
                    <TableHead>Muster Clearance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {broadcastList.map(bc => (
                    <TableRow key={bc.id}>
                      <TableCell className="font-mono font-bold text-xs text-rose-600">{bc.id}</TableCell>
                      <TableCell>
                        <div className="font-bold text-xs text-slate-900 dark:text-white">{bc.title}</div>
                        <span className="text-[10px] text-slate-400 font-medium">{bc.type}</span>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{bc.zone}</TableCell>
                      <TableCell className="text-xs font-medium">{bc.activatedBy}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span>{bc.musterAccounted} / {bc.musterTarget} workers</span>
                          <span className="text-emerald-600 font-mono">({Math.round((bc.musterAccounted / bc.musterTarget) * 100)}%)</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {bc.status === 'ACTIVE' ? (
                          <Badge variant="outline" className="bg-rose-600 text-white font-black text-[10px] uppercase border-0 animate-pulse">
                            ACTIVE SIREN
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-600 text-white font-black text-[10px] uppercase border-0">
                            CLEARED
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {bc.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleClearBroadcast(bc.id)}
                            className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-bold"
                          >
                            Silence & Clear
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SUBTAB 4: SPATIAL HAZARD HEATMAP ==================== */}
      {activeSubTab === 'heatmap' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Site Spatial Hazard & Risk Heatmap</h3>
              <p className="text-xs text-slate-500 mt-0.5">Click any site zone to view real-time environmental telemetry and filter live incidents for that location.</p>
            </div>
            {selectedZone !== 'All' && (
              <button
                onClick={() => setSelectedZone('All')}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1"
              >
                Clear Zone Filter ({selectedZone})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { name: 'Confined Shaft & Tunneling', risk: 'CRITICAL', score: 92, temp: '31.2°C', gas: '48ppm CO', activeIncidents: 1, bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-300 dark:border-rose-800', badgeColor: 'bg-rose-600' },
              { name: 'Structure & Scaffolding (L1-L4)', risk: 'HIGH', score: 82, temp: '28.5°C', gas: 'Optimal', activeIncidents: 1, bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-300 dark:border-amber-800', badgeColor: 'bg-amber-500' },
              { name: 'Heavy Crane & Exclusion Area', risk: 'HIGH', score: 78, temp: '29.0°C', gas: 'Optimal', activeIncidents: 2, bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-300 dark:border-amber-800', badgeColor: 'bg-amber-500' },
              { name: 'Gate 1 Gatehouse', risk: 'MODERATE', score: 65, temp: '26.1°C', gas: 'Optimal', activeIncidents: 1, bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-300 dark:border-blue-800', badgeColor: 'bg-blue-600' },
              { name: 'Laydown Yard & Material Staging', risk: 'SAFE', score: 25, temp: '25.0°C', gas: 'Optimal', activeIncidents: 0, bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-800', badgeColor: 'bg-emerald-600' },
              { name: 'Site Office & Welcome Center', risk: 'SAFE', score: 15, temp: '22.4°C', gas: 'Optimal', activeIncidents: 0, bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-800', badgeColor: 'bg-emerald-600' }
            ].map(z => (
              <div
                key={z.name}
                onClick={() => {
                  setSelectedZone(z.name);
                  setActiveSubTab('feed');
                  setNotificationMsg({ type: 'info', text: `Filtered Live Stream for Zone: ${z.name}` });
                }}
                className={`p-5 rounded-2xl border ${z.bg} ${z.border} cursor-pointer hover:shadow-md transition space-y-3 relative overflow-hidden`}
              >
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className={`${z.badgeColor} text-white font-black text-[10px] uppercase border-0`}>
                    {z.risk} RISK ({z.score}/100)
                  </Badge>
                  <span className="text-xs font-mono font-bold text-slate-500">{z.activeIncidents} Active Hazards</span>
                </div>

                <h4 className="font-bold text-slate-900 dark:text-white text-base">{z.name}</h4>

                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/50">
                  <div>Ambient Temp: <strong>{z.temp}</strong></div>
                  <div>Gas Level: <strong>{z.gas}</strong></div>
                </div>

                <div className="text-[11px] font-bold text-[#007BC4] flex items-center gap-1">
                  View Zone Incident Feed <ChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== SUBTAB 5: SLA COMPLIANCE & ANALYTICS ==================== */}
      {activeSubTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Category Distribution Chart */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Incident Distribution by Category</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#007BC4" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Priority Pie Breakdown */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Hazard Priority Breakdown</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={priorityPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {priorityPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* SELECTED ALERT DETAIL DRAWER / MODAL */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between bg-slate-50 dark:bg-slate-900">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-rose-600 bg-rose-100 dark:bg-rose-900 px-2 py-0.5 rounded">
                    {selectedAlert.id}
                  </span>
                  <Badge variant="outline" className="bg-rose-600 text-white text-[10px] uppercase font-bold">
                    {selectedAlert.priority || 'High'} Priority
                  </Badge>
                  <span className="text-xs text-slate-500 font-mono">
                    {selectedAlert.timestamp.toLocaleString()}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {selectedAlert.title || selectedAlert.message}
                </h3>
              </div>

              <button
                onClick={() => setSelectedAlert(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sub-Nav Tabs inside Detail Modal */}
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 px-5 pt-3 bg-white dark:bg-slate-800 overflow-x-auto">
              {[
                { id: 'ai_summary', label: 'AI Diagnosis & Action', icon: Sparkles },
                { id: 'evidence', label: 'CCTV & Telemetry Evidence', icon: Camera },
                { id: 'timeline', label: 'Timeline & Escalation', icon: Clock },
                { id: 'resolution', label: 'Resolution & Audit', icon: ShieldCheck },
                { id: 'comments', label: `Comments (${selectedAlert.comments?.length || 0})`, icon: MessageSquare }
              ].map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveDetailTab(t.id as any)}
                    className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                      activeDetailTab === t.id
                        ? 'border-[#007BC4] text-[#007BC4]'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Body Content */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              
              {/* TAB 1: AI SUMMARY */}
              {activeDetailTab === 'ai_summary' && (
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-900 border border-blue-200 dark:border-blue-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-900 dark:text-blue-200 text-xs flex items-center gap-1.5">
                        <Sparkles size={16} className="text-[#007BC4]" />
                        Antigravity AI Cause & Threat Engine
                      </span>
                      <span className="px-2.5 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-full">
                        Threat Score: {selectedAlert.aiSummary?.threatScore || 85}/100
                      </span>
                    </div>

                    <div className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                      <strong>AI Root Cause Diagnosis:</strong> {selectedAlert.aiSummary?.rootCause || 'Root cause under automatic AI evaluation.'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                      Recommended Immediate Containment Protocol
                    </h4>
                    <div className="space-y-2">
                      {(selectedAlert.aiSummary?.recommendedActions || [
                        'Dispatch nearest field responder unit.',
                        'Review CCTV frame telemetry log.',
                        'Notify EHS Director if unresolved in 15 minutes.'
                      ]).map((act, i) => (
                        <div key={i} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-start gap-2">
                          <span className="w-5 h-5 bg-[#007BC4] text-white rounded-full flex items-center justify-center shrink-0 text-[10px] font-black">{i + 1}</span>
                          {act}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: EVIDENCE */}
              {activeDetailTab === 'evidence' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2 relative overflow-hidden">
                      <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                        <span className="flex items-center gap-1">
                          <Camera size={14} className="text-rose-500" />
                          {selectedAlert.evidence?.cctvCameraId || 'CAM-GATE-1A'}
                        </span>
                        <span className="text-rose-400 font-bold animate-pulse">● CCTV LIVE FRAME</span>
                      </div>
                      <div className="h-32 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-center text-slate-500 text-xs font-mono">
                        [ CCTV Frame Preview Stream Encrypted ]
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                      <h4 className="font-bold text-slate-900 dark:text-white">RFID & Sensor Telemetry Log</h4>
                      <div className="space-y-1 font-mono text-slate-700 dark:text-slate-300">
                        <div><strong>Location Zone:</strong> {selectedAlert.evidence?.locationZone || 'Gatehouse'}</div>
                        <div><strong>RFID Reader ID:</strong> {selectedAlert.evidence?.rfidReaderId || 'RD-GATE-01'}</div>
                        <div><strong>Hardhat Tag:</strong> {selectedAlert.evidence?.rfidTagId || 'HH-7721'}</div>
                        <div><strong>Signal RSSI:</strong> {selectedAlert.evidence?.rssiDbm || -65} dBm</div>
                      </div>
                      <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg text-[10px] font-mono break-all text-slate-800 dark:text-slate-200">
                        {selectedAlert.evidence?.telemetryLog || '[LOG] No raw telemetry log payload attached.'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TIMELINE & ESCALATION */}
              {activeDetailTab === 'timeline' && (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 rounded-2xl space-y-2 text-xs">
                    <div className="flex justify-between font-bold text-amber-900 dark:text-amber-200">
                      <span>Escalation Matrix Level: {selectedAlert.escalation?.level || 'Tier 1'}</span>
                      <span>SLA: {selectedAlert.escalation?.elapsedMinutes || 10} / {selectedAlert.escalation?.slaMinutes || 15} mins</span>
                    </div>
                    <div className="w-full bg-amber-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-rose-600 h-full rounded-full" style={{ width: `${Math.min(100, ((selectedAlert.escalation?.elapsedMinutes || 10) / (selectedAlert.escalation?.slaMinutes || 15)) * 100)}%` }} />
                    </div>
                    <div className="text-slate-500">Auto-Escalation Target: {selectedAlert.escalation?.autoEscalateTarget || 'EHS Director'}</div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">Chronological Event Timeline</h4>
                    <div className="space-y-3 border-l-2 border-slate-200 dark:border-slate-700 ml-2 pl-4">
                      {(selectedAlert.timeline || [
                        { time: '10:00 AM', title: 'Alert Triggered', description: 'System recorded anomaly event.', actor: 'Automated System', type: 'trigger' }
                      ]).map((item, idx) => (
                        <div key={idx} className="relative text-xs space-y-0.5">
                          <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#007BC4]" />
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{item.title}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({item.time})</span>
                          </div>
                          <div className="text-slate-600 dark:text-slate-300">{item.description}</div>
                          <div className="text-[10px] text-slate-400">Actor: {item.actor}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: RESOLUTION */}
              {activeDetailTab === 'resolution' && (
                <div className="space-y-4">
                  {selectedAlert.status === 'Resolved' || selectedAlert.resolved ? (
                    <div className="p-4 bg-emerald-50 dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2 text-xs">
                      <div className="font-bold text-emerald-900 dark:text-emerald-200 text-sm flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                        Incident Resolved & Verified
                      </div>
                      <div><strong>Resolved By:</strong> {selectedAlert.resolution?.resolvedBy || OFFICERS_LIST[0]}</div>
                      <div><strong>Root Cause:</strong> {selectedAlert.resolution?.rootCause}</div>
                      <div><strong>Corrective Action:</strong> {selectedAlert.resolution?.correctiveAction}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Resolved At: {selectedAlert.resolution?.resolvedAt}</div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                      <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase">EHS Incident Sign-Off & Resolution</h4>
                      <p className="text-xs text-slate-500">Provide root cause analysis and corrective action taken before marking resolved.</p>
                      <button
                        onClick={() => setIsResolveModalOpen(true)}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={16} /> Mark Incident Resolved & Sign Off
                      </button>
                    </div>
                  )}

                  {/* Audit History */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase">Audit Log History</h4>
                    <div className="space-y-1.5 text-xs">
                      {(selectedAlert.history || []).map((h, i) => (
                        <div key={i} className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg flex justify-between font-mono text-[11px]">
                          <span>{h.action} (by {h.user})</span>
                          <span className="text-slate-400">{formatAlertTimestamp(h.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: COMMENTS */}
              {activeDetailTab === 'comments' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {(selectedAlert.comments || []).map(c => (
                      <div key={c.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-1 text-xs">
                        <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                          <span>{c.author} ({c.role})</span>
                          <span className="text-[10px] text-slate-400 font-mono">{formatAlertTimestamp(c.timestamp)}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 font-medium">{c.text}</p>
                      </div>
                    ))}

                    {(!selectedAlert.comments || selectedAlert.comments.length === 0) && (
                      <div className="py-8 text-center text-slate-400 text-xs">No comments posted yet.</div>
                    )}
                  </div>

                  {/* Add Comment Input */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <input
                      type="text"
                      placeholder="Post official safety update comment..."
                      value={newCommentText}
                      onChange={e => setNewCommentText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                      className="flex-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#007BC4]"
                    />
                    <button
                      onClick={handleAddComment}
                      className="px-4 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                    >
                      <Send size={14} /> Send
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
              <button
                onClick={() => handleEscalateAlert(selectedAlert)}
                disabled={selectedAlert.status === 'Resolved'}
                className="px-3.5 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <ArrowUpRight size={15} /> Escalate Alert
              </button>

              <button
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CREATE ALERT MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateAlertSubmit} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-3xl w-full max-w-lg p-6 relative space-y-4">
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus size={18} className="text-rose-600" />
              Trigger Custom Enterprise Incident Alert
            </h3>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Category</label>
                  <select
                    value={newAlert.category}
                    onChange={e => setNewAlert({ ...newAlert, category: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    {CATEGORIES_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Priority</label>
                  <select
                    value={newAlert.priority}
                    onChange={e => setNewAlert({ ...newAlert, priority: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value="Critical">Critical Priority</option>
                    <option value="High">High Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="Low">Low Priority</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Incident Headline Title</label>
                <input
                  type="text"
                  value={newAlert.title}
                  onChange={e => setNewAlert({ ...newAlert, title: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  placeholder="e.g. Scaffolding Structure Anchor Failure Risk"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Detailed Incident Description</label>
                <textarea
                  value={newAlert.message}
                  onChange={e => setNewAlert({ ...newAlert, message: e.target.value })}
                  rows={3}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  placeholder="Describe telemetry anomaly, visual CCTV detection, or site hazard..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Location Zone</label>
                  <input
                    type="text"
                    value={newAlert.locationZone}
                    onChange={e => setNewAlert({ ...newAlert, locationZone: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Assign Officer</label>
                  <select
                    value={newAlert.assignedTo}
                    onChange={e => setNewAlert({ ...newAlert, assignedTo: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    {OFFICERS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold shadow-md hover:bg-rose-700 transition"
                >
                  Post Incident Alert
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* CREATE RULE MODAL */}
      {isCreateRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateRuleSubmit} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-3xl w-full max-w-lg p-6 relative space-y-4">
            <button type="button" onClick={() => setIsCreateRuleModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-[#007BC4]" />
              Create Automated Escalation & Dispatch Rule
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Rule Policy Name</label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  placeholder="e.g. Scaffolding Harness Risk Auto-Escalate"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Target Category</label>
                  <select
                    value={newRule.category}
                    onChange={e => setNewRule({ ...newRule, category: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value="All">All Categories</option>
                    {CATEGORIES_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Priority Threshold</label>
                  <select
                    value={newRule.priorityThreshold}
                    onChange={e => setNewRule({ ...newRule, priorityThreshold: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value="Critical">Critical Priority</option>
                    <option value="High">High Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="Low">Low Priority</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Trigger SLA (Mins)</label>
                  <input
                    type="number"
                    value={newRule.slaMinutes}
                    onChange={e => setNewRule({ ...newRule, slaMinutes: parseInt(e.target.value) || 10 })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Auto-Assign Officer</label>
                  <select
                    value={newRule.autoAssignOfficer}
                    onChange={e => setNewRule({ ...newRule, autoAssignOfficer: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    {OFFICERS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={newRule.triggerSiren}
                    onChange={e => setNewRule({ ...newRule, triggerSiren: e.target.checked })}
                    className="rounded text-rose-600"
                  />
                  Trigger PA Siren
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={newRule.notifySmsEmail}
                    onChange={e => setNewRule({ ...newRule, notifySmsEmail: e.target.checked })}
                    className="rounded text-[#007BC4]"
                  />
                  Send SMS/Email Alert
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateRuleModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition"
                >
                  Save Dispatch Rule
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* RESOLUTION MODAL */}
      {isResolveModalOpen && selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form onSubmit={handleResolveSubmit} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-3xl w-full max-w-md p-6 relative space-y-4">
            <button type="button" onClick={() => setIsResolveModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />
              Sign Off & Resolve Incident {selectedAlert.id}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Confirmed Root Cause Analysis</label>
                <textarea
                  value={resolutionData.rootCause}
                  onChange={e => setResolutionData({ ...resolutionData, rootCause: e.target.value })}
                  rows={2}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  placeholder="Detail the technical or operational root cause..."
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Corrective Actions Executed</label>
                <textarea
                  value={resolutionData.correctiveAction}
                  onChange={e => setResolutionData({ ...resolutionData, correctiveAction: e.target.value })}
                  rows={2}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  placeholder="Detail containment, equipment repair, or safety clearance..."
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Signing EHS Officer</label>
                <select
                  value={resolutionData.verificationOfficer}
                  onChange={e => setResolutionData({ ...resolutionData, verificationOfficer: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  required
                >
                  {OFFICERS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsResolveModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold shadow-md hover:bg-emerald-700 transition"
                >
                  Confirm Sign-Off & Clear Alert
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}