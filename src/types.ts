export type PresenceState = 'MOVING' | 'IDLE' | 'EXITED';

export interface Person {
  id: string;
  name: string;
  role: string;
  tradeCompany?: string;
  ppeStatus?: 'COMPLIANT' | 'NON_COMPLIANT' | 'WARNING';
  shiftStatus?: 'ON_SITE' | 'OFF_SITE' | 'ON_LEAVE';
  trainingStatus?: 'COMPLIANT' | 'DUE_SOON' | 'OVERDUE' | 'PENDING';
  lastTrainingDate?: string;
  trainingCourse?: string;
  trainingExpiry?: string;
  isLate?: boolean;
  certifications?: string[];
  hardhatTagId?: string;
  permitToWork?: string | null;
  currentZone: string;
  presenceState: PresenceState;
  dwellTime: number; 
  x: number; 
  y: number;
  speed?: number; // m/s
  heading?: number; // degrees
  rssi?: number; // dBm
  battery?: number; // %
  lastReader?: string;
  lastSeen: Date;
  trail: {x: number, y: number}[];
  activityInsights?: { activity: string; confidence: number };
  projectId?: string;
  targetX?: number;
  targetY?: number;
  idleRemaining?: number;
}

export interface Asset { 
  id: string; 
  name: string; 
  type: string; 
  x: number; 
  y: number; 
  status?: string; 
  battery?: number;
  speed?: number;
  heading?: number;
  rssi?: number;
  lastReader?: string;
  projectId?: string;
}

export interface Vehicle { 
  id: string; 
  name: string; 
  type: string; 
  x: number; 
  y: number; 
  status?: string; 
  speed?: number; // km/h or m/s
  heading?: number;
  rssi?: number;
  fuel?: number;
  operator?: string;
  projectId?: string;
  trail?: {x: number, y: number}[];
  targetX?: number;
  targetY?: number;
  idleRemaining?: number;
}

export interface CameraDevice { 
  id: string; 
  name: string; 
  x: number; 
  y: number; 
  status?: 'online' | 'offline'; 
  projectId?: string;
  resolution?: string;
  angle?: number;
}

export interface EnvSensor { 
  id: string; 
  name: string; 
  x: number; 
  y: number; 
  status?: 'online' | 'offline'; 
  temperature?: number;
  humidity?: number;
  gasLevel?: number;
  dustPM25?: number;
  noiseDb?: number;
  battery?: number;
  projectId?: string;
}

export type AlertCategory = 
  | 'Emergency' 
  | 'Safety' 
  | 'Security' 
  | 'Equipment' 
  | 'Reader' 
  | 'Worker' 
  | 'Visitor' 
  | 'Maintenance' 
  | 'Weather' 
  | 'System';

export type AlertPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type AlertStatus = 'New' | 'In Progress' | 'Escalated' | 'Resolved' | 'Suppressed';

export interface AlertComment {
  id: string;
  author: string;
  role: string;
  timestamp: string;
  text: string;
}

export interface AlertTimelineEvent {
  time: string;
  title: string;
  description: string;
  actor: string;
  type: 'trigger' | 'system' | 'assignment' | 'escalation' | 'resolution' | 'comment';
}

export interface AlertEvidence {
  cctvCameraId?: string;
  cctvSnapshotUrl?: string;
  rfidReaderId?: string;
  rfidTagId?: string;
  rssiDbm?: number;
  locationZone?: string;
  coordinates?: { x: number; y: number };
  telemetryLog?: string;
  attachedDocs?: string[];
}

export interface AlertEscalationInfo {
  level: 'Tier 1 (Gatehouse)' | 'Tier 2 (EHS Director)' | 'Tier 3 (Site Operations VP)';
  slaMinutes: number;
  elapsedMinutes: number;
  autoEscalateTarget: string;
  isEscalated: boolean;
}

export interface AlertResolutionInfo {
  resolvedBy?: string;
  resolvedAt?: string;
  rootCause?: string;
  correctiveAction?: string;
  verificationOfficer?: string;
}

