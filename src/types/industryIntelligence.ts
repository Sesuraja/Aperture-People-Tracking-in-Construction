import { z } from 'zod';

export type IndustryType =
  | 'construction'
  | 'manufacturing'
  | 'office'
  | 'logistics'
  | 'healthcare'
  | 'mining'
  | 'oil_gas'
  | 'aviation'
  | 'custom';

export type TrackedEntityCategory =
  | 'people'
  | 'assets'
  | 'vehicles'
  | 'equipment'
  | 'visitors';

export interface FunctionalAreaConfig {
  id: string;
  name: string;
  code?: string;
  category: 'production' | 'storage' | 'hazardous' | 'restricted' | 'office' | 'common' | 'logistics' | 'safety';
  hazardLevel: 'normal' | 'warning' | 'critical';
  allowedEntities?: TrackedEntityCategory[];
  allowedRoles?: string[];
  maxOccupancy?: number;
  maxDwellMinutes?: number;
  speedLimitKmh?: number;
  requiredClearanceLevel?: string;
}

export interface IndustryKpiDefinition {
  key: string;
  label: string;
  unit: string;
  target: number;
  category: 'safety' | 'efficiency' | 'utilization' | 'compliance';
  description: string;
}

export interface AlertRuleTemplate {
  id: string;
  name: string;
  category: 'Safety' | 'Security' | 'Operational' | 'Compliance' | 'Asset';
  priorityThreshold: 'Critical' | 'High' | 'Medium' | 'Low';
  targetZone: string;
  slaMinutes: number;
  defaultAction: string;
  triggerSiren?: boolean;
  notifySmsEmail?: boolean;
}

export interface IncidentCategoryConfig {
  category: string;
  defaultSeverity: 'Critical' | 'High' | 'Medium' | 'Low';
  description: string;
  defaultInvestigationChecklist: string[];
}

export interface IndustryIntelligenceProfile {
  tenantId: string;
  industry: IndustryType;
  subIndustry: string;
  companyName?: string;
  facilityName?: string;
  functionalAreas: FunctionalAreaConfig[];
  trackedEntities: TrackedEntityCategory[];
  kpis: IndustryKpiDefinition[];
  alertRuleTemplates: AlertRuleTemplate[];
  incidentCategories: IncidentCategoryConfig[];
  complianceFramework: string;
  aiPersonaPrompt: string;
  terminology: {
    personnelSingular: string;
    personnelPlural: string;
    roleLabel: string;
    idBadgeLabel: string;
    safetyComplianceLabel: string;
    zoneLabel: string;
    siteLabel: string;
    organizationType: string;
  };
  updatedAt?: string;
  updatedBy?: string;
}

export const functionalAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().optional(),
  category: z.enum(['production', 'storage', 'hazardous', 'restricted', 'office', 'common', 'logistics', 'safety']),
  hazardLevel: z.enum(['normal', 'warning', 'critical']),
  allowedEntities: z.array(z.enum(['people', 'assets', 'vehicles', 'equipment', 'visitors'])).optional(),
  allowedRoles: z.array(z.string()).optional(),
  maxOccupancy: z.number().optional(),
  maxDwellMinutes: z.number().optional(),
  speedLimitKmh: z.number().optional(),
  requiredClearanceLevel: z.string().optional()
});

export const industryProfileSchema = z.object({
  tenantId: z.string().min(1),
  industry: z.enum(['construction', 'manufacturing', 'office', 'logistics', 'healthcare', 'mining', 'oil_gas', 'aviation', 'custom']),
  subIndustry: z.string().min(1),
  companyName: z.string().optional(),
  facilityName: z.string().optional(),
  functionalAreas: z.array(functionalAreaSchema),
  trackedEntities: z.array(z.enum(['people', 'assets', 'vehicles', 'equipment', 'visitors'])),
  kpis: z.array(z.object({
    key: z.string(),
    label: z.string(),
    unit: z.string(),
    target: z.number(),
    category: z.enum(['safety', 'efficiency', 'utilization', 'compliance']),
    description: z.string()
  })),
  alertRuleTemplates: z.array(z.object({
    id: z.string(),
    name: z.string(),
    category: z.enum(['Safety', 'Security', 'Operational', 'Compliance', 'Asset']),
    priorityThreshold: z.enum(['Critical', 'High', 'Medium', 'Low']),
    targetZone: z.string(),
    slaMinutes: z.number(),
    defaultAction: z.string(),
    triggerSiren: z.boolean().optional(),
    notifySmsEmail: z.boolean().optional()
  })),
  incidentCategories: z.array(z.object({
    category: z.string(),
    defaultSeverity: z.enum(['Critical', 'High', 'Medium', 'Low']),
    description: z.string(),
    defaultInvestigationChecklist: z.array(z.string())
  })),
  complianceFramework: z.string(),
  aiPersonaPrompt: z.string(),
  terminology: z.object({
    personnelSingular: z.string(),
    personnelPlural: z.string(),
    roleLabel: z.string(),
    idBadgeLabel: z.string(),
    safetyComplianceLabel: z.string(),
    zoneLabel: z.string(),
    siteLabel: z.string(),
    organizationType: z.string()
  })
});

/**
 * Built-in B2B Industry Presets (No hard-coded construction assumptions)
 */
