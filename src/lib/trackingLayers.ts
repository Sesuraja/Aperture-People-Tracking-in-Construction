export interface AssetItem {
  id: string;
  name: string;
  category: 'Power Tool' | 'Heavy Equipment' | 'Storage Container' | 'Material Pallet' | 'Generator' | 'Compressor' | 'Survey Equipment';
  location: string;
  assignedWorker: string;
  status: 'Operating' | 'Standby' | 'Maintenance' | 'Offline';
  utilization: number; // percentage
  lastMovement: string;
  battery: number;
  speed?: number;
  heading?: number;
  rssi?: number;
  trail?: { x: number; y: number }[];
  x: number;
  y: number;
}

export interface VehicleItem {
  id: string;
  name: string;
  type: 'Tower Crane' | 'Hydraulic Excavator' | 'Heavy Forklift' | 'Concrete Mixer Truck' | 'Articulated Dump Truck' | 'Mobile Elevating Platform';
  operator: string;
  location: string;
  speed: number; // km/h
  direction?: number; // degrees 0-360
  heading?: number;
  rssi?: number;
  trail?: { x: number; y: number }[];
  status: 'Active' | 'Idling' | 'Maintenance' | 'Parked';
  fuel: number;
  x: number;
  y: number;
}

export interface InfrastructureItem {
  id: string;
  name: string;
  type: 'UHF RFID Reader' | 'BLE Gateway' | 'UWB Anchor' | 'Wi-Fi Access Point' | 'IoT Edge Gateway';
  location: string;
  ipAddress?: string;
  macAddress?: string;
  status: 'Online' | 'Offline' | 'Warning' | 'Maintenance Required';
  signalRssi?: number; // -30 to -90 dBm
  battery?: number | null;
  occupancy?: string;
  x: number;
  y: number;
}

export interface CCTVCameraItem {
  id: string;
  name: string;
  zone: string;
  status: 'Online' | 'Offline' | 'Warning';
  aiStatus: 'Active' | 'Calibrating' | 'Triggered';
  aiFeatures: string[];
  recentEvent: string;
  streamResolution: string;
  x: number;
  y: number;
  angle: number;
}

export interface EnvironmentalSensorItem {
  id: string;
  name: string;
  zone: string;
  temperature: number; // °C
  gasLevel: number; // ppm CO/H2S
  dustPM25: number; // µg/m³
  noiseDb: number; // dB
  humidity: number; // %
  status: 'Normal' | 'Warning' | 'Critical';
  x: number;
  y: number;
}

export interface SafetyAlertItem {
  id: string;
  title: string;
  type: 'Geofence Violation' | 'Restricted Area' | 'Worker Down' | 'Lone Worker' | 'SOS Emergency' | 'Fall Detection' | 'High Temperature' | 'Gas Leak Proximity' | 'Crane Collision' | 'Vehicle-Pedestrian Proximity' | 'PPE Non-Compliance';
  severity: 'CRITICAL' | 'HIGH' | 'WARNING';
  location: string;
  subject: string;
  timestamp: string;
  acknowledged: boolean;
}

export const INITIAL_ASSETS: AssetItem[] = [];

export const INITIAL_VEHICLES: VehicleItem[] = [];

export const INITIAL_INFRASTRUCTURE: InfrastructureItem[] = [];

export const INITIAL_CCTVS: CCTVCameraItem[] = [];

export const INITIAL_ENV_SENSORS: EnvironmentalSensorItem[] = [];

export const INITIAL_SAFETY_ALERTS: SafetyAlertItem[] = [];