export interface AIAlert {
  id?: string;
  type: 'security' | 'warning' | 'info';
  category?: AlertCategory;
  priority?: AlertPriority;
  status?: AlertStatus;
  title?: string;
  message: string;
  timestamp: Date;
  resolved?: boolean;
  
  // Enterprise Alert Center details
  assignedTo?: string;
  assignedRole?: string;
  assignedAt?: string;
  
  aiSummary?: {
    rootCause: string;
    threatScore: number;
    recommendedActions: string[];
  };
  
  evidence?: AlertEvidence;
  comments?: AlertComment[];
  timeline?: AlertTimelineEvent[];
  escalation?: AlertEscalationInfo;
  resolution?: AlertResolutionInfo;
  history?: { timestamp: string; action: string; user: string }[];
}

export type IncidentCategory = 
  | 'Near Miss' 
  | 'Injury' 
  | 'Equipment Damage' 
  | 'Fire' 
  | 'Medical' 
  | 'Security' 
  | 'Chemical' 
  | 'Electrical' 
  | 'Environmental';

export type IncidentWorkflowStatus = 
  | 'Open' 
  | 'Assigned' 
  | 'Investigation' 
  | 'Root Cause' 
  | 'Corrective Action' 
  | 'Approval' 
  | 'Closed';

export interface WitnessStatement {
  id: string;
  witnessName: string;
  witnessRole: string;
  company: string;
  interviewedBy: string;
  timestamp: string;
  statement: string;
}

export interface IncidentAttachment {
  id: string;
  fileName: string;
  fileType: 'CCTV Clip' | 'Photo' | 'Telemetry Log' | 'Inspection PDF' | 'Medical Report';
  fileUrl: string;
  fileSize: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface IncidentTimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  actor: string;
  statusChange?: IncidentWorkflowStatus;
}

export interface AIIncidentAnalysis {
  severityScore: number; // 1 to 100
  aiSummary: string;
  probableRootCause: string;
  contributingFactors: string[];
  capaRecommendations: string[]; // Corrective & Preventive Action
  regulatoryImpact: string; // EHS OSHA / ISO 45001 compliance risk
}

export interface EnterpriseIncident {
  id: string;
  title: string;
  category: IncidentCategory;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  workflowStatus: IncidentWorkflowStatus;
  locationZone: string;
  reportedAt: Date | string;
  reportedBy: string;
  assignedOfficer: string;
  assignedRole: string;
  description: string;
  
  // Specific Incident Fields
  injuredPersonnelCount?: number;
  equipmentInvolved?: string;
  hazardClass?: string;
  
  aiAnalysis?: AIIncidentAnalysis;
  witnessStatements?: WitnessStatement[];
  attachments?: IncidentAttachment[];
  timeline?: IncidentTimelineEvent[];
  rootCauseDetails?: {
    causeType: string;
    description: string;
    verifiedBy: string;
  };
  correctiveActions?: {
    id: string;
    actionItem: string;
    assignedTo: string;
    dueDate: string;
    isCompleted: boolean;
  }[];
  approvalSignOff?: {
    approvedBy: string;
    approvedAt: string;
    comments: string;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  category: AlertCategory | 'All';
  priorityThreshold: AlertPriority;
  targetZone: string;
  slaMinutes: number;
  autoAssignOfficer: string;
  autoEscalateTier: 'Tier 1 (Gatehouse)' | 'Tier 2 (EHS Director)' | 'Tier 3 (Site Operations VP)';
  triggerSiren: boolean;
  notifySmsEmail: boolean;
  enabled: boolean;
  triggerCount: number;
  lastTriggered?: string;
}

export interface EmergencyBroadcast {
  id: string;
  title: string;
  zone: string;
  type: 'Siren Alarm' | 'Evacuation Order' | 'Muster Drill' | 'Weather Lockout';
  activatedBy: string;
  timestamp: string;
  musterTarget: number;
  musterAccounted: number;
  status: 'ACTIVE' | 'CLEARED';
}