export const INDUSTRY_PRESET_PROFILES: Record<IndustryType, Omit<IndustryIntelligenceProfile, 'tenantId'>> = {
  construction: {
    industry: 'construction',
    subIndustry: 'Commercial & Infrastructure Construction',
    companyName: 'General Contractors & Builders',
    facilityName: 'Tower One Job Site',
    trackedEntities: ['people', 'assets', 'vehicles', 'equipment', 'visitors'],
    functionalAreas: [
      { id: 'fa-crane', name: 'Crane Slewing & Hoisting Perimeter', code: 'CRANE-EXCL', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 10, requiredClearanceLevel: 'Rigger / Crane Operator' },
      { id: 'fa-scaffold', name: 'Elevated Scaffolding & Decking', code: 'SCAFF-01', category: 'restricted', hazardLevel: 'warning', maxDwellMinutes: 120, requiredClearanceLevel: 'Working at Heights Pass' },
      { id: 'fa-excavation', name: 'Foundation Trench & Shoring Pit', code: 'EXCAV-01', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 45 },
      { id: 'fa-laydown', name: 'Rebar & Heavy Material Laydown', code: 'LAYDOWN-01', category: 'storage', hazardLevel: 'normal', maxOccupancy: 20 },
      { id: 'fa-office', name: 'Site Command Office & Welfare Hub', code: 'SITE-HQ', category: 'office', hazardLevel: 'normal', maxOccupancy: 50 },
      { id: 'fa-assembly', name: 'Emergency Evacuation Muster Point', code: 'MUSTER-01', category: 'safety', hazardLevel: 'normal' }
    ],
    kpis: [
      { key: 'exclusion_breaches', label: 'Exclusion Perimeter Breaches', unit: 'events', target: 0, category: 'safety', description: 'Unauthorized entries into critical crane or excavation exclusion zones.' },
      { key: 'ppe_compliance', label: 'Hardhat & PPE Tag Verification', unit: '%', target: 98, category: 'compliance', description: 'Percentage of active workforce with valid RFID PPE telemetry.' },
      { key: 'muster_drill_time', label: 'Muster Clearance Latency', unit: 'min', target: 3, category: 'safety', description: 'Time taken to account for 100% of personnel at emergency muster stations.' },
      { key: 'subcontractor_density', label: 'Trade Workforce Density', unit: 'workers/zone', target: 12, category: 'utilization', description: 'Average density per active deck.' }
    ],
    alertRuleTemplates: [
      { id: 'RULE-CONST-01', name: 'Crane Swing Radius Exclusion Breach', category: 'Safety', priorityThreshold: 'Critical', targetZone: 'Crane Slewing & Hoisting Perimeter', slaMinutes: 3, defaultAction: 'Halt crane hoist, trigger horn strobe, notify rigger supervisor', triggerSiren: true, notifySmsEmail: true },
      { id: 'RULE-CONST-02', name: 'Confined Trench Loitering Overstay', category: 'Safety', priorityThreshold: 'High', targetZone: 'Foundation Trench & Shoring Pit', slaMinutes: 10, defaultAction: 'Dispatch field safety officer for atmosphere check', notifySmsEmail: true },
      { id: 'RULE-CONST-03', name: 'Missing Safety Hardhat Badge Signal', category: 'Compliance', priorityThreshold: 'Medium', targetZone: 'All Active Work Areas', slaMinutes: 15, defaultAction: 'Ping portal reader audio prompt for badge audit' }
    ],
    incidentCategories: [
      { category: 'Exclusion Zone Incursion', defaultSeverity: 'Critical', description: 'Personnel entered hazardous lifting or excavation perimeter.', defaultInvestigationChecklist: ['Verify crane lock-out status', 'Inspect warning signage', 'Check worker certification'] },
      { category: 'Fall Hazard Near-Miss', defaultSeverity: 'High', description: 'Personnel near unprotected leading edge without anchor verification.', defaultInvestigationChecklist: ['Inspect harness lanyard', 'Verify static line integrity'] },
      { category: 'Unregistered Contractor Presence', defaultSeverity: 'Medium', description: 'Active badge detected without site induction record.', defaultInvestigationChecklist: ['Verify badge assignment', 'Conduct gate audit'] }
    ],
    complianceFramework: 'OSHA 1926 Safety & Health Regulations for Construction',
    aiPersonaPrompt: 'You are an elite Industrial EHS Director for Heavy Construction. Analyze RFID telemetry, perimeter incursions, equipment proximity, and worker dwell patterns.',
    terminology: {
      personnelSingular: 'Worker',
      personnelPlural: 'Workers',
      roleLabel: 'Trade / Specialty',
      idBadgeLabel: 'Hardhat Tag ID',
      safetyComplianceLabel: 'PPE Compliance (Hardhat/Vest)',
      zoneLabel: 'Work Zone',
      siteLabel: 'Job Site',
      organizationType: 'Subcontractor / Trade Firm'
    }
  },

  manufacturing: {
    industry: 'manufacturing',
    subIndustry: 'Advanced Discrete & Automotive Manufacturing',
    companyName: 'Precision Dynamics Manufacturing',
    facilityName: 'Plant 4 Assembly & Machining Center',
    trackedEntities: ['people', 'assets', 'vehicles', 'equipment'],
    functionalAreas: [
      { id: 'fa-robotic-cell', name: 'Automated Robotic Welding Cell', code: 'ROBO-WELD', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 0, requiredClearanceLevel: 'Automation Maintenance Specialist' },
      { id: 'fa-stamping', name: 'Heavy Stamping & Press Line', code: 'PRESS-01', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 30 },
      { id: 'fa-assembly-line', name: 'Main Final Assembly Line (Stations 1-12)', code: 'LINE-MAIN', category: 'production', hazardLevel: 'normal', maxOccupancy: 36 },
      { id: 'fa-tooling-crib', name: 'High-Value Tooling & Die Crib', code: 'CRIB-01', category: 'storage', hazardLevel: 'normal', maxOccupancy: 8 },
      { id: 'fa-qa-lab', name: 'Quality Assurance & Metrology Lab', code: 'QA-LAB', category: 'office', hazardLevel: 'normal', maxOccupancy: 12 },
      { id: 'fa-agv-corridor', name: 'AGV / Forklift Internal Transit Lane', code: 'AGV-LANE', category: 'logistics', hazardLevel: 'warning', speedLimitKmh: 12 }
    ],
    kpis: [
      { key: 'line_congestion', label: 'Assembly Line Congestion Index', unit: '%', target: 8, category: 'efficiency', description: 'Frequency of operator overcrowding at specific workstation cells.' },
      { key: 'machine_proximity_events', label: 'Robotic Cell Proximity Violations', unit: 'events', target: 0, category: 'safety', description: 'Human presence detected inside interlocked robot envelope during cycle.' },
      { key: 'station_dwell_adherence', label: 'Cycle Station Dwell Adherence', unit: '%', target: 96, category: 'efficiency', description: 'Percentage of takt-time cycles where technicians remain at designated stations.' },
      { key: 'tooling_retrieval_latency', label: 'Die & Tooling Retrieval Time', unit: 'min', target: 5, category: 'utilization', description: 'Average time spent locating active die assets via UHF RFID.' }
    ],
    alertRuleTemplates: [
      { id: 'RULE-MFG-01', name: 'Robotic Cell Interlock Perimeter Breach', category: 'Safety', priorityThreshold: 'Critical', targetZone: 'Automated Robotic Welding Cell', slaMinutes: 1, defaultAction: 'Execute emergency machine stop (E-STOP), trigger overhead red beacon', triggerSiren: true, notifySmsEmail: true },
      { id: 'RULE-MFG-02', name: 'AGV Transit Lane Pedestrian Stagnation', category: 'Operational', priorityThreshold: 'High', targetZone: 'AGV / Forklift Internal Transit Lane', slaMinutes: 5, defaultAction: 'Slow AGV fleet, sound transit alert, clear lane corridor', notifySmsEmail: false },
      { id: 'RULE-MFG-03', name: 'Station Dwell Exceeded (Takt Time Variance)', category: 'Operational', priorityThreshold: 'Medium', targetZone: 'Main Final Assembly Line (Stations 1-12)', slaMinutes: 12, defaultAction: 'Notify team leader of potential production bottleneck' }
    ],
    incidentCategories: [
      { category: 'Machine Enclosure Incursion', defaultSeverity: 'Critical', description: 'Personnel entered automated robotic cell or press envelope while active.', defaultInvestigationChecklist: ['Verify light curtain integrity', 'Check lockout-tagout log', 'Interview cell operator'] },
      { category: 'Forklift / Pedestrian Near-Miss', defaultSeverity: 'High', description: 'Proximity breach between material handling equipment and line operator.', defaultInvestigationChecklist: ['Inspect speed telemetry', 'Verify floor marking visibility'] },
      { category: 'Takt Time Bottleneck Deviation', defaultSeverity: 'Medium', description: 'Operator congestion causing multi-station production stop.', defaultInvestigationChecklist: ['Analyze station dwell logs', 'Review parts supply feed'] }
    ],
    complianceFramework: 'ISO 45001 / OSHA General Industry 1910 / Machine Safety ISO 13849',
    aiPersonaPrompt: 'You are an advanced Industrial IoT Production & Safety Intelligence AI for Manufacturing. Analyze operator flow, robotic cell interlocks, AGV transit lanes, and takt-time bottleneck telemetry.',
    terminology: {
      personnelSingular: 'Operator / Technician',
      personnelPlural: 'Line Operators',
      roleLabel: 'Workstation / Shift Assignment',
      idBadgeLabel: 'Operator RFID Badge',
      safetyComplianceLabel: 'Machine Safety & ESD Clearance',
      zoneLabel: 'Production Cell / Line',
      siteLabel: 'Manufacturing Plant',
      organizationType: 'Shift / Production Unit'
    }
  },

  office: {
    industry: 'office',
    subIndustry: 'Corporate Real Estate, Technology & Multi-Tenant Facilities',
    companyName: 'Apex Enterprise Tower HQ',
    facilityName: 'Corporate Headquarters Campus',
    trackedEntities: ['people', 'assets', 'visitors'],
    functionalAreas: [
      { id: 'fa-server-room', name: 'Data Center & Critical Server Room', code: 'DC-01', category: 'restricted', hazardLevel: 'critical', maxDwellMinutes: 60, requiredClearanceLevel: 'Level 3 IT Infrastructure' },
      { id: 'fa-exec-suite', name: 'Executive Suite & Boardroom', code: 'EXEC-BOARD', category: 'office', hazardLevel: 'warning', maxOccupancy: 25 },
      { id: 'fa-open-workspace', name: 'Open Collaboration Workspace (Floors 4-8)', code: 'OPEN-DESK', category: 'office', hazardLevel: 'normal', maxOccupancy: 200 },
      { id: 'fa-conf-rooms', name: 'Meeting & Conference Rooms', code: 'CONF-ALL', category: 'office', hazardLevel: 'normal', maxOccupancy: 16, maxDwellMinutes: 180 },
      { id: 'fa-cafeteria', name: 'Dining Commons & Town Hall', code: 'CAFE-01', category: 'common', hazardLevel: 'normal', maxOccupancy: 150 },
      { id: 'fa-reception', name: 'Main Lobby & Visitor Check-in Portal', code: 'LOBBY-01', category: 'common', hazardLevel: 'normal' }
    ],
    kpis: [
      { key: 'space_utilization', label: 'Peak Floor Space Utilization', unit: '%', target: 78, category: 'utilization', description: 'Percentage of workstation desks and collaboration zones occupied during peak hours.' },
      { key: 'room_ghost_rate', label: 'Conference Room Ghost Booking Rate', unit: '%', target: 5, category: 'efficiency', description: 'Booked conference rooms that had 0 actual badge entries.' },
      { key: 'after_hours_presence', label: 'After-Hours Building Occupancy', unit: 'people', target: 10, category: 'safety', description: 'Personnel remaining inside the facility after scheduled operating hours.' },
      { key: 'visitor_processing_time', label: 'Visitor Badge Portal Latency', unit: 'min', target: 2, category: 'efficiency', description: 'Average check-in to access-grant time at reception optical readers.' }
    ],
    alertRuleTemplates: [
      { id: 'RULE-OFF-01', name: 'Unauthorized Server Room Physical Access', category: 'Security', priorityThreshold: 'Critical', targetZone: 'Data Center & Critical Server Room', slaMinutes: 2, defaultAction: 'Alert campus physical security command, lock secondary biometric turnstile', notifySmsEmail: true },
      { id: 'RULE-OFF-02', name: 'After-Hours Unescorted Visitor Movement', category: 'Security', priorityThreshold: 'High', targetZone: 'Open Collaboration Workspace (Floors 4-8)', slaMinutes: 5, defaultAction: 'Dispatch floor security warden to verify host escort', notifySmsEmail: true },
      { id: 'RULE-OFF-03', name: 'Conference Room Capacity Exceeded', category: 'Safety', priorityThreshold: 'Low', targetZone: 'Meeting & Conference Rooms', slaMinutes: 20, defaultAction: 'Send automated Teams/Slack occupancy notification to meeting organizer' }
    ],
    incidentCategories: [
      { category: 'Restricted Facility Breach', defaultSeverity: 'Critical', description: 'Access badge read at restricted server room or executive wing without credentials.', defaultInvestigationChecklist: ['Review access badge log', 'Audit CCTV timestamp match', 'Deactivate compromised credential'] },
      { category: 'Overcapacity Building Alert', defaultSeverity: 'Medium', description: 'Floor population exceeded fire code occupancy limits.', defaultInvestigationChecklist: ['Direct occupants to adjacent lounges', 'Adjust HVAC airflow'] },
      { category: 'Unreturned Visitor Badge', defaultSeverity: 'Low', description: 'Visitor departed building perimeter without dropping badge in return drop-box.', defaultInvestigationChecklist: ['Cancel badge token', 'Send reminder notification'] }
    ],
    complianceFramework: 'ASHRAE 62.1 Indoor Air Quality / NFPA 101 Life Safety Code / ISO 27001 Physical Security',
    aiPersonaPrompt: 'You are a Corporate Real Estate & Facilities Intelligence AI. Analyze desk utilization, meeting room usage patterns, after-hours presence, and physical access security.',
    terminology: {
      personnelSingular: 'Employee / Resident',
      personnelPlural: 'Employees',
      roleLabel: 'Department / Team',
      idBadgeLabel: 'Corporate Access Badge',
      safetyComplianceLabel: 'Building Security Clearance',
      zoneLabel: 'Floor / Department Zone',
      siteLabel: 'Corporate Campus',
      organizationType: 'Business Unit / Tenant'
    }
  },

  logistics: {
    industry: 'logistics',
    subIndustry: 'Warehousing, Supply Chain & Distribution Hubs',
    companyName: 'Global Transit Logistics Hub',
    facilityName: 'Distribution Center 9',
    trackedEntities: ['people', 'assets', 'vehicles', 'equipment'],
    functionalAreas: [
      { id: 'fa-loading-dock', name: 'Cross-Dock Inbound/Outbound Bays (1-24)', code: 'DOCK-BAYS', category: 'logistics', hazardLevel: 'warning', maxDwellMinutes: 90 },
      { id: 'fa-high-bay', name: 'High-Bay Automated Racking Aisles', code: 'RACK-HIGH', category: 'storage', hazardLevel: 'warning', speedLimitKmh: 8 },
      { id: 'fa-cold-storage', name: 'Cold Chain Controlled Temperature Vault', code: 'COLD-VAULT', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 40, requiredClearanceLevel: 'Cold-Gear Certified Personnel' },
      { id: 'fa-forklift-charging', name: 'Forklift Battery Charging & Maintenance', code: 'CHARGE-BAY', category: 'hazardous', hazardLevel: 'warning', maxOccupancy: 6 },
      { id: 'fa-pack-ship', name: 'Sortation, Packing & Dispatch Line', code: 'PACK-LINE', category: 'production', hazardLevel: 'normal', maxOccupancy: 45 },
      { id: 'fa-truck-yard', name: 'External Truck Yard & Trailer Staging', code: 'YARD-EXT', category: 'logistics', hazardLevel: 'warning', speedLimitKmh: 15 }
    ],
    kpis: [
      { key: 'dock_turnaround_time', label: 'Average Dock Turnaround Dwell', unit: 'min', target: 45, category: 'efficiency', description: 'Average elapsed time freight trailers and material handlers spend at loading docks.' },
      { key: 'forklift_idle_time', label: 'MHE / Forklift Idle Rate', unit: '%', target: 12, category: 'utilization', description: 'Proportion of active shift hours material handling equipment is stationary.' },
      { key: 'cold_chain_dwell_breach', label: 'Cold Vault Operator Dwell Overstays', unit: 'events', target: 0, category: 'safety', description: 'Personnel exceeding cold temperature continuous exposure threshold.' },
      { key: 'pedestrian_corridor_breach', label: 'High-Bay Forklift Incursions', unit: 'events', target: 0, category: 'safety', description: 'Pedestrians walking inside active forklift aisles without high-vis tags.' }
    ],
    alertRuleTemplates: [
      { id: 'RULE-LOG-01', name: 'Cold Storage Exposure Overstay Alert', category: 'Safety', priorityThreshold: 'Critical', targetZone: 'Cold Chain Controlled Temperature Vault', slaMinutes: 3, defaultAction: 'Sound thermal vault exit alarm, dispatch shift lead for welfare check', triggerSiren: true, notifySmsEmail: true },
      { id: 'RULE-LOG-02', name: 'Pedestrian Detected in High-Bay Forklift Lane', category: 'Safety', priorityThreshold: 'High', targetZone: 'High-Bay Automated Racking Aisles', slaMinutes: 2, defaultAction: 'Alert forklift telemetry screens in quadrant, reduce aisle speed limits', notifySmsEmail: true },
      { id: 'RULE-LOG-03', name: 'Dock Bay Turnaround Stagnation (>90m)', category: 'Operational', priorityThreshold: 'Medium', targetZone: 'Cross-Dock Inbound/Outbound Bays (1-24)', slaMinutes: 15, defaultAction: 'Notify logistics dispatcher of dock congestion' }
    ],
    incidentCategories: [
      { category: 'Thermal Exposure Threshold Breach', defaultSeverity: 'Critical', description: 'Worker exceeded safe duration in sub-zero freezer vault.', defaultInvestigationChecklist: ['Verify thermal PPE condition', 'Conduct medical wellness check', 'Review door interlock logs'] },
      { category: 'Forklift Vehicle Conflict', defaultSeverity: 'High', description: 'Proximity violation between forklift and walking warehouse staff.', defaultInvestigationChecklist: ['Review reader telemetry timestamps', 'Inspect speed sensor data'] },
      { category: 'Dock Bay Collision / Driveaway', defaultSeverity: 'High', description: 'Trailer moved while dock plate or loader active.', defaultInvestigationChecklist: ['Inspect dock lock interlock', 'Audit driver sign-in time'] }
    ],
    complianceFramework: 'OSHA 1910.178 Powered Industrial Trucks / FDA FSMA Food Safety / ISO 28000 Supply Chain Security',
    aiPersonaPrompt: 'You are a Logistics & Supply Chain Telemetry Intelligence AI. Analyze material handler movements, dock turnaround bottlenecks, cold storage exposure limits, and forklift safety compliance.',
    terminology: {
      personnelSingular: 'Warehouse Associate',
      personnelPlural: 'Warehouse Associates',
      roleLabel: 'Operations Role / Shift',
      idBadgeLabel: 'Warehouse RFID Badge',
      safetyComplianceLabel: 'MHE & Safety Vest Compliance',
      zoneLabel: 'Warehouse Sector / Aisle',
      siteLabel: 'Distribution Center',
      organizationType: 'Logistics Team / 3PL Carrier'
    }
  },

  healthcare: {
    industry: 'healthcare',
    subIndustry: 'Hospitals, Acute Care & Clinical Health Networks',
    companyName: 'Metropolitan Health System',
    facilityName: 'Memorial Hospital & Trauma Center',
    trackedEntities: ['people', 'assets', 'visitors'],
    functionalAreas: [
      { id: 'fa-or', name: 'Operating Rooms & Surgical Suites', code: 'OR-SUITE', category: 'restricted', hazardLevel: 'critical', requiredClearanceLevel: 'Surgical Team' },
      { id: 'fa-icu', name: 'Intensive Care Unit (ICU)', code: 'ICU-WARD', category: 'hazardous', hazardLevel: 'warning', maxOccupancy: 20 },
      { id: 'fa-er', name: 'Emergency Department & Triage', code: 'ER-TRIAGE', category: 'production', hazardLevel: 'warning' },
      { id: 'fa-pharma', name: 'Inpatient Pharmacy & Narcotics Vault', code: 'PHARMA-VAULT', category: 'restricted', hazardLevel: 'critical', requiredClearanceLevel: 'Licensed Pharmacist' },
      { id: 'fa-pediatrics', name: 'Pediatric & Neonatal Ward', code: 'PEDI-01', category: 'restricted', hazardLevel: 'critical', requiredClearanceLevel: 'Pediatric Care Staff' },
      { id: 'fa-general', name: 'General Patient Wards & Corridors', code: 'WARD-GEN', category: 'common', hazardLevel: 'normal' }
    ],
    kpis: [
      { key: 'code_pink_infant_protection', label: 'Infant / Pediatric Perimeter Alerts', unit: 'events', target: 0, category: 'safety', description: 'Patient transponder detected crossing ward exit boundary.' },
      { key: 'nurse_to_patient_time', label: 'Direct Bedside Nurse Dwell Ratio', unit: '%', target: 65, category: 'efficiency', description: 'Proportion of nursing shift spent directly inside patient rooms.' },
      { key: 'pharmacy_vault_incursions', label: 'Uncredentialed Pharmacy Access', unit: 'events', target: 0, category: 'compliance', description: 'Unapproved personnel near restricted narcotics vault.' },
      { key: 'critical_asset_search_time', label: 'Infusion Pump / Crash Cart Locate Time', unit: 'sec', target: 30, category: 'efficiency', description: 'Average latency to locate nearest RFID-tagged emergency crash cart.' }
    ],
    alertRuleTemplates: [
      { id: 'RULE-HEALTH-01', name: 'Pediatric Ward Boundary Exit Alert', category: 'Security', priorityThreshold: 'Critical', targetZone: 'Pediatric & Neonatal Ward', slaMinutes: 1, defaultAction: 'Lock automatic ward doors, sound emergency chime, notify nursing desk', triggerSiren: true, notifySmsEmail: true },
      { id: 'RULE-HEALTH-02', name: 'Pharmacy Narcotics Vault Unauthorized Presence', category: 'Security', priorityThreshold: 'Critical', targetZone: 'Inpatient Pharmacy & Narcotics Vault', slaMinutes: 2, defaultAction: 'Alert hospital security, record reader audit log', notifySmsEmail: true },
      { id: 'RULE-HEALTH-03', name: 'Operating Room Asset Sterilization Stagnation', category: 'Compliance', priorityThreshold: 'Medium', targetZone: 'Operating Rooms & Surgical Suites', slaMinutes: 30, defaultAction: 'Notify sterile processing team of pending tray return' }
    ],
    incidentCategories: [
      { category: 'Patient Ward Boundary Alert', defaultSeverity: 'Critical', description: 'Monitored patient badge crossed ward safety portal.', defaultInvestigationChecklist: ['Verify patient bedside status', 'Inspect wristband signal strength'] },
      { category: 'Controlled Substance Access Variance', defaultSeverity: 'Critical', description: 'Access detected in medication vault outside pharmacy operating hours.', defaultInvestigationChecklist: ['Audit badge credential', 'Review pharmacy dispensing register'] },
      { category: 'Emergency Asset Depletion', defaultSeverity: 'High', description: 'Zero crash carts available within ED quadrant.', defaultInvestigationChecklist: ['Locate nearest staged cart', 'Review fleet re-distribution'] }
    ],
    complianceFramework: 'The Joint Commission (TJC) / HIPAA Physical Safeguards / CMS Hospital CoP',
    aiPersonaPrompt: 'You are a Healthcare Clinical Flow & Patient Safety Intelligence AI. Analyze clinical staff workflows, patient ward boundaries, crash cart asset availability, and sanitization protocols.',
    terminology: {
      personnelSingular: 'Clinician / Patient',
      personnelPlural: 'Clinical Staff & Patients',
      roleLabel: 'Clinical Specialty / Role',
      idBadgeLabel: 'RFID Wristband / Badge ID',
      safetyComplianceLabel: 'Sanitization & Bio-PPE Clearance',
      zoneLabel: 'Clinical Ward / Department',
      siteLabel: 'Hospital / Medical Center',
      organizationType: 'Clinical Unit / Department'
    }
  },

  mining: {
    industry: 'mining',
    subIndustry: 'Subsurface & Open-Pit Extraction Operations',
    companyName: 'Terran Minerals International',
    facilityName: 'Mine Site Complex Beta',
    trackedEntities: ['people', 'assets', 'vehicles', 'equipment'],
    functionalAreas: [
      { id: 'fa-shaft', name: 'Underground Extraction Shaft (Level -340m)', code: 'SHAFT-L3', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 360, requiredClearanceLevel: 'Underground Mining Certification' },
      { id: 'fa-blast', name: 'Scheduled Blast Exclusion Perimeter', code: 'BLAST-EXCL', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 0 },
      { id: 'fa-crusher', name: 'Primary Gyratory Crusher & Conveyor', code: 'CRUSH-01', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 45 },
      { id: 'fa-refuge', name: 'Underground Emergency Refuge Chamber', code: 'REFUGE-CHAMBER', category: 'safety', hazardLevel: 'normal' },
      { id: 'fa-haul-road', name: 'Autonomous Haul Truck Transit Road', code: 'HAUL-ROAD', category: 'logistics', hazardLevel: 'critical', speedLimitKmh: 45 }
    ],
    kpis: [
      { key: 'blast_clearance', label: 'Pre-Blast Zone Clearance', unit: '%', target: 100, category: 'safety', description: 'Verification that 100% of personnel and light vehicles have evacuated blast radius.' },
      { key: 'underground_headcount', label: 'Shaft Real-Time Headcount Match', unit: '%', target: 100, category: 'compliance', description: 'Discrepancy between brass board and automated RFID shaft portal telemetry.' },
      { key: 'refuge_chamber_readiness', label: 'Refuge Station Reachability', unit: 'min', target: 5, category: 'safety', description: 'Maximum travel time from active stope to nearest monitored refuge station.' },
      { key: 'heavy_hauler_proximity', label: 'Light Vehicle / Hauler Proximity Alerts', unit: 'events', target: 0, category: 'safety', description: 'Proximity alarms triggered between surface pickup trucks and 400t haul trucks.' }
    ],
    alertRuleTemplates: [
      { id: 'RULE-MINE-01', name: 'Active Blast Perimeter Incursion', category: 'Safety', priorityThreshold: 'Critical', targetZone: 'Scheduled Blast Exclusion Perimeter', slaMinutes: 1, defaultAction: 'Halt blast countdown, sound surface siren, notify blasting engineer', triggerSiren: true, notifySmsEmail: true },
      { id: 'RULE-MINE-02', name: 'Underground Stagnation (Lone Miner Welfare)', category: 'Safety', priorityThreshold: 'Critical', targetZone: 'Underground Extraction Shaft (Level -340m)', slaMinutes: 15, defaultAction: 'Dispatch shift supervisor to last known beacon portal', triggerSiren: false, notifySmsEmail: true },
      { id: 'RULE-MINE-03', name: 'Haul Truck Road Pedestrian Breach', category: 'Safety', priorityThreshold: 'Critical', targetZone: 'Autonomous Haul Truck Transit Road', slaMinutes: 2, defaultAction: 'Transmit emergency stop signal to autonomous hauler fleet', triggerSiren: true, notifySmsEmail: true }
    ],
    incidentCategories: [
      { category: 'Blast Exclusion Breach', defaultSeverity: 'Critical', description: 'Transponder recorded inside blast boundary during firing window.', defaultInvestigationChecklist: ['Verify firing circuit lock status', 'Audit muster logs', 'Interview blast foreman'] },
      { category: 'Shaft Evacuation Delay', defaultSeverity: 'Critical', description: 'Miner unaccounted for during shift change or ventilation drill.', defaultInvestigationChecklist: ['Check refuge chamber RFID logs', 'Review telemetry trail'] },
      { category: 'Haul Road Conflict', defaultSeverity: 'High', description: 'Light vehicle entered haul road without radio clearance.', defaultInvestigationChecklist: ['Inspect vehicle transponder beacon', 'Check dispatch logs'] }
    ],
    complianceFramework: 'MSHA 30 CFR Part 75 Underground Coal / Part 57 Metal & Nonmetal Safety Standards',
    aiPersonaPrompt: 'You are a Mining Safety & Autonomous Extraction Telemetry Intelligence AI. Analyze shaft headcount telemetry, blast evacuation compliance, underground refuge chamber readiness, and hauler proximity.',
    terminology: {
      personnelSingular: 'Miner / Technician',
      personnelPlural: 'Miners',
      roleLabel: 'Mining Duty / Trade',
      idBadgeLabel: 'Cap-Lamp Transponder EPC',
      safetyComplianceLabel: 'Underground Mine Safety Pass',
      zoneLabel: 'Shaft / Stope Section',
      siteLabel: 'Mine Site Complex',
      organizationType: 'Mining Crew / Contractor'
    }
  },

  oil_gas: {
    industry: 'oil_gas',
    subIndustry: 'Offshore Platforms, Refineries & LNG Processing',
    companyName: 'Equator Energy Offshore',
    facilityName: 'Offshore Production Platform Alpha',
    trackedEntities: ['people', 'assets', 'vehicles', 'equipment', 'visitors'],
    functionalAreas: [
      { id: 'fa-drilling-floor', name: 'Drill Floor & Wellhead Cell', code: 'DRILL-CELL', category: 'hazardous', hazardLevel: 'critical', requiredClearanceLevel: 'Drilling Specialist' },
      { id: 'fa-flare', name: 'Flare Knockout & Hydrocarbon Processing', code: 'FLARE-KNOCK', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 60 },
      { id: 'fa-lifeboat', name: 'Emergency Evacuation Lifeboat Stations (1-4)', code: 'LIFEBOAT-STN', category: 'safety', hazardLevel: 'normal' },
      { id: 'fa-helideck', name: 'Helideck Landing & Refueling Area', code: 'HELI-01', category: 'logistics', hazardLevel: 'warning', maxDwellMinutes: 30 },
      { id: 'fa-living-quarters', name: 'Platform Living Quarters & Mess Hall', code: 'LQ-MAIN', category: 'common', hazardLevel: 'normal' }
    ],
    kpis: [
      { key: 'pob_reconciliation', label: 'Personnel On Board (POB) Match', unit: '%', target: 100, category: 'safety', description: 'Continuous match between flight manifest and live RFID POB count.' },
      { key: 'lifeboat_muster_time', label: 'Lifeboat Muster Completion Time', unit: 'min', target: 4, category: 'safety', description: 'Time required to account for 100% of POB at designated primary lifeboat stations.' },
      { key: 'hot_work_permit_compliance', label: 'Hot Work Zone Clearance', unit: '%', target: 100, category: 'compliance', description: 'Percentage of personnel in process units with active gas-tested permits.' },
      { key: 'toxic_gas_shelter_reach', label: 'TR (Temporary Refuge) Access Latency', unit: 'sec', target: 90, category: 'safety', description: 'Maximum transit time from process units to sealed toxic gas refuge.' }
    ],
    alertRuleTemplates: [
      { id: 'RULE-OG-01', name: 'Uncredentialed Wellhead Process Entry', category: 'Safety', priorityThreshold: 'Critical', targetZone: 'Drill Floor & Wellhead Cell', slaMinutes: 1, defaultAction: 'Alert OIM (Offshore Installation Manager), initiate acoustic beacon', triggerSiren: true, notifySmsEmail: true },
      { id: 'RULE-OG-02', name: 'Lifeboat Muster Station Discrepancy', category: 'Safety', priorityThreshold: 'Critical', targetZone: 'Emergency Evacuation Lifeboat Stations (1-4)', slaMinutes: 3, defaultAction: 'Broadcast PA alert, dispatch search and rescue squad', triggerSiren: true, notifySmsEmail: true },
      { id: 'RULE-OG-03', name: 'Helideck Incursion During Flight Window', category: 'Safety', priorityThreshold: 'High', targetZone: 'Helideck Landing & Refueling Area', slaMinutes: 2, defaultAction: 'Wave off approaching helicopter, clear helideck deck crew', notifySmsEmail: true }
    ],
    incidentCategories: [
      { category: 'POB Discrepancy Alert', defaultSeverity: 'Critical', description: 'Mismatch between manifested personnel and RFID tag verification.', defaultInvestigationChecklist: ['Audit helideck boarding log', 'Initiate emergency headcount'] },
      { category: 'Process Unit Boundary Breach', defaultSeverity: 'Critical', description: 'Worker detected in high-pressure hydrocarbon sector without permit.', defaultInvestigationChecklist: ['Verify permit to work (PTW)', 'Review gas monitor log'] },
      { category: 'Hot Work Exclusion Near-Miss', defaultSeverity: 'High', description: 'Sparks or equipment present near live gas line.', defaultInvestigationChecklist: ['Inspect gas test certificate', 'Audit fire watch presence'] }
    ],
    complianceFramework: 'API RP 75 Offshore Safety / BSEE 30 CFR 250 / ISO 17776 Petroleum Risk Assessment',
    aiPersonaPrompt: 'You are an Offshore Oil & Gas EHS & Platform Operations AI. Analyze Personnel-On-Board (POB) counts, lifeboat muster drills, wellhead safety boundaries, and hazardous process zones.',
    terminology: {
      personnelSingular: 'Crew Member / Specialist',
      personnelPlural: 'Platform Crew',
      roleLabel: 'Discipline / Duty Station',
      idBadgeLabel: 'ATEX Zone 0 RFID Tag',
      safetyComplianceLabel: 'Offshore Survival & PTW Clearance',
      zoneLabel: 'Platform Module / Deck',
      siteLabel: 'Offshore Facility / Rig',
      organizationType: 'Operating Company / Contractor'
    }
  },

  aviation: {
    industry: 'aviation',
    subIndustry: 'Commercial Airports, Airside Operations & MRO Hangars',
    companyName: 'International Airport Authority',
    facilityName: 'Terminal 2 & Airside Apron',
    trackedEntities: ['people', 'assets', 'vehicles', 'equipment'],
    functionalAreas: [
      { id: 'fa-active-runway', name: 'Active Runway & Taxiway Safety Envelope', code: 'RUNWAY-01', category: 'hazardous', hazardLevel: 'critical', maxDwellMinutes: 0, requiredClearanceLevel: 'Airfield Operations Vehicle Permit' },
      { id: 'fa-apron', name: 'Aircraft Parking Stand & Ground Handling Apron', code: 'APRON-STANDS', category: 'logistics', hazardLevel: 'warning', speedLimitKmh: 25 },
      { id: 'fa-baggage-belly', name: 'Baggage Make-up & Sorting Vault', code: 'BAG-VAULT', category: 'storage', hazardLevel: 'normal', maxOccupancy: 40 },
      { id: 'fa-hangar', name: 'Heavy Maintenance Hangar Bay', code: 'HANGAR-01', category: 'production', hazardLevel: 'warning', maxOccupancy: 30 },
      { id: 'fa-customs-sterile', name: 'Sterile International Border Security Area', code: 'STERILE-BORDER', category: 'restricted', hazardLevel: 'critical', requiredClearanceLevel: 'Customs & Border Protection Pass' }
    ],
    kpis: [
      { key: 'runway_incursions', label: 'Runway & Taxiway Incursions', unit: 'events', target: 0, category: 'safety', description: 'Unauthorized ground vehicle or personnel crossing runway hold line.' },
      { key: 'aircraft_turn_time', label: 'Aircraft Ground Turnaround Latency', unit: 'min', target: 35, category: 'efficiency', description: 'Elapsed time from chocks-on to pushback across ground handling crews.' },
      { key: 'airside_speeding_events', label: 'Apron Ground Vehicle Speed Violations', unit: 'events', target: 0, category: 'safety', description: 'Tugs or belt loaders exceeding the 25 km/h airside speed limit.' },
      { key: 'sterile_perimeter_breaches', label: 'Sterile Transit Boundary Incursions', unit: 'events', target: 0, category: 'compliance', description: 'Ground staff crossing from non-sterile to sterile international transit zones.' }
    ],
    alertRuleTemplates: [
      { id: 'RULE-AV-01', name: 'Runway Hold Line Incursion Alert', category: 'Safety', priorityThreshold: 'Critical', targetZone: 'Active Runway & Taxiway Safety Envelope', slaMinutes: 1, defaultAction: 'Flash red runway status lights, alert Air Traffic Control tower', triggerSiren: true, notifySmsEmail: true },
      { id: 'RULE-AV-02', name: 'Apron Ground Vehicle Collision Risk', category: 'Safety', priorityThreshold: 'High', targetZone: 'Aircraft Parking Stand & Ground Handling Apron', slaMinutes: 2, defaultAction: 'Alert vehicle telematics, dispatch airside safety marshal', notifySmsEmail: true },
      { id: 'RULE-AV-03', name: 'Sterile Boundary Uncredentialed Crossing', category: 'Security', priorityThreshold: 'Critical', targetZone: 'Sterile International Border Security Area', slaMinutes: 2, defaultAction: 'Alert airport police, lock transit turnstiles', notifySmsEmail: true }
    ],
    incidentCategories: [
      { category: 'Runway Safety Incursion', defaultSeverity: 'Critical', description: 'Vehicle or personnel entered active runway strip without ATC clearance.', defaultInvestigationChecklist: ['Review ATC radio transcript', 'Inspect vehicle GPS/RFID track', 'Test stop bar lights'] },
      { category: 'Aircraft Ground Damage Near-Miss', defaultSeverity: 'High', description: 'Ground service equipment positioned within 1.5m of aircraft skin.', defaultInvestigationChecklist: ['Inspect aircraft fuselage', 'Review tug telemetry log'] },
      { category: 'Airside Security Bypass', defaultSeverity: 'Critical', description: 'Worker bypassed TSA/border checkpoint into sterile concourse.', defaultInvestigationChecklist: ['Audit SIDA badge token', 'Review portal turnstile log'] }
    ],
    complianceFramework: 'FAA Part 139 Airport Certification / ICAO Annex 14 Aerodromes / TSA Part 1542 Airport Security',
    aiPersonaPrompt: 'You are an Airside Airport Operations & Flight Turnaround Intelligence AI. Analyze apron ground handling efficiency, runway safety buffer compliance, and airside vehicle telemetry.',
    terminology: {
      personnelSingular: 'Airside Staff / Handler',
      personnelPlural: 'Ground Handling Crews',
      roleLabel: 'Ground Service Specialty',
      idBadgeLabel: 'SIDA RFID Security Badge',
      safetyComplianceLabel: 'Airside Driver & Security Pass',
      zoneLabel: 'Apron Stand / Terminal Sector',
      siteLabel: 'Airport Terminal & Airfield',
      organizationType: 'Airline / Ground Handler'
    }
  },

  custom: {
    industry: 'custom',
    subIndustry: 'Custom Enterprise & Multi-Facility Operations',
    companyName: 'Custom Enterprise Organization',
    facilityName: 'Primary Operational Facility',
    trackedEntities: ['people', 'assets', 'vehicles', 'equipment', 'visitors'],
    functionalAreas: [
      { id: 'fa-critical-1', name: 'High-Security Operational Zone', code: 'CRIT-01', category: 'restricted', hazardLevel: 'critical', maxOccupancy: 10, maxDwellMinutes: 60 },
      { id: 'fa-ops-1', name: 'General Operations Floor', code: 'OPS-01', category: 'production', hazardLevel: 'normal', maxOccupancy: 100 },
      { id: 'fa-logistics-1', name: 'Loading & Logistics Bay', code: 'LOG-01', category: 'logistics', hazardLevel: 'warning' },
      { id: 'fa-admin-1', name: 'Administrative & Staff Lounge', code: 'ADMIN-01', category: 'office', hazardLevel: 'normal', maxOccupancy: 50 }
    ],
    kpis: [
      { key: 'facility_utilization', label: 'Overall Facility Space Utilization', unit: '%', target: 80, category: 'utilization', description: 'Percentage of functional areas occupied by authorized personnel.' },
      { key: 'restricted_perimeter_alerts', label: 'Restricted Area Incursions', unit: 'events', target: 0, category: 'safety', description: 'Unauthorized detections in restricted functional areas.' },
      { key: 'telemetry_coverage_rate', label: 'Active Hardware Reader Health', unit: '%', target: 99, category: 'compliance', description: 'Percentage of RFID and telemetry hardware gateways operating normally.' }
    ],
    alertRuleTemplates: [
      { id: 'RULE-CUST-01', name: 'Restricted Zone Unauthorized Access', category: 'Security', priorityThreshold: 'Critical', targetZone: 'High-Security Operational Zone', slaMinutes: 3, defaultAction: 'Alert operations manager, dispatch floor security', triggerSiren: true, notifySmsEmail: true },
      { id: 'RULE-CUST-02', name: 'Extended Dwell Duration Warning', category: 'Operational', priorityThreshold: 'Medium', targetZone: 'General Operations Floor', slaMinutes: 30, defaultAction: 'Log dwell audit, conduct welfare check' }
    ],
    incidentCategories: [
      { category: 'Unauthorized Area Incursion', defaultSeverity: 'Critical', description: 'Entity detected in restricted zone without valid clearance credentials.', defaultInvestigationChecklist: ['Audit badge credential', 'Review camera footage'] },
      { category: 'Operational Stagnation', defaultSeverity: 'Medium', description: 'Entity dwell exceeded maximum permitted duration.', defaultInvestigationChecklist: ['Check operator welfare', 'Review task assignment'] }
    ],
    complianceFramework: 'ISO 9001 / ISO 45001 Enterprise Operational Standards',
    aiPersonaPrompt: 'You are a Versatile B2B Enterprise Telemetry & Operations Intelligence AI. Analyze real-time RFID scans, zone dwell times, and operational patterns across the facility.',
    terminology: {
      personnelSingular: 'Personnel',
      personnelPlural: 'Personnel',
      roleLabel: 'Role / Designation',
      idBadgeLabel: 'RFID Tag / Badge ID',
      safetyComplianceLabel: 'Access & Safety Clearance',
      zoneLabel: 'Operational Zone',
      siteLabel: 'Facility Complex',
      organizationType: 'Department / Organization'
    }
  }
};
