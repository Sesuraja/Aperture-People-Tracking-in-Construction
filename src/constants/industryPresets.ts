export interface IndustryTerminology {
  personnelSingular: string; // e.g. "Worker", "Staff", "Doctor/Nurse", "Miner", "Employee"
  personnelPlural: string; // e.g. "Workers", "Staff Members", "Clinical Staff", "Miners", "Employees"
  roleLabel: string; // e.g. "Trade / Specialty", "Department / Role", "Mining Duty", "Designation"
  idBadgeLabel: string; // e.g. "Hardhat Tag ID", "Badge Tag ID", "Transponder EPC", "Wristband ID"
  safetyComplianceLabel: string; // e.g. "PPE Status", "Sanitization & Bio-PPE", "Mine Safety Gear", "Security Clearance"
  zoneLabel: string; // e.g. "Work Zone", "Department / Ward", "Shaft / Section", "Facility Area"
  siteLabel: string; // e.g. "Job Site", "Hospital / Campus", "Mine Site", "Facility"
  organizationType: string; // e.g. "Contractor / Company", "Clinic / Division", "Operational Team", "Department"
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

export const INDUSTRY_PRESETS: Record<string, IndustryConfig> = {
  construction: {
    industryId: 'construction',
    industryName: 'Construction & Heavy Infrastructure',
    subIndustry: 'Commercial & High-Rise Construction',
    appTitle: 'Aperture People Tracking',
    appSubtitle: 'Industrial RFID Personnel & Workforce Safety Telemetry',
    primarySiteName: 'Tower 1 - Metro Commercial Build',
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
      'Structural Welder',
      'Tower Crane Operator',
      'Journeyman Electrician',
      'Lead Carpenter',
      'Scaffold Builder',
      'Safety Inspector',
      'Excavation Foreman',
      'HVAC Technician',
      'Ironworker',
      'Site Superintendent'
    ],
    defaultDepartments: [
      'Apex Construction JV',
      'Vance Structural Steel',
      'Metro Electric Co.',
      'Precision Mechanical',
      'Safety Compliance Team'
    ],
    defaultZones: [
      { id: 'zone_material_storage', name: 'Material Storage & Staging', category: 'Logistics', hazardLevel: 'normal' },
      { id: 'zone_structure_work', name: 'Structure Work Area (L1-L4)', category: 'Active Work', hazardLevel: 'warning' },
      { id: 'zone_crane_operating', name: 'Crane Operating & Swing Perimeter', category: 'Restricted', hazardLevel: 'critical' },
      { id: 'zone_site_office', name: 'Site Office & Welfare Units', category: 'Administrative', hazardLevel: 'normal' },
      { id: 'zone_open_work', name: 'Open Work Area & Laydown', category: 'Active Work', hazardLevel: 'normal' },
      { id: 'zone_equipment_parking', name: 'Heavy Equipment Parking', category: 'Machinery', hazardLevel: 'warning' },
      { id: 'zone_excavation_pit', name: 'Excavation & Foundation Pit', category: 'High Hazard', hazardLevel: 'critical' },
      { id: 'zone_assembly_point', name: 'Emergency Muster / Assembly Point', category: 'Safety', hazardLevel: 'normal' },
      { id: 'zone_high_voltage', name: 'High Voltage Transformer Zone', category: 'Restricted', hazardLevel: 'critical' }
    ],
    defaultAlertCategories: [
      'Exclusion Zone Breach',
      'PPE Non-Compliance',
      'Fall Hazard Alert',
      'Crane Proximity Alarm',
      'Lone Worker Stagnation',
      'Unregistered Tag Detected'
    ],
    complianceFramework: 'OSHA 1926 Safety & Health Regulations for Construction',
    aiPersonaPrompt: 'You are an elite Lead EHS Director and Industrial IoT Safety AI Copilot for Construction & Heavy Engineering. Analyze RFID hardhat scans, zone dwell times, crane hazards, and subcontractor workforce flow.'
  },

  healthcare: {
    industryId: 'healthcare',
    industryName: 'Healthcare, Hospitals & Clinical Facilities',
    subIndustry: 'Inpatient Care & Surgical Centers',
    appTitle: 'Aperture Clinical Flow & People Tracking',
    appSubtitle: 'Real-Time Patient, Surgeon, Nurse & Medical Asset Telemetry',
    primarySiteName: 'Metro General Hospital & Trauma Center',
    terminology: {
      personnelSingular: 'Medical Staff / Patient',
      personnelPlural: 'Clinical Staff & Patients',
      roleLabel: 'Department / Clinical Specialty',
      idBadgeLabel: 'RFID Wristband / Badge ID',
      safetyComplianceLabel: 'Sanitization & Biohazard PPE',
      zoneLabel: 'Ward / Clinical Zone',
      siteLabel: 'Hospital Campus',
      organizationType: 'Department / Practice Group'
    },
    defaultRoles: [
      'Attending Physician',
      'Trauma Surgeon',
      'ICU Registered Nurse',
      'Anesthesiologist',
      'Radiology Technician',
      'Inpatient / Patient',
      'Emergency Resident',
      'Pharmacist',
      'Biomedical Engineer',
      'Hospital Administrator'
    ],
    defaultDepartments: [
      'Emergency & Trauma',
      'Cardiology & Surgery',
      'Intensive Care Unit (ICU)',
      'Radiology & Diagnostics',
      'Pediatrics Wing'
    ],
    defaultZones: [
      { id: 'zone_emergency_triage', name: 'Emergency Room & Triage', category: 'Emergency', hazardLevel: 'warning' },
      { id: 'zone_operating_theater', name: 'Surgical Operating Theaters (OR 1-4)', category: 'Sterile Restricted', hazardLevel: 'critical' },
      { id: 'zone_icu_ward', name: 'Intensive Care Unit (ICU)', category: 'High Dependency', hazardLevel: 'warning' },
      { id: 'zone_inpatient_wing', name: 'Inpatient Recovery Ward', category: 'General Ward', hazardLevel: 'normal' },
      { id: 'zone_radiology', name: 'MRI & Radiation Diagnostics Zone', category: 'Restricted Radiation', hazardLevel: 'critical' },
      { id: 'zone_pharmacy', name: 'Central Pharmacy & Narcotics Vault', category: 'Secure Storage', hazardLevel: 'critical' },
      { id: 'zone_staff_lounge', name: 'Physician & Nursing Station', category: 'Staff Area', hazardLevel: 'normal' },
      { id: 'zone_assembly_point', name: 'Hospital Evacuation Muster Area', category: 'Safety', hazardLevel: 'normal' },
      { id: 'zone_pediatric_lockdown', name: 'Pediatric & Neonatal Secure Ward', category: 'Secured Perimeter', hazardLevel: 'warning' }
    ],
    defaultAlertCategories: [
      'Patient Wandering / Elopement Alert',
      'Sterile Zone Contamination Breach',
      'Code Blue / Emergency Response',
      'Staff Duress / Panic Beacon',
      'Radiation Suite Unauthorized Entry',
      'Medication Vault Breach'
    ],
    complianceFramework: 'HIPAA, JCAHO & Hospital Patient Safety Standards',
    aiPersonaPrompt: 'You are an advanced Hospital Operations and Clinical Patient Safety AI Copilot. Analyze real-time RFID badges, patient transit times, surgeon dwell in ORs, and sterile boundary compliance.'
  },

  mining: {
    industryId: 'mining',
    industryName: 'Mining, Tunnels & Underground Extraction',
    subIndustry: 'Deep Underground & Hard Rock Mining',
    appTitle: 'Aperture Underground Personnel Tracking',
    appSubtitle: 'Deep Shaft Telemetry, Lone Worker Safety & Gas Hazard Monitoring',
    primarySiteName: 'Apex Silver-Lead Deep Mine (Shaft 4)',
    terminology: {
      personnelSingular: 'Miner',
      personnelPlural: 'Miners & Crew',
      roleLabel: 'Mining Crew / Specialty',
      idBadgeLabel: 'Lamp Tag / Sub-GHz Beacon ID',
      safetyComplianceLabel: 'Respirator & Cap Lamp Telemetry',
      zoneLabel: 'Shaft / Tunnel Section',
      siteLabel: 'Mine Site & Pit',
      organizationType: 'Extraction Crew / Contractor'
    },
    defaultRoles: [
      'Continuous Miner Operator',
      'Blaster / Explosives Specialist',
      'Roof Bolter',
      'Ventilation Engineer',
      'Underground Shift Boss',
      'Geotechnical Surveyor',
      'Heavy Haulage Driver',
      'Safety & Mine Rescue Lead',
      'Shaft Inspector',
      'Crusher Plant Operator'
    ],
    defaultDepartments: [
      'Underground Extraction Div.',
      'Surface Operations & Mill',
      'Mine Safety & Rescue',
      'Geology & Drilling Services',
      'Ventilation & Dewatering'
    ],
    defaultZones: [
      { id: 'zone_surface_portal', name: 'Surface Portal & Lamp Room', category: 'Entry/Exit', hazardLevel: 'normal' },
      { id: 'zone_shaft_vertical', name: 'Shaft #4 Vertical Hoistway', category: 'Transit', hazardLevel: 'warning' },
      { id: 'zone_blasting_face', name: 'Active Blasting Face (Level -450m)', category: 'Extreme Hazard', hazardLevel: 'critical' },
      { id: 'zone_haulage_drift', name: 'Sub-Level Haulage Drift & Rails', category: 'Heavy Traffic', hazardLevel: 'warning' },
      { id: 'zone_crusher_chamber', name: 'Underground Primary Crusher', category: 'Industrial Machinery', hazardLevel: 'critical' },
      { id: 'zone_refuge_station', name: 'Pressurized Refuge Chamber #2', category: 'Emergency Safe Zone', hazardLevel: 'normal' },
      { id: 'zone_ventilation_shaft', name: 'Primary Ventilation Return Shaft', category: 'Airway / Gas Risk', hazardLevel: 'critical' },
      { id: 'zone_assembly_point', name: 'Surface Evacuation Muster Hub', category: 'Safety', hazardLevel: 'normal' },
      { id: 'zone_explosives_magazine', name: 'Underground Explosives Magazine', category: 'Secured High Explosives', hazardLevel: 'critical' }
    ],
    defaultAlertCategories: [
      'Blasting Exclusion Zone Violation',
      'Lone Worker Inactivity Alert',
      'Toxic Gas / Low Oxygen Excursion',
      'Unaccounted Miner at Shift Close',
      'Refuge Chamber Entry Triggered',
      'Man-Down Fall Detection'
    ],
    complianceFramework: 'MSHA (Mine Safety and Health Administration) 30 CFR',
    aiPersonaPrompt: 'You are an elite Mine Safety & Underground Personnel Telemetry AI Copilot. Monitor real-time cap-lamp RFID tags, toxic air indices, blasting clearance protocols, and underground muster counts.'
  },

  manufacturing: {
    industryId: 'manufacturing',
    industryName: 'Manufacturing, Assembly Plants & Factories',
    subIndustry: 'Automotive & Precision Discrete Assembly',
    appTitle: 'Aperture Industrial Plant People Tracking',
    appSubtitle: 'Robotics Cell Safety, Operator Floor Tracking & Line Efficiency',
    primarySiteName: 'Advanced Automotive Assembly Facility (Plant 3)',
    terminology: {
      personnelSingular: 'Operator / Technician',
      personnelPlural: 'Plant Floor Workforce',
      roleLabel: 'Station / Line Assignment',
      idBadgeLabel: 'RFID Smart Badge ID',
      safetyComplianceLabel: 'Safety Glasses & Steel-Toe Boots',
      zoneLabel: 'Plant Line / Production Cell',
      siteLabel: 'Manufacturing Facility',
      organizationType: 'Production Team / Shift'
    },
    defaultRoles: [
      'Robotics Cell Operator',
      'CNC Machining Specialist',
      'Quality Assurance Inspector',
      'Maintenance Millwright',
      'Paint Shop Specialist',
      'Stamping Press Operator',
      'Forklift Operator',
      'Line Supervisor',
      'Process Engineer',
      'EHS Plant Specialist'
    ],
    defaultDepartments: [
      'Body & Stamping Line',
      'Paint & Surface Treatment',
      'Final Assembly & Powertrain',
      'Plant Maintenance Team',
      'Quality & Metrology'
    ],
    defaultZones: [
      { id: 'zone_receiving_dock', name: 'Raw Materials Receiving Dock', category: 'Logistics', hazardLevel: 'normal' },
      { id: 'zone_stamping_press', name: 'High-Tonnage Stamping Press Line', category: 'Heavy Impact', hazardLevel: 'critical' },
      { id: 'zone_robotic_welding', name: 'Automated Robotic Welding Cell', category: 'Automated Cell', hazardLevel: 'critical' },
      { id: 'zone_paint_booth', name: 'Electrostatic Paint & Cure Oven', category: 'Chemical / Heat', hazardLevel: 'warning' },
      { id: 'zone_assembly_line', name: 'Final Assembly Conveyor (Stations 1-20)', category: 'Active Assembly', hazardLevel: 'normal' },
      { id: 'zone_quality_metrology', name: 'End-of-Line Quality Inspection', category: 'Testing', hazardLevel: 'normal' },
      { id: 'zone_battery_pack', name: 'High-Voltage Battery Enclosure', category: 'Electrical Hazard', hazardLevel: 'critical' },
      { id: 'zone_assembly_point', name: 'Factory Yard Muster Point A', category: 'Safety', hazardLevel: 'normal' },
      { id: 'zone_break_room', name: 'Plant Cafeteria & Training Center', category: 'Staff Welfare', hazardLevel: 'normal' }
    ],
    defaultAlertCategories: [
      'Robot Cell Light-Curtain Breach',
      'Over-Dwell in Ergonomic Strain Zone',
      'Forklift-Pedestrian Collision Risk',
      'High-Voltage Bay Unauthorized Entry',
      'Line-Stoppage Operator Absenteeism',
      'Lockout/Tagout (LOTO) Zone Intrusion'
    ],
    complianceFramework: 'OSHA 1910 General Industry & ISO 45001 EHS Standards',
    aiPersonaPrompt: 'You are an expert Plant Operations & Industrial IoT Safety AI Copilot. Track assembly line station dwell times, robotic perimeter safety breaches, and operator shifts.'
  },

  logistics: {
    industryId: 'logistics',
    industryName: 'Warehouse, Distribution & Fulfillment Centers',
    subIndustry: 'E-Commerce Fulfillment & High-Bay Logistics',
    appTitle: 'Aperture Logistics & People Tracking',
    appSubtitle: 'Material Handlers, Forklift Fleets & High-Bay Fulfillment Safety',
    primarySiteName: 'Global Mega-Hub Distribution Center (Bldg B)',
    terminology: {
      personnelSingular: 'Associate / Handler',
      personnelPlural: 'Warehouse Associates',
      roleLabel: 'Fulfillment Duty / Equipment Certified',
      idBadgeLabel: 'Wearable RFID Scanner Tag',
      safetyComplianceLabel: 'High-Vis Vest & Proximity Sensor',
      zoneLabel: 'Warehouse Aisle / Dock Zone',
      siteLabel: 'Fulfillment Center',
      organizationType: 'Logistics Contractor / Shift'
    },
    defaultRoles: [
      'Reach Truck Operator',
      'Order Picker / Associate',
      'Inbound Unloader',
      'Outbound Stager',
      'Inventory Control Auditor',
      'Yard Hostler Driver',
      'Shift Operations Lead',
      'Conveyor Maintenance Tech',
      'Safety Marshal',
      'Packer / Dispatcher'
    ],
    defaultDepartments: [
      'Inbound Freight & Receiving',
      'High-Bay VNA Storage',
      'Pick & Pack Fulfillment',
      'Outbound Shipping & Cross-Dock',
      'Facility & Automation Maintenance'
    ],
    defaultZones: [
      { id: 'zone_dock_inbound', name: 'Inbound Cross-Dock & Unloading', category: 'Loading Dock', hazardLevel: 'warning' },
      { id: 'zone_high_bay_racks', name: 'High-Bay VNA Aisle Racks (A1-A30)', category: 'Forklift Only', hazardLevel: 'critical' },
      { id: 'zone_mezzanine_pick', name: 'Automated Mezzanine Picking Module', category: 'Active Picking', hazardLevel: 'normal' },
      { id: 'zone_pack_sort', name: 'High-Speed Sorter & Packing Line', category: 'Conveyance', hazardLevel: 'normal' },
      { id: 'zone_dock_outbound', name: 'Outbound Trailer Staging Bays', category: 'Loading Dock', hazardLevel: 'warning' },
      { id: 'zone_cold_storage', name: 'Sub-Zero Cold Storage Facility (-20°C)', category: 'Cold Climate Hazard', hazardLevel: 'warning' },
      { id: 'zone_battery_charging', name: 'Forklift Battery Charging Station', category: 'Hydrogen Risk', hazardLevel: 'critical' },
      { id: 'zone_assembly_point', name: 'East Yard Emergency Muster Station', category: 'Safety', hazardLevel: 'normal' },
      { id: 'zone_admin_dispatch', name: 'Logistics Command & Dispatch Office', category: 'Office', hazardLevel: 'normal' }
    ],
    defaultAlertCategories: [
      'Pedestrian in High-Bay Forklift Lane',
      'Cold Storage Exposure Duration Alert',
      'Dock Leveler Lockout Violation',
      'Hostler Trailer Proximity Warning',
      'Battery Bay Overheating / Thermal Runaway',
      'Aisle Congestion Delay'
    ],
    complianceFramework: 'OSHA Warehouse Safety & Supply Chain C-TPAT Compliance',
    aiPersonaPrompt: 'You are an intelligent Logistics Operations & Warehouse Safety AI Copilot. Analyze material handler movements, forklift-pedestrian intersection risks, and fulfillment throughput.'
  },

  corporate: {
    industryId: 'corporate',
    industryName: 'Corporate Campus, Tech Headquarters & Smart Offices',
    subIndustry: 'Enterprise Technology Campus & Smart Workplace',
    appTitle: 'Aperture Enterprise Workspace Tracking',
    appSubtitle: 'Workplace Density, Visitor Experience & Smart Office Security',
    primarySiteName: 'One Silicon Gateway - Global HQ Campus',
    terminology: {
      personnelSingular: 'Employee / Visitor',
      personnelPlural: 'Employees & Guests',
      roleLabel: 'Business Unit / Title',
      idBadgeLabel: 'NFC / RFID Access Badge ID',
      safetyComplianceLabel: 'Security Clearance & Access Tier',
      zoneLabel: 'Floor / Wing / Collaboration Zone',
      siteLabel: 'Office Campus',
      organizationType: 'Business Unit / Group'
    },
    defaultRoles: [
      'Software Engineering Lead',
      'Product Manager',
      'Executive Leadership',
      'IT Infrastructure Engineer',
      'Facilities Specialist',
      'Client / Guest Visitor',
      'Finance & Legal Counsel',
      'HR Business Partner',
      'Security Operations Analyst',
      'Workplace Experience Host'
    ],
    defaultDepartments: [
      'Engineering & Research',
      'Executive Suite',
      'Product & Design',
      'Corporate Operations',
      'Client Experience & Sales'
    ],
    defaultZones: [
      { id: 'zone_main_lobby', name: 'Main Campus Lobby & Reception', category: 'Public / Welcome', hazardLevel: 'normal' },
      { id: 'zone_open_workspace', name: 'Open Collaboration Studio (Floor 4)', category: 'Workplace', hazardLevel: 'normal' },
      { id: 'zone_boardroom_suite', name: 'Executive Boardroom & Briefing Center', category: 'Confidential', hazardLevel: 'normal' },
      { id: 'zone_data_center', name: 'Mission-Critical Server Data Center', category: 'Tier 4 High Security', hazardLevel: 'critical' },
      { id: 'zone_rd_lab', name: 'Confidential Hardware R&D Lab', category: 'Restricted Access', hazardLevel: 'warning' },
      { id: 'zone_cafeteria_terrace', name: 'Campus Cafeteria & Garden Terrace', category: 'Amenities', hazardLevel: 'normal' },
      { id: 'zone_wellness_center', name: 'Fitness & Employee Health Suite', category: 'Amenities', hazardLevel: 'normal' },
      { id: 'zone_assembly_point', name: 'Campus Central Plaza Muster Zone', category: 'Safety', hazardLevel: 'normal' },
      { id: 'zone_loading_dock', name: 'Secure Loading Bay & Asset Intake', category: 'Operations', hazardLevel: 'warning' }
    ],
    defaultAlertCategories: [
      'Data Center Tailgating Intrusion',
      'Unescorted Guest in R&D Wing',
      'Off-Hours Perimeter Motion Alert',
      'Meeting Room Over-Occupancy',
      'Lost Access Badge Detected',
      'Emergency Campus Evacuation Status'
    ],
    complianceFramework: 'ISO 27001 Information Security & SOC 2 Physical Controls',
    aiPersonaPrompt: 'You are an advanced Smart Workspace & Physical Security AI Copilot. Monitor corporate badge telemetry, conference room utilization, data center perimeter security, and campus muster counts.'
  },

  aviation: {
    industryId: 'aviation',
    industryName: 'Aviation, Airport Ramp & Airfield Operations',
    subIndustry: 'Commercial Airport Airside & Ground Handling',
    appTitle: 'Aperture Airfield Personnel Tracking',
    appSubtitle: 'Flight Line Safety, Baggage Handlers & Jet Bridge Operations',
    primarySiteName: 'Terminal 2 International Airfield & Apron',
    terminology: {
      personnelSingular: 'Ground Crew / Agent',
      personnelPlural: 'Airside Personnel',
      roleLabel: 'Airside Qualification / Crew',
      idBadgeLabel: 'AOA Airside SIDA Badge ID',
      safetyComplianceLabel: 'Hearing Protection & High-Vis FOD Gear',
      zoneLabel: 'Gate / Apron / Taxiway Section',
      siteLabel: 'Airport & Flight Line',
      organizationType: 'Ground Handling Agency / Airline'
    },
    defaultRoles: [
      'Aircraft Pushback Driver',
      'Lead Marshaller',
      'Baggage Tug Driver',
      'Aviation Fueler',
      'Airframe Mechanic (A&P)',
      'Catering Truck Operator',
      'Ramp Safety Inspector',
      'Gate Operations Supervisor',
      'De-Icing Specialist',
      'Airfield Operations Officer'
    ],
    defaultDepartments: [
      'Ground Handling Services',
      'Airfield Operations & Safety',
      'Line Maintenance & Avionics',
      'Aviation Fueling Logistics',
      'Airport Authority Police'
    ],
    defaultZones: [
      { id: 'zone_gate_apron', name: 'Gate 14 Aircraft Parking Apron', category: 'Active Flight Line', hazardLevel: 'critical' },
      { id: 'zone_jet_bridge', name: 'Passenger Boarding Jet Bridge', category: 'Passenger Transit', hazardLevel: 'normal' },
      { id: 'zone_baggage_makeup', name: 'Under-Terminal Baggage Sort Module', category: 'High-Speed Conveyor', hazardLevel: 'warning' },
      { id: 'zone_fuel_farm', name: 'Aviation Jet-A Fuel Storage Depot', category: 'Extreme Fire Hazard', hazardLevel: 'critical' },
      { id: 'zone_taxiway_perimeter', name: 'Taxiway Sierra Safety Incursion Zone', category: 'Active Taxiway', hazardLevel: 'critical' },
      { id: 'zone_hangar_maintenance', name: 'Heavy Maintenance Hangar 3', category: 'Maintenance', hazardLevel: 'warning' },
      { id: 'zone_ground_equipment', name: 'GSE Maintenance & Charging Facility', category: 'Machinery', hazardLevel: 'normal' },
      { id: 'zone_assembly_point', name: 'Airside Emergency Rally Point Delta', category: 'Safety', hazardLevel: 'normal' },
      { id: 'zone_operations_tower', name: 'Apron Control Tower & Ready Room', category: 'Control', hazardLevel: 'normal' }
    ],
    defaultAlertCategories: [
      'Runway / Taxiway Incursion Alert',
      'Engine Ingestion Blast Hazard Breach',
      'FOD (Foreign Object Debris) Alert',
      'Uncertified Driver in Movement Area',
      'Fuel Hydrant Safety Interlock Triggered',
      'SIDA Badge Access Boundary Violation'
    ],
    complianceFramework: 'FAA Part 139 & ICAO Airport Airside Safety Regulations',
    aiPersonaPrompt: 'You are an expert Aviation Airside Operations & Flight Line Safety AI Copilot. Track ground handler movements around aircraft turnarounds, pushback clearances, and apron safety perimeters.'
  },

  oil_gas: {
    industryId: 'oil_gas',
    industryName: 'Oil & Gas, Petrochemical & Refinery Plants',
    subIndustry: 'Hydrocarbon Refinery & Petrochemical Processing',
    appTitle: 'Aperture Refinery Personnel Tracking',
    appSubtitle: 'ATEX Intrinsically Safe Telemetry, Zone 0 Gas Safety & Permitting',
    primarySiteName: 'Coastal Petrochemical Complex (Unit 7 Distillation)',
    terminology: {
      personnelSingular: 'Process Operator / Tech',
      personnelPlural: 'Refinery Personnel',
      roleLabel: 'Craft / ATEX Permitted Role',
      idBadgeLabel: 'ATEX Zone 0 Transponder ID',
      safetyComplianceLabel: 'FRC Clothing & 4-Gas Monitor Status',
      zoneLabel: 'Process Unit / Battery Limits',
      siteLabel: 'Refinery Facility',
      organizationType: 'Maintenance / Operating Contractor'
    },
    defaultRoles: [
      'Distillation Unit Operator',
      'Pipefitter / Rig Welder',
      'Instrumentation Technician',
      'Turnaround Specialist',
      'Permit-to-Work Issuer',
      'Emergency Response Firefighter',
      'Corrosion NDT Inspector',
      'Process Safety Engineer',
      'Hydro-Blasting Specialist',
      'Operations Superintendent'
    ],
    defaultDepartments: [
      'Hydrocarbon Processing Div.',
      'Turnaround & Shutdown Team',
      'Process Safety & EHS',
      'Instrumentation & Reliability',
      'Emergency Response Brigade'
    ],
    defaultZones: [
      { id: 'zone_crude_distillation', name: 'Atmospheric Distillation Unit (Zone 1)', category: 'Hydrocarbon Processing', hazardLevel: 'critical' },
      { id: 'zone_tank_farm', name: 'Bulk Crude Storage Tank Farm (Tanks 101-112)', category: 'Storage / Flammable', hazardLevel: 'critical' },
      { id: 'zone_flare_perimeter', name: 'Elevated Flare Stack Radiation Perimeter', category: 'Extreme Thermal', hazardLevel: 'critical' },
      { id: 'zone_compressor_station', name: 'High-Pressure Gas Compression Bay', category: 'High Pressure', hazardLevel: 'critical' },
      { id: 'zone_central_control', name: 'Blast-Resistant Central Control Room', category: 'Safe Haven', hazardLevel: 'normal' },
      { id: 'zone_loading_gantry', name: 'Truck / Rail Car Hydrocarbon Gantry', category: 'Transfer Area', hazardLevel: 'warning' },
      { id: 'zone_contractor_compound', name: 'Contractor Turnaround Village', category: 'Support', hazardLevel: 'normal' },
      { id: 'zone_assembly_point', name: 'Refinery Main Windward Muster Point', category: 'Safety', hazardLevel: 'normal' },
      { id: 'zone_water_treatment', name: 'Industrial Wastewater & Effluent Unit', category: 'Utilities', hazardLevel: 'warning' }
    ],
    defaultAlertCategories: [
      'Hot Work Permit Zone Violation',
      'H2S / Hydrocarbon Gas Release Alert',
      'Lone Operator Overstay in Zone 0',
      'Evacuation Windward Muster Mismatch',
      'Unauthorized Entry without Gas Badge',
      'Static Discharge Grounding Failure'
    ],
    complianceFramework: 'OSHA 1910.119 Process Safety Management (PSM) & API RP 754',
    aiPersonaPrompt: 'You are an elite Process Safety AI Copilot specializing in Oil & Gas Refineries and Petrochemicals. Analyze intrinsically safe RFID scans, Permit-to-Work compliance, and muster rally response.'
  },

  custom: {
    industryId: 'custom',
    industryName: 'Custom / Multi-Facility Enterprise',
    subIndustry: 'Multi-Site Facility Operations',
    appTitle: 'Aperture Multi-Facility People Tracking',
    appSubtitle: 'Unified Real-Time Personnel, Device & Asset Intelligence',
    primarySiteName: 'Enterprise Main Facility',
    terminology: {
      personnelSingular: 'Personnel',
      personnelPlural: 'Workforce & Personnel',
      roleLabel: 'Role / Designation',
      idBadgeLabel: 'RFID Tag / Badge ID',
      safetyComplianceLabel: 'Safety & Access Compliance',
      zoneLabel: 'Monitored Zone',
      siteLabel: 'Facility / Site',
      organizationType: 'Organization / Department'
    },
    defaultRoles: [
      'Operations Manager',
      'Facility Lead',
      'Security Officer',
      'Technical Specialist',
      'Staff Associate',
      'Contractor',
      'Visitor / Guest',
      'EHS Officer'
    ],
    defaultDepartments: [
      'Operations Division',
      'Facilities & EHS',
      'Security Operations',
      'Administration'
    ],
    defaultZones: [
      { id: 'zone_entry_portal', name: 'Main Facility Entrance & Portal', category: 'Access Point', hazardLevel: 'normal' },
      { id: 'zone_central_area', name: 'Central Operations Area', category: 'Primary Area', hazardLevel: 'normal' },
      { id: 'zone_restricted_suite', name: 'Restricted Equipment Suite', category: 'Restricted', hazardLevel: 'critical' },
      { id: 'zone_assembly_point', name: 'Emergency Evacuation Muster Zone', category: 'Safety', hazardLevel: 'normal' }
    ],
    defaultAlertCategories: [
      'Unauthorized Zone Breach',
      'Badge Inactivity Alert',
      'Safety Standard Non-Compliance',
      'Unregistered Tag Scan'
    ],
    complianceFramework: 'Enterprise Safety & ISO 45001 Compliance Guidelines',
    aiPersonaPrompt: 'You are an intelligent Enterprise Personnel Telemetry and Facility Operations AI Copilot. Analyze real-time RFID scans, zone occupancies, and safety status across facilities.'
  }
};
