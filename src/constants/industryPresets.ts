/**
 * Industry configuration types for People Tracking in Construction.
 * Only the construction preset is active. Other industry types have been removed.
 * Custom industry configurations are stored in MongoDB and loaded via the Settings page.
 */

export interface IndustryTerminology {
  personnelSingular: string;
  personnelPlural: string;
  roleLabel: string;
  idBadgeLabel: string;
  safetyComplianceLabel: string;
  zoneLabel: string;
  siteLabel: string;
  organizationType: string;
}

export interface IndustryConfig {
  industryId: 'construction' | 'healthcare' | 'mining' | 'manufacturing' | 'logistics' | 'corporate' | 'aviation' | 'oil_gas' | 'custom';
  industryName: string;
  subIndustry?: string;
  appTitle: string;
  appSubtitle: string;
  primarySiteName: string;
  terminology: IndustryTerminology;
  defaultRoles: string[];
  defaultDepartments: string[];
  defaultZones: Array<{ id: string; name: string; category: string; hazardLevel: 'normal' | 'warning' | 'critical' }>;
  defaultAlertCategories: string[];
  complianceFramework: string;
  aiPersonaPrompt: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Construction industry baseline configuration.
 * Roles, departments, zones, and alert categories are populated from MongoDB.
 * This serves as a fallback when no saved configuration is found.
 */
const CONSTRUCTION_PRESET: IndustryConfig = {
  industryId: 'construction',
  industryName: 'Construction & Heavy Infrastructure',
  subIndustry: 'Commercial & Civil Construction',
  appTitle: 'People Tracking in Construction',
  appSubtitle: 'Real-Time RFID Personnel & Workforce Safety Telemetry',
  primarySiteName: 'Active Construction Site',
  terminology: {
    personnelSingular: 'Worker',
    personnelPlural: 'Workers',
    roleLabel: 'Trade / Specialty',
    idBadgeLabel: 'Hardhat Tag ID',
    safetyComplianceLabel: 'PPE Compliance (Hardhat/Vest)',
    zoneLabel: 'Construction Zone',
    siteLabel: 'Job Site',
    organizationType: 'Subcontractor / Trade Firm'
  },
  defaultRoles: [
    'Site Superintendent',
    'Safety Inspector',
    'Structural Welder',
    'Journeyman Electrician',
    'HVAC Technician',
    'Scaffold Builder',
    'Tower Crane Operator',
    'Excavation Foreman',
    'Lead Carpenter',
    'Ironworker'
  ],
  defaultDepartments: [
    'Structural Works',
    'Electrical & Mechanical',
    'Safety & Compliance',
    'Site Administration',
    'Civil & Earthworks'
  ],
  defaultZones: [
    { id: 'zone_main_entrance', name: 'Main Site Entrance & Security Gate', category: 'Access Point', hazardLevel: 'normal' },
    { id: 'zone_active_work', name: 'Active Work Area', category: 'Active Work', hazardLevel: 'warning' },
    { id: 'zone_equipment_area', name: 'Heavy Equipment & Machinery Area', category: 'Machinery', hazardLevel: 'critical' },
    { id: 'zone_site_office', name: 'Site Office & Welfare Units', category: 'Administrative', hazardLevel: 'normal' },
    { id: 'zone_material_storage', name: 'Material Storage & Staging', category: 'Logistics', hazardLevel: 'normal' },
    { id: 'zone_assembly_point', name: 'Emergency Muster / Assembly Point', category: 'Safety', hazardLevel: 'normal' }
  ],
  defaultAlertCategories: [
    'Exclusion Zone Breach',
    'PPE Non-Compliance',
    'Fall Hazard Alert',
    'Equipment Proximity Alarm',
    'Lone Worker Stagnation',
    'Unregistered Tag Detected'
  ],
  complianceFramework: 'OSHA 1926 Safety & Health Regulations for Construction',
  aiPersonaPrompt: 'You are an elite EHS Director and Industrial IoT Safety AI Copilot for Construction & Heavy Engineering. Analyze RFID hardhat scans, zone dwell times, equipment hazards, and subcontractor workforce flow.'
};

/**
 * INDUSTRY_PRESETS — only the active industry (construction) is included.
 * Additional industry configurations can be added via Settings > Industry Configuration
 * and are persisted to MongoDB under the organization's profile.
 */
export const INDUSTRY_PRESETS: Record<string, IndustryConfig> = {
  construction: CONSTRUCTION_PRESET
};
