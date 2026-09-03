import { motion, AnimatePresence } from 'motion/react';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Radio, User, Users, AlertTriangle, ShieldCheck, Truck, HardHat, Camera, Thermometer,
  Layers, Navigation, Maximize2, ZoomIn, ZoomOut, RotateCcw, Ruler, Box, BarChart3, Flame,
  PenTool, Check, X, ShieldAlert, BellRing, Eye, EyeOff, Filter, Sliders, ChevronUp, ChevronDown, Info,
  Upload, SlidersHorizontal, Image as ImageIcon, Sun, Moon, Sparkles, CheckCircle2
} from 'lucide-react';
import { SelectedEntity } from './LiveTrackingContextDrawer';
import { Person, Asset, Vehicle, CameraDevice, EnvSensor } from '../types';
import { optimizeFloorMapFile } from '../lib/imageOptimizer';
import { safeStorage } from '../lib/safeStorage';

export interface ReaderDevice { id: string; name: string; x: number; y: number; range: number; health: number; status: 'online' | 'offline'; }
export interface AccessGate { id: string; name: string; x: number; y: number; status: 'locked' | 'unlocked'; }
export interface MaterialAsset { id: string; name: string; type: string; x: number; y: number; }

export type MapMode = 'standard' | 'bim' | 'satellite' | 'heatmap' | 'coverage' | 'evacuation' | 'asset' | 'hardware' | 'productivity' | 'security' | 'inventory' | 'environment';

export function getBlueprintSvg(projectId: string, title: string, contractor: string, dimensions: string, mode: MapMode = 'standard'): string {
  const bgColor = '#ffffff';
  const gridColor = 'rgba(100,116,139,0.12)';
  const wallColor = '#334155';
  const textColor = '#475569';

  const svg = `
    <svg width="1200" height="800" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="cadGridMajor" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="${gridColor}" stroke-width="1.2"/>
        </pattern>
        <pattern id="cadGridMinor" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${gridColor}" stroke-width="0.5" opacity="0.6"/>
        </pattern>
        <pattern id="hatchHazard" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="16" y2="0" stroke="rgba(244,63,94,0.35)" stroke-width="3"/>
        </pattern>
        <pattern id="hatchWarning" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="16" y2="0" stroke="rgba(245,158,11,0.35)" stroke-width="3"/>
        </pattern>
        <pattern id="rebarPattern" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="1.2" fill="rgba(71,85,105,0.2)"/>
        </pattern>
      </defs>

      <!-- Background & Blueprint Grids -->
      <rect width="100%" height="100%" fill="${bgColor}"/>
      <rect width="100%" height="100%" fill="url(#cadGridMinor)"/>
      <rect width="100%" height="100%" fill="url(#cadGridMajor)"/>

      <!-- Site Perimeter Foundation Walls -->
      <rect x="30" y="25" width="1140" height="750" rx="10" fill="none" stroke="${wallColor}" stroke-width="3.5"/>
      <rect x="42" y="37" width="1116" height="726" rx="6" fill="none" stroke="${wallColor}" stroke-width="1.5" stroke-dasharray="8,6" opacity="0.7"/>

      <!-- Logistics Transport Roads & Corridors -->
      <g fill="rgba(241,245,249,0.9)" stroke="${wallColor}" stroke-width="1">
        <rect x="30" y="250" width="1140" height="55" rx="4"/>
        <rect x="30" y="495" width="1140" height="55" rx="4"/>
        <rect x="380" y="25" width="55" height="750" rx="4"/>
        <rect x="765" y="25" width="55" height="750" rx="4"/>
      </g>

      <!-- Road Centerlines -->
      <g stroke="#94a3b8" stroke-width="2" stroke-dasharray="12,10" opacity="0.8">
        <line x1="45" y1="277" x2="1155" y2="277"/>
        <line x1="45" y1="522" x2="1155" y2="522"/>
        <line x1="407" y1="35" x2="407" y2="765"/>
        <line x1="792" y1="35" x2="792" y2="765"/>
      </g>

      <!-- Structural Columns -->
      ${[
        { x: 100, y: 70 }, { x: 360, y: 70 }, { x: 745, y: 70 }, { x: 1100, y: 70 },
        { x: 100, y: 315 }, { x: 360, y: 315 }, { x: 745, y: 315 }, { x: 1100, y: 315 },
        { x: 100, y: 560 }, { x: 360, y: 560 }, { x: 745, y: 560 }, { x: 1100, y: 560 },
      ].map(c => `
        <g transform="translate(${c.x}, ${c.y})">
          <rect x="-7" y="-7" width="14" height="14" rx="2" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.2"/>
        </g>
      `).join('')}

      <!-- Site Plan Name Stamp & North Azimuth Compass -->
      <g transform="translate(870, 725)">
        <rect x="0" y="0" width="280" height="40" rx="8" fill="#ffffff" stroke="#94a3b8" stroke-width="1.2"/>
        <text x="14" y="24" font-family="system-ui, sans-serif" font-size="11" font-weight="900" fill="#0f172a" letter-spacing="0.5">${(title || 'FACILITY OPERATIONS').toUpperCase()}</text>
      </g>

      <!-- North Azimuth Compass -->
      <g transform="translate(70, 735)">
        <circle cx="0" cy="0" r="14" fill="${bgColor}" stroke="#0284c7" stroke-width="1.5"/>
        <polygon points="0,-11 3.5,0 -3.5,0" fill="#0284c7"/>
        <polygon points="0,11 3.5,0 -3.5,0" fill="#cbd5e1"/>
        <text x="0" y="-14" text-anchor="middle" font-weight="900" fill="#0284c7" font-size="9">N</text>
      </g>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function InteractiveSiteMap({
  mode,
  activeFloor = 'Floor 1',
  activeZones = {},
  people = [],
  vehicles = [],
  projectName = 'Site Operations',
  onSelectEntity
}: {
  mode: MapMode;
  activeFloor?: string;
  activeZones: Record<string, any>;
  people: Person[];
  vehicles: Vehicle[];
  projectName?: string;
  onSelectEntity?: (entity: SelectedEntity) => void;
}) {
  const zoneEntries = Object.entries(activeZones || {});

  return (
    <svg viewBox="0 0 1200 800" className="absolute inset-0 w-full h-full select-none" style={{ backgroundColor: '#ffffff' }}>
      <defs>
        <pattern id="cadGridMajor" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth="1"/>
        </pattern>
        <pattern id="cadGridMinor" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(100,116,139,0.06)" strokeWidth="0.5"/>
        </pattern>
        <pattern id="hatchYellow" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="16" y2="0" stroke="rgba(234,179,8,0.3)" strokeWidth="2.5"/>
        </pattern>
        <pattern id="hatchRed" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="16" y2="0" stroke="rgba(244,63,94,0.3)" strokeWidth="2.5"/>
        </pattern>
        <pattern id="hatchOrange" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="16" y2="0" stroke="rgba(249,115,22,0.3)" strokeWidth="2.5"/>
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect width="100%" height="100%" fill="url(#cadGridMinor)"/>
      <rect width="100%" height="100%" fill="url(#cadGridMajor)"/>

      {/* Structural Boundary Outer Wall */}
      <rect x="30" y="25" width="1140" height="750" rx="8" fill="none" stroke="#475569" strokeWidth="3" strokeDasharray="14,8"/>
      <rect x="38" y="33" width="1124" height="734" rx="6" fill="none" stroke="#e2e8f0" strokeWidth="1"/>

      {/* Primary Road Corridors between Zone Blocks */}
      <g fill="rgba(241,245,249,0.9)" stroke="#cbd5e1" strokeWidth="1">
        <rect x="30" y="250" width="1140" height="50" rx="4"/>
        <rect x="30" y="495" width="1140" height="50" rx="4"/>
        <rect x="380" y="25" width="50" height="750" rx="4"/>
        <rect x="765" y="25" width="50" height="750" rx="4"/>
      </g>

      {/* Center Road Dashed Striping */}
      <g stroke="#94a3b8" strokeWidth="2" strokeDasharray="10,8" opacity="0.8">
        <line x1="45" y1="275" x2="1155" y2="275"/>
        <line x1="45" y1="520" x2="1155" y2="520"/>
        <line x1="405" y1="35" x2="405" y2="765"/>
        <line x1="790" y1="35" x2="790" y2="765"/>
      </g>

      {/* Dynamic Zone SVG Cards with Architectural Hatching & Real-time Live Counters */}
      {zoneEntries.map(([zName, bounds]: [string, any], idx: number) => {
        const bx = (bounds.x ?? (5 + (idx % 3) * 32)) * 12;
        const by = (bounds.y ?? (5 + Math.floor(idx / 3) * 30)) * 8;
        const bw = Math.max(90, (bounds.width ?? 28) * 12);
        const bh = Math.max(70, (bounds.height ?? 24) * 8);
        const isHazard = bounds.hazardLevel === 'critical';
        const isWarning = bounds.hazardLevel === 'warning';
        const isMuster = bounds.category === 'MUSTER POINT' || zName.toLowerCase().includes('muster') || zName.toLowerCase().includes('assembly');

        const bgFill = isHazard ? '#fff1f2' : isWarning ? '#fff7ed' : isMuster ? '#f0fdf4' : '#f8fafc';
        const strokeColor = isHazard ? '#f43f5e' : isWarning ? '#f59e0b' : isMuster ? '#10b981' : '#0284c7';
        const textColor = isHazard ? '#be123c' : isWarning ? '#c2410c' : isMuster ? '#047857' : '#0369a1';

        const hatchUrl = isHazard ? 'url(#hatchRed)' : isWarning ? 'url(#hatchOrange)' : 'none';

        const workersInThisZone = (people || []).filter(p => {
          if (!p) return false;
          if (p.currentZone && p.currentZone.toLowerCase() === zName.toLowerCase()) return true;
          return p.x >= (bounds.x ?? 0) && p.x <= ((bounds.x ?? 0) + (bounds.width ?? 20)) &&
                 p.y >= (bounds.y ?? 0) && p.y <= ((bounds.y ?? 0) + (bounds.height ?? 20));
        });

        return (
          <g 
            key={`dyn-zone-${zName}-${idx}`} 
            className="cursor-pointer transition-all hover:opacity-90 group"
            onClick={(e) => {
              e.stopPropagation();
              onSelectEntity?.({
                type: 'infrastructure',
                data: {
                  id: `zone-${zName.replace(/\s+/g, '-').toLowerCase()}`,
                  name: zName,
                  type: 'IoT Edge Gateway',
                  location: zName,
                  status: (isHazard ? 'Warning' : isWarning ? 'Warning' : 'Online') as any,
                  occupancy: `${workersInThisZone.length} Active`,
                  x: bounds.x ?? 10,
                  y: bounds.y ?? 10
                }
              });
            }}
          >
            <rect x={bx} y={by} width={bw} height={bh} rx="12" fill={bgFill} stroke={strokeColor} strokeWidth={isHazard ? "3" : "2"} strokeDasharray={isHazard || isWarning ? "8,5" : "none"} />
            {hatchUrl !== 'none' && <rect x={bx} y={by} width={bw} height={bh} rx="12" fill={hatchUrl} />}

            {/* Zone Header Banner */}
            <rect x={bx} y={by} width={bw} height="28" rx="12" fill="rgba(255,255,255,0.95)" stroke={strokeColor} strokeWidth="1" />
            <text x={bx + bw / 2} y={by + 18} textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="11.5" fontWeight="900" fill={textColor} letterSpacing="0.5">
              {zName.toUpperCase()}
            </text>

            {/* Live Real-Time Occupancy Badge */}
            <g transform={`translate(${bx + bw / 2 - 42}, ${by + bh - 24})`}>
              <rect x="0" y="0" width="84" height="18" rx="6" fill="#ffffff" stroke={strokeColor} strokeWidth="1" />
              <text x="42" y="12.5" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="8.5" fontWeight="bold" fill={textColor}>
                {workersInThisZone.length > 0 ? `${workersInThisZone.length} Active` : 'Clear'}
              </text>
            </g>
          </g>
        );
      })}

      {/* Compass Rose & Azimuth Pointer */}
      <g transform="translate(1120, 680) scale(0.85)">
        <circle cx="0" cy="0" r="16" fill="#ffffff" stroke="#007BC4" strokeWidth="1.5"/>
        <path d="M 0 -13 L 4 0 L 0 2 L -4 0 Z" fill="#007BC4"/>
        <path d="M 0 13 L 4 0 L 0 -2 L -4 0 Z" fill="#cbd5e1"/>
        <text x="0" y="-17" textAnchor="middle" fontFamily="sans-serif" fontSize="9" fontWeight="900" fill="#007BC4">N</text>
      </g>
    </svg>
  );
}

export interface VisibleLayers {
  workers?: boolean;
  assets?: boolean;
  vehicles?: boolean;
  readers?: boolean;
  zones?: boolean;
  cameras?: boolean;
  sensors?: boolean;
  heatmapOverlay?: boolean;
}

export const INITIAL_DEVICES = [];

export default function LiveFloorMap({
  people = [],
  assets = [],
  vehicles = [],
  cameras = [],
  envSensors = [],
  readers = [],
  gates = [],
  materials = [],
  zones,
  highlightedPersonId,
  initialFocusZone,
  floorplanUrl,
  svgSource,
  onSelectEntity,
  customZones,
  projectId = 'metro-tower',
  projectName = 'Metro Facility Complex',
  contractor = 'Enterprise Operations',
  dimensions = '250m x 180m',
  mode = 'standard',
  activeFloor = 'Floor 1',
  visibleLayers,
  zoneCapacities = {},
  emergencySosState = null,
  isDrawingGeofence = false,
  onSaveCustomGeofence,
  onCancelDrawing
}: {
  people: Person[];
  assets?: Asset[];
  vehicles?: Vehicle[];
  cameras?: CameraDevice[];
  envSensors?: EnvSensor[];
  readers?: ReaderDevice[];
  gates?: AccessGate[];
  materials?: MaterialAsset[];
  zones: Record<string, {x:number; y:number; width:number; height:number}>;
  highlightedPersonId?: string | null;
  initialFocusZone?: string | null;
  floorplanUrl?: string | null;
  svgSource?: string | null;
  onSelectEntity?: (entity: SelectedEntity) => void;
  customZones?: Record<string, any>;
  projectId?: string;
  projectName?: string;
  contractor?: string;
  dimensions?: string;
  mode?: MapMode;
  activeFloor?: string;
  visibleLayers?: VisibleLayers;
  zoneCapacities?: Record<string, number>;
  emergencySosState?: { active: boolean; workerId?: string; workerName?: string; zone?: string; timestamp?: string; x?: number; y?: number } | null;
  isDrawingGeofence?: boolean;
  onSaveCustomGeofence?: (newZone: { name: string; bounds: { x: number; y: number; width: number; height: number; points?: {x:number; y:number}[] }; hazardLevel: string; maxCapacity: number }) => void;
  onCancelDrawing?: () => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Geofence drawing state
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([]);
  const [isGeofenceModalOpen, setIsGeofenceModalOpen] = useState(false);
  const [newZoneName, setNewZoneName] = useState('New Custom Geofence');
  const [newZoneHazard, setNewZoneHazard] = useState('critical');
  const [newZoneCapacity, setNewZoneCapacity] = useState(5);

  // Individual Geofenced Zone Visibility Toggle State
  const [hiddenZones, setHiddenZones] = useState<Record<string, boolean>>({});
  const [isZoneManagerOpen, setIsZoneManagerOpen] = useState(false);

  // Interactive Legend State & Category Marker Filter
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [activeLegendFilter, setActiveLegendFilter] = useState<string | null>(null);

  // Marker Density & Clustering Control State
  const [markerDensityMode, setMarkerDensityMode] = useState<'auto' | 'compact' | 'full'>('auto');

  // Determine if compact marker pins should be used
  const useCompactMarkers = useMemo(() => {
    if (markerDensityMode === 'compact') return true;
    if (markerDensityMode === 'full') return false;
    // 'auto': use compact if worker count > 8 or zoom level < 1.15
    return (people.length > 8 || zoom < 1.15);
  }, [markerDensityMode, people.length, zoom]);

  const activeZones = useMemo(() => {
    const raw = customZones || zones || {};
    const clean: Record<string, any> = {};
    const seenNames = new Set<string>();

    Object.entries(raw).forEach(([k, bounds]: [string, any]) => {
      if (!k) return;
      const name = k.trim();
      const isSyntheticNum = /^ZONE_\d+$/i.test(name);
      const normalizedKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (seenNames.has(normalizedKey) || (isSyntheticNum && Object.keys(clean).length >= 5)) {
        return;
      }

      seenNames.add(normalizedKey);
      clean[name] = bounds;
    });

    return Object.keys(clean).length > 0 ? clean : raw;
  }, [customZones, zones]);

  // Dispersal algorithm: Fan out overlapping or clustered workers so every worker marker is distinct and positioned in their designated zone
  const dispersedPeople = useMemo(() => {
    if (!people || people.length === 0) return [];
    
    // Strict deduplication of incoming people array
    const uniquePeople: Person[] = [];
    const seen = new Set<string>();
    people.forEach(p => {
      if (!p) return;
      const key = (p.hardhatTagId || p.name || p.id || '').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniquePeople.push(p);
      }
    });

    // Map each worker's coordinate into their active zone geometry
    const positionedPeople = uniquePeople.map((p) => {
      let resolvedX = p.x;
      let resolvedY = p.y;
      
      const zoneName = (p.currentZone || '').trim();
      if (zoneName && activeZones && Object.keys(activeZones).length > 0) {
        const zoneMatch = Object.entries(activeZones).find(([zName]) => 
          zName.toLowerCase() === zoneName.toLowerCase() ||
          zName.toLowerCase().replace(/[^a-z0-9]/g, '') === zoneName.toLowerCase().replace(/[^a-z0-9]/g, '') ||
          zName.toLowerCase().includes(zoneName.toLowerCase()) ||
          zoneName.toLowerCase().includes(zName.toLowerCase())
        );

        if (zoneMatch) {
          const [_, bounds] = zoneMatch;
          if (bounds && typeof bounds.x === 'number') {
            const bWidth = bounds.width || 18;
            const bHeight = bounds.height || 18;
            const minX = bounds.x + Math.min(3, bWidth * 0.15);
            const maxX = bounds.x + bWidth - Math.min(3, bWidth * 0.15);
            const minY = bounds.y + Math.min(3, bHeight * 0.15);
            const maxY = bounds.y + bHeight - Math.min(3, bHeight * 0.15);
            
            const isInside = p.x >= bounds.x && p.x <= bounds.x + bWidth && p.y >= bounds.y && p.y <= bounds.y + bHeight;
            if (!isInside || p.x === 0 || p.x === 50 || p.presenceState === 'IDLE') {
              const hash = (p.id || p.hardhatTagId || p.name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
              const spanX = Math.max(3, maxX - minX);
              const spanY = Math.max(3, maxY - minY);
              resolvedX = minX + (hash % spanX);
              resolvedY = minY + ((hash * 7) % spanY);
            }
          }
        }
      }

      return {
        ...p,
        x: resolvedX,
        y: resolvedY
      };
    });

    const visited = new Set<string>();
    const clusters: Person[][] = [];

    positionedPeople.forEach((p, idx) => {
      if (!p || visited.has(p.id)) return;
      const cluster: Person[] = [p];
      visited.add(p.id);

      positionedPeople.forEach((otherP, otherIdx) => {
        if (otherP && idx !== otherIdx && !visited.has(otherP.id)) {
          const dist = Math.hypot(p.x - otherP.x, p.y - otherP.y);
          if (dist < 3.8) {
            cluster.push(otherP);
            visited.add(otherP.id);
          }
        }
      });

      clusters.push(cluster);
    });

    const result: (Person & { displayX: number; displayY: number; clusterSize: number })[] = [];

    clusters.forEach((cluster) => {
      if (cluster.length === 1) {
        result.push({
          ...cluster[0],
          displayX: cluster[0].x,
          displayY: cluster[0].y,
          clusterSize: 1
        });
      } else {
        const centerX = cluster.reduce((sum, item) => sum + item.x, 0) / cluster.length;
        const centerY = cluster.reduce((sum, item) => sum + item.y, 0) / cluster.length;

        cluster.forEach((item, posIdx) => {
          if (item.presenceState === 'MOVING') {
            result.push({
              ...item,
              displayX: item.x,
              displayY: item.y,
              clusterSize: cluster.length
            });
          } else {
            const radius = Math.min(1.6, 0.6 + cluster.length * 0.2);
            const angle = posIdx * (2 * Math.PI / cluster.length);
            const dx = Math.cos(angle) * radius;
            const dy = Math.sin(angle) * radius;
            result.push({
              ...item,
              displayX: Math.max(3, Math.min(97, Math.round((centerX + dx) * 100) / 100)),
              displayY: Math.max(3, Math.min(97, Math.round((centerY + dy) * 100) / 100)),
              clusterSize: cluster.length
            });
          }
        });
      }
    });

    return result;
  }, [people, activeZones]);
  const totalZoneCount = Object.keys(activeZones).length;
  const visibleZoneCount = totalZoneCount - Object.keys(hiddenZones).filter(k => hiddenZones[k]).length;

  const toggleZoneVisibility = (zoneName: string) => {
    setHiddenZones(prev => ({ ...prev, [zoneName]: !prev[zoneName] }));
  };

  const showAllZones = () => setHiddenZones({});
  const hideAllZones = () => {
    const hidden: Record<string, boolean> = {};
    Object.keys(activeZones).forEach(k => { hidden[k] = true; });
    setHiddenZones(hidden);
  };
  const showHazardOnlyZones = () => {
    const hidden: Record<string, boolean> = {};
    Object.entries(activeZones).forEach(([k, bounds]: [string, any]) => {
      if (bounds.hazardLevel !== 'critical' && bounds.hazardLevel !== 'warning') {
        hidden[k] = true;
      }
    });
    setHiddenZones(hidden);
  };

  // Custom Map Image Calibration State
  const [localFloorplan, setLocalFloorplan] = useState<string | null>(null);
  const [imageOpacity, setImageOpacity] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('gao_map_img_opacity') : null;
    return saved ? Number(saved) : 1;
  });
  const [imageFit, setImageFit] = useState<'cover' | 'contain' | 'fill'>(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('gao_map_img_fit') as any) : null;
    return saved || 'cover';
  });
  const [imageInvert, setImageInvert] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('gao_map_img_invert') === 'true' : false;
  });
  const [isImageSettingsOpen, setIsImageSettingsOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFloorplanUrl = localFloorplan || floorplanUrl;

  const effectiveSvgSource = svgSource || (activeFloorplanUrl && (activeFloorplanUrl.trim().startsWith('<svg') || activeFloorplanUrl.startsWith('data:image/svg')) ? (activeFloorplanUrl.startsWith('data:') ? decodeURIComponent(activeFloorplanUrl.split(',')[1] || '') : activeFloorplanUrl) : null);
  const isCustomFloorplan = Boolean(
    activeFloorplanUrl && 
    typeof activeFloorplanUrl === 'string' && 
    activeFloorplanUrl.trim().length > 5 && 
    !effectiveSvgSource
  );
  const currentBlueprintUrl = isCustomFloorplan ? (activeFloorplanUrl as string) : '';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);

    try {
      const optimized = await optimizeFloorMapFile(file);
      const dataUrl = optimized.dataUrl;

      if (dataUrl) {
        setLocalFloorplan(dataUrl);
        safeStorage.setItem('gao_custom_floorplan', dataUrl);

        const token = typeof window !== 'undefined' ? (localStorage.getItem('gao_jwt_token') || 'demo') : 'demo';
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };

        const payload = {
          id: projectId,
          siteId: projectId,
          floorplanUrl: dataUrl,
          updatedAt: new Date().toISOString()
        };

        await Promise.allSettled([
          fetch(`/api/data/map_configurations/${projectId}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          }),
          fetch('/api/data/map_configurations', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          }),
          fetch('/api/data/floorplans', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              id: `fp_${projectId}`,
              siteId: projectId,
              url: dataUrl,
              updatedAt: new Date().toISOString()
            })
          })
        ]);

        window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
        window.dispatchEvent(new CustomEvent('gao_project_updated'));
      }
    } catch (err) {
      console.warn('Failed to save map configuration to backend:', err);
    } finally {
      setIsUploadingImage(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveCustomImage = async () => {
    setLocalFloorplan(null);
    safeStorage.removeItem('gao_custom_floorplan');
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('gao_jwt_token') || 'demo') : 'demo';
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      const payload = {
        id: projectId,
        siteId: projectId,
        floorplanUrl: null,
        updatedAt: new Date().toISOString()
      };

      await Promise.allSettled([
        fetch(`/api/data/map_configurations/${projectId}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }),
        fetch('/api/data/map_configurations', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        })
      ]);

      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
      window.dispatchEvent(new CustomEvent('gao_project_updated'));
    } catch (err) {
      console.warn('Failed to clear map config:', err);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDrawingGeofence) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || isDrawingGeofence) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.5, Math.min(5, prev * delta)));
  };

  const handleBlueprintClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingGeofence || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const percentX = Math.max(2, Math.min(98, Math.round((clickX / rect.width) * 100)));
    const percentY = Math.max(2, Math.min(98, Math.round((clickY / rect.height) * 100)));

    setDrawingPoints(prev => [...prev, { x: percentX, y: percentY }]);
  };

  const handleOpenGeofenceModal = () => {
    if (drawingPoints.length < 3) return;
    setIsGeofenceModalOpen(true);
  };

  const handleSaveGeofence = () => {
    if (drawingPoints.length < 3) return;
    const minX = Math.min(...drawingPoints.map(p => p.x));
    const maxX = Math.max(...drawingPoints.map(p => p.x));
    const minY = Math.min(...drawingPoints.map(p => p.y));
    const maxY = Math.max(...drawingPoints.map(p => p.y));
    const width = Math.max(10, maxX - minX);
    const height = Math.max(10, maxY - minY);

    onSaveCustomGeofence?.({
      name: newZoneName.trim() || 'Custom Geofence',
      bounds: {
        x: minX,
        y: minY,
        width,
        height,
        points: drawingPoints
      },
      hazardLevel: newZoneHazard,
      maxCapacity: Number(newZoneCapacity) || 5
    });

    setIsGeofenceModalOpen(false);
    setDrawingPoints([]);
  };

  const isProductivity = mode === 'productivity';
  const isSecurity = mode === 'security';

  return (
    <div 
      className={`absolute inset-0 overflow-hidden flex items-center justify-center p-4 group/map select-none transition-colors duration-500 ${
        emergencySosState?.active ? 'ring-8 ring-rose-600 animate-pulse bg-rose-950/20' : ''
      } ${
        isDrawingGeofence ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
      } bg-slate-100`}
      ref={mapRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
      />

      <div 
        ref={containerRef}
        onClick={handleBlueprintClick}
        className="relative w-full h-full rounded-xl shadow-inner transition-transform duration-75 ease-out border-2 border-slate-200 overflow-hidden bg-white"
        style={{ transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)` }}
      >
        {effectiveSvgSource ? (
          <div 
            className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300" 
            style={{ opacity: imageOpacity }}
            dangerouslySetInnerHTML={{ __html: effectiveSvgSource }}
          />
        ) : isCustomFloorplan ? (
          <img 
            src={currentBlueprintUrl} 
            alt="Site Blueprint" 
            className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
              imageFit === 'contain' ? 'object-contain' : imageFit === 'fill' ? 'object-fill' : 'object-cover'
            } ${imageInvert ? 'invert hue-rotate-180 brightness-90 contrast-125' : ''}`}
            style={{ opacity: imageOpacity }}
            loading="eager"
          />
        ) : (
          <InteractiveSiteMap 
            mode={mode}
            activeFloor={activeFloor}
            activeZones={activeZones}
            people={people}
            vehicles={vehicles}
            projectName={projectName}
            onSelectEntity={onSelectEntity}
          />
        )}

        {/* Technical grid overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(#007BC4_1px,transparent_1px)] [background-size:24px_24px]" />

        {/* Heatmap Layer */}
        {(mode === 'heatmap' || visibleLayers?.heatmapOverlay) && (
          <div className="absolute inset-0 pointer-events-none z-10">
             {people.map(p => (
               <div 
                 key={`heat-${p.id}`} 
                 className="absolute w-36 h-36 rounded-full blur-3xl opacity-40 animate-pulse" 
                 style={{ 
                   left: `${p.x}%`, 
                   top: `${p.y}%`, 
                   transform: 'translate(-50%, -50%)',
                   background: 'radial-gradient(circle, rgba(244,63,94,0.9) 0%, rgba(245,158,11,0.5) 45%, transparent 70%)',
                   transition: 'left 0.9s cubic-bezier(0.25, 1, 0.5, 1), top 0.9s cubic-bezier(0.25, 1, 0.5, 1)'
                 }} 
               />
             ))}
             {Object.entries(activeZones).map(([zName, bounds]: [string, any]) => (
               <div
                 key={`heat-zone-${zName}`}
                 className="absolute rounded-2xl blur-2xl opacity-20 pointer-events-none"
                 style={{
                   left: `${bounds.x}%`,
                   top: `${bounds.y}%`,
                   width: `${bounds.width}%`,
                   height: `${bounds.height}%`,
                   background: bounds.hazardLevel === 'critical' 
                     ? 'radial-gradient(circle, rgba(225,29,72,0.8) 0%, transparent 80%)'
                     : 'radial-gradient(circle, rgba(14,165,233,0.8) 0%, transparent 80%)'
                 }}
               />
             ))}
          </div>
        )}

        {/* Reader Coverage Layer */}
        {mode === 'coverage' && readers.map(r => (
          <div 
            key={`coverage-${r.id}`}
            className="absolute border-2 border-sky-400/30 bg-sky-400/5 rounded-full pointer-events-none flex items-center justify-center"
            style={{
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: `${r.range * 2}%`,
              height: `${r.range * 2}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className="w-1 h-1 bg-sky-500 rounded-full" />
          </div>
        ))}

        {/* Zones with Real-Time Capacity & Hazard Overlap Collision Alerts */}
        {(visibleLayers?.zones ?? true) && mode !== 'heatmap' && Object.entries(activeZones)
          .filter(([name]) => !hiddenZones[name])
          .map(([name, bounds]: [string, any]) => {
           const isHazard = bounds.hazardLevel === 'critical';
           const isWarning = bounds.hazardLevel === 'warning';
           const isMusterPoint = bounds.category === 'MUSTER POINT';
           const isEvacMode = mode === 'evacuation';
           const nameLower = (name || "").toLowerCase();
           const zoneWorkerCount = (people || []).filter(p => {
             if (!p) return false;
             const pZone = (p.currentZone || "").toLowerCase();

             if (pZone === nameLower || pZone.includes(nameLower) || nameLower.includes(pZone)) {
               return true;
             }
             if (nameLower.includes('tower') && pZone.includes('tower')) return true;
             if (nameLower.includes('excavation') && (pZone.includes('excavation') || pZone.includes('pit') || pZone.includes('shaft'))) return true;
             if (nameLower.includes('crane') && pZone.includes('crane')) return true;
             if (nameLower.includes('command') && (pZone.includes('command') || pZone.includes('office') || pZone.includes('gate') || pZone.includes('hq'))) return true;
             if (nameLower.includes('rebar') && (pZone.includes('rebar') || pZone.includes('steel') || pZone.includes('yard'))) return true;
             if (nameLower.includes('substation') && (pZone.includes('substation') || pZone.includes('voltage') || pZone.includes('electrical') || pZone.includes('switchgear'))) return true;
             if (nameLower.includes('muster') && (pZone.includes('muster') || pZone.includes('assembly'))) return true;

             // Spatial point-in-bounding-box check
             if (typeof p.x === 'number' && typeof p.y === 'number') {
               return p.x >= bounds.x && p.x <= (bounds.x + bounds.width) &&
                      p.y >= bounds.y && p.y <= (bounds.y + bounds.height);
             }
             return false;
           }).length;

           const hasWorkerOverlap = zoneWorkerCount > 0;
           const maxCapacity = zoneCapacities[name] || bounds.capacity || bounds.maxCapacity || (isHazard ? 4 : 10);
           const isOverCapacity = zoneWorkerCount > maxCapacity;
           const isHazardActive = (isHazard || isWarning) && hasWorkerOverlap;

           return (
             <div 
               key={name}
               onClick={(e) => {
                 if (isDrawingGeofence) return;
                 e.stopPropagation();
                 onSelectEntity?.({ 
                   type: 'infrastructure', 
                   data: { 
                     id: `zone-${name.replace(/\s+/g, '-').toLowerCase()}`, 
                     name: `Geofence Zone: ${name}`, 
                     type: 'UHF RFID Reader',
                     location: name,
                     status: (isOverCapacity || isHazardActive) ? 'Warning' : 'Online', 
                     occupancy: `${zoneWorkerCount} / ${maxCapacity}`,
                     x: bounds.x,
                     y: bounds.y
                   } 
                 });
               }}
               className={`absolute border-2 group/zone cursor-pointer ${
                 isHazardActive ? 'bg-rose-600/30 border-rose-600 ring-4 ring-rose-500/60' :
                 isOverCapacity ? 'bg-rose-600/15 border-rose-600 ring-4 ring-rose-500/30' :
                 isHazard ? 'bg-rose-500/5 border-rose-500/30' : 
                 isWarning ? 'bg-amber-500/5 border-amber-500/30' : 
                 isMusterPoint && isEvacMode ? 'bg-emerald-500/20 border-emerald-500 ring-4 ring-emerald-500/20' :
                 'bg-sky-500/5 border-sky-500/10'
               }`}
               style={{
                 left: `${bounds.x}%`,
                 top: `${bounds.y}%`,
                 width: `${bounds.width}%`,
                 height: `${bounds.height}%`
               }}
             >
                <div className={`absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                  isHazardActive ? 'bg-rose-600 text-white animate-bounce' :
                  isOverCapacity ? 'bg-rose-600 text-white animate-bounce' :
                  isHazard ? 'bg-rose-600 text-white' : 
                  isWarning ? 'bg-amber-600 text-white' : 
                  isMusterPoint && isEvacMode ? 'bg-emerald-600 text-white' :
                  'bg-sky-700 text-white'
                }`}>
                  <span className="truncate max-w-[120px]">{name}</span>
                  <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] ${
                    isHazardActive || isOverCapacity ? 'bg-black text-amber-300 font-extrabold' : 'bg-black/30 text-white'
                  }`}>
                    {zoneWorkerCount > 0 ? `${zoneWorkerCount} Active` : 'Clear'} {isHazardActive ? '🚨 BREACH' : isOverCapacity ? '⚠️ OVER' : ''}
                  </span>
                </div>
             </div>
           );
        })}

        {/* Interactive Geofence Polygon Drawing Overlay */}
        {isDrawingGeofence && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-50">
            {drawingPoints.map((pt, idx) => (
              <g key={idx}>
                <circle cx={`${pt.x}%`} cy={`${pt.y}%`} r="6" fill="#0284c7" stroke="#ffffff" strokeWidth="2" className="animate-pulse" />
                <text x={`${pt.x}%`} y={`${pt.y - 2}%`} textAnchor="middle" fill="#0284c7" fontSize="10" fontWeight="bold">P{idx + 1}</text>
              </g>
            ))}
            {drawingPoints.length > 1 && (
              <polyline
                points={drawingPoints.map(p => `${p.x}%,${p.y}%`).join(' ')}
                fill="rgba(2, 132, 199, 0.2)"
                stroke="#0284c7"
                strokeWidth="3"
                strokeDasharray="6,4"
              />
            )}
          </svg>
        )}

        {/* RFID Readers & Gates */}
        {(visibleLayers?.readers ?? true) && (
          <>
            {(mode === 'coverage' || mode === 'hardware' || mode === 'standard') && readers.map(r => (
              <div 
                key={r.id} 
                className="absolute flex flex-col items-center gap-1 z-30 cursor-pointer group" 
                style={{ left: `${r.x}%`, top: `${r.y}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.9s cubic-bezier(0.25, 1, 0.5, 1), top 0.9s cubic-bezier(0.25, 1, 0.5, 1)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEntity?.({
                    type: 'infrastructure',
                    data: {
                      id: r.id,
                      name: r.name,
                      type: 'UHF RFID Reader',
                      location: 'Portal Sector West',
                      ipAddress: '10.0.1.12',
                      macAddress: 'AA:BB:CC:DD:EE:11',
                      status: r.status === 'online' ? 'Online' : 'Offline',
                      signalRssi: -55,
                      battery: r.health,
                      x: r.x,
                      y: r.y
                    }
                  });
                }}
              >
                <div className={`p-1.5 rounded-lg shadow-lg border-2 border-white transition-transform hover:scale-125 ${r.status === 'online' ? 'bg-indigo-600' : 'bg-slate-500 opacity-50'}`}>
                  <Radio className="w-3.5 h-3.5 text-white" />
                </div>
                {zoom > 1.2 && <span className="text-[8px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">{r.name}</span>}
              </div>
            ))}

            {gates.map(g => (
              <div 
                key={g.id} 
                className="absolute flex flex-col items-center gap-1 z-30 cursor-pointer group" 
                style={{ left: `${g.x}%`, top: `${g.y}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.9s cubic-bezier(0.25, 1, 0.5, 1), top 0.9s cubic-bezier(0.25, 1, 0.5, 1)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEntity?.({
                    type: 'infrastructure',
                    data: {
                      id: g.id,
                      name: g.name,
                      type: 'IoT Edge Gateway',
                      location: 'Perimeter Access Point',
                      ipAddress: '10.0.2.15',
                      macAddress: 'AA:BB:CC:DD:EE:22',
                      status: g.status === 'unlocked' ? 'Online' : 'Warning',
                      signalRssi: -42,
                      battery: 98,
                      x: g.x,
                      y: g.y
                    }
                  });
                }}
              >
                <div className={`p-1.5 rounded-md shadow-lg border-2 border-white transition-transform hover:scale-125 ${g.status === 'unlocked' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                  <Navigation className={`w-3.5 h-3.5 text-white ${g.status === 'locked' ? 'rotate-0' : 'rotate-90'}`} />
                </div>
              </div>
            ))}
          </>
        )}

        {/* Assets & Materials */}
        {(visibleLayers?.assets ?? true) && (mode === 'asset' || mode === 'standard' || mode === 'satellite') && (
          <>
            {assets.map(a => (
              <div 
                key={a.id} 
                className="absolute flex flex-col items-center gap-1 z-30 cursor-pointer group" 
                style={{ left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.9s cubic-bezier(0.25, 1, 0.5, 1), top 0.9s cubic-bezier(0.25, 1, 0.5, 1)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEntity?.({
                    type: 'asset',
                    data: {
                      id: a.id,
                      name: a.name,
                      category: 'Power Tool',
                      location: 'Active Operations Sector',
                      assignedWorker: 'Unassigned',
                      status: 'Operating',
                      utilization: 88,
                      lastMovement: 'Just now',
                      battery: a.battery || 92,
                      x: a.x,
                      y: a.y
                    }
                  });
                }}
              >
                <div className="bg-emerald-600 p-1.5 rounded-lg shadow-lg border-2 border-white ring-2 ring-emerald-500/20 transition-transform hover:scale-125"><HardHat className="w-3.5 h-3.5 text-white" /></div>
                {zoom > 1.1 && <span className="text-[9px] font-black bg-white/95 backdrop-blur-sm border border-slate-200 px-1.5 py-0.5 rounded shadow-sm text-slate-800">{a.name}</span>}
              </div>
            ))}
            {materials.map(m => (
              <div 
                key={m.id} 
                className="absolute flex flex-col items-center gap-1 z-25 cursor-pointer group" 
                style={{ left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.9s cubic-bezier(0.25, 1, 0.5, 1), top 0.9s cubic-bezier(0.25, 1, 0.5, 1)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEntity?.({
                    type: 'asset',
                    data: {
                      id: m.id,
                      name: m.name,
                      category: 'Material Pallet',
                      location: 'Material Staging Yard',
                      assignedWorker: 'Logistics Team',
                      status: 'Standby',
                      utilization: 15,
                      lastMovement: '1 hour ago',
                      battery: 100,
                      x: m.x,
                      y: m.y
                    }
                  });
                }}
              >
                 <div className="bg-sky-600 p-1.5 rounded-sm shadow-md border border-white hover:scale-125 transition-transform"><Layers className="w-3.5 h-3.5 text-white" /></div>
                 {zoom > 1.3 && <span className="text-[8px] font-black bg-white/90 px-1 rounded truncate">{m.name}</span>}
              </div>
            ))}
          </>
        )}

        {/* Motion Trails for vehicles only (worker movement lines removed) */}
        {(visibleLayers?.vehicles ?? true) && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible">

            {vehicles.map(v => {
              if (!v.trail || v.trail.length < 2) return null;
              const strokeColor = '#f59e0b';

              return (
                <g key={`trail-vehicle-${v.id}`} className="transition-all duration-300">
                  {v.trail.slice(0, -1).map((pt, idx) => {
                    const nextPt = v.trail![idx + 1];
                    const progress = (idx + 1) / v.trail!.length;
                    const opacity = Math.max(0.2, progress * 0.8);
                    const strokeWidth = 2.0 + progress * 2.5;

                    return (
                      <g key={`seg-veh-${v.id}-${idx}`}>
                        <line
                          x1={`${pt.x}%`}
                          y1={`${pt.y}%`}
                          x2={`${nextPt.x}%`}
                          y2={`${nextPt.y}%`}
                          stroke="#fbbf24"
                          strokeWidth={strokeWidth + 2}
                          strokeOpacity={opacity * 0.25}
                          strokeLinecap="round"
                        />
                        <line
                          x1={`${pt.x}%`}
                          y1={`${pt.y}%`}
                          x2={`${nextPt.x}%`}
                          y2={`${nextPt.y}%`}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          strokeOpacity={opacity}
                          strokeLinecap="round"
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}

        {/* Construction Equipment Asset Library (Cranes, Excavators, Forklifts) */}
        {(visibleLayers?.vehicles ?? true) && vehicles.map(v => {
          const equipType = (v.type || '').toLowerCase();
          const isCrane = equipType.includes('crane');
          const isExcavator = equipType.includes('excavator') || equipType.includes('shovel');
          const isForklift = equipType.includes('forklift');

          return (
          <div 
            key={v.id} 
            className="absolute flex flex-col items-center gap-1 z-30 cursor-pointer group" 
            style={{ left: `${v.x}%`, top: `${v.y}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.9s cubic-bezier(0.25, 1, 0.5, 1), top 0.9s cubic-bezier(0.25, 1, 0.5, 1)' }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectEntity?.({
                type: 'vehicle',
                data: {
                  id: v.id,
                  name: v.name,
                  type: (v.type as any) || 'Hydraulic Excavator',
                  operator: 'Site Certified Operator',
                  location: 'Excavation Sector',
                  speed: v.speed || 12,
                  heading: v.heading || 180,
                  status: 'Active',
                  fuel: v.fuel || 85,
                  x: v.x,
                  y: v.y
                }
              });
            }}
          >
            <div className="relative flex items-center justify-center">
              <div 
                className={`p-2 rounded-xl shadow-lg border-2 border-white ring-2 transition-transform hover:scale-125 ${
                  isCrane ? 'bg-amber-700 ring-amber-500/40' :
                  isExcavator ? 'bg-amber-600 ring-amber-500/30' :
                  isForklift ? 'bg-blue-600 ring-blue-500/30' :
                  'bg-orange-600 ring-orange-500/30'
                }`}
                style={{ transform: v.heading ? `rotate(${v.heading}deg)` : undefined }}
              >
                <Truck className="w-4 h-4 text-white" />
              </div>
            </div>
            {zoom > 0.9 && (
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-black bg-slate-900/90 text-white backdrop-blur-sm border border-amber-500/40 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                  {v.name}
                </span>
                <span className="text-[8px] font-mono font-bold bg-amber-500 text-slate-950 px-1 rounded mt-0.5">
                  {v.type || 'HEAVY EQ'}
                </span>
              </div>
            )}
          </div>
        );})}

        {/* Hardware (Sensors, Cameras) */}
        {(mode === 'standard' || mode === 'hardware') && (
          <>
            {(visibleLayers?.cameras ?? true) && cameras.map(c => (
              <div 
                key={c.id} 
                className="absolute z-20 cursor-pointer hover:scale-125 transition-transform" 
                style={{ left: `${c.x}%`, top: `${c.y}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.9s cubic-bezier(0.25, 1, 0.5, 1), top 0.9s cubic-bezier(0.25, 1, 0.5, 1)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEntity?.({
                    type: 'camera',
                    data: {
                      id: c.id,
                      name: c.name,
                      zone: 'Core Perimeter',
                      status: c.status === 'offline' ? 'Offline' : 'Online',
                      aiStatus: 'Active',
                      aiFeatures: ['PPE Optical Check', 'Geofence Breach', 'Facial Rec'],
                      recentEvent: 'PPE Verification OK',
                      streamResolution: '4K UltraHD',
                      x: c.x,
                      y: c.y,
                      angle: 45
                    }
                  });
                }}
              >
                 <Camera className="w-5 h-5 text-purple-600 bg-white/90 backdrop-blur-[2px] rounded p-1 border border-purple-200 shadow-sm" />
              </div>
            ))}
            {(visibleLayers?.sensors ?? true) && envSensors.map(s => (
              <div 
                key={s.id} 
                className="absolute z-20 cursor-pointer hover:scale-125 transition-transform flex flex-col items-center gap-0.5" 
                style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.9s cubic-bezier(0.25, 1, 0.5, 1), top 0.9s cubic-bezier(0.25, 1, 0.5, 1)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEntity?.({
                    type: 'sensor',
                    data: {
                      id: s.id,
                      name: s.name,
                      zone: 'Deep Basement Pit',
                      temperature: s.temperature || 24.2,
                      gasLevel: s.gasLevel || 0.02,
                      dustPM25: s.dustPM25 || 14.5,
                      noiseDb: s.noiseDb || 68,
                      humidity: s.humidity || 58,
                      status: 'Normal',
                      x: s.x,
                      y: s.y
                    }
                  });
                }}
              >
                <div className="bg-rose-600 p-1 rounded-full text-white shadow-md border border-white">
                  <Thermometer className="w-3.5 h-3.5 animate-pulse" />
                </div>
                {zoom > 1.0 && (
                  <span className="text-[8px] font-mono font-bold bg-slate-900 text-rose-300 px-1 py-0.5 rounded border border-rose-500/30 whitespace-nowrap">
                    {s.temperature ? `${s.temperature}°C` : '24.2°C'} | {s.noiseDb ? `${s.noiseDb}dB` : '68dB'}
                  </span>
                )}
              </div>
            ))}
          </>
        )}

        {/* People Pins */}
        {(visibleLayers?.workers ?? true) && (
          <AnimatePresence>
            {dispersedPeople.map((person) => {
              const isHighlighted = highlightedPersonId === person.id;
              const isMuster = mode === 'evacuation' && person.currentZone === 'Muster Point A';
              const speedMps = person.speed ?? (person.presenceState === 'MOVING' ? 1.4 : 0.0);
              const isWorkerDimmed = activeLegendFilter && (
                activeLegendFilter === 'ppe_alert' ? person.ppeStatus !== 'NON_COMPLIANT' : activeLegendFilter !== 'workers'
              );

              // Advanced Role & Status Detection for GAO Twin System
              const isVisitor = (person.role || "").toLowerCase().includes('visitor') || (person.name || "").toLowerCase().includes('(visitor)');

              const isSupervisor = (person.role || "").toLowerCase().includes('supervisor') || 
                                   (person.role || "").toLowerCase().includes('inspector') || 
                                   (person.role || "").toLowerCase().includes('ehs') ||
                                   (person.role || "").toLowerCase().includes('manager');
              
              const isSos = !!(emergencySosState?.active && emergencySosState?.workerId === person.id);
              
              const isAlert = person.ppeStatus === "NON_COMPLIANT" && !isSos;
              const isOffline = person.presenceState === 'EXITED';
              const isIdle = (person.presenceState === 'IDLE' || speedMps < 0.1) && !isSos && !isAlert && !isOffline;

              // Choose dynamic color schemes & status rings
              let statusRingColor = 'border-emerald-500 bg-emerald-950/80 text-emerald-300 ring-emerald-500/20';
              let badgeBgColor = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
              let statusText = 'Safe';
              let avatarEmoji = '👷';
              
              if (isSos) {
                statusRingColor = 'border-rose-500 bg-rose-950 text-rose-300 ring-rose-500/40 animate-pulse';
                badgeBgColor = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
                statusText = 'SOS';
                avatarEmoji = '🚨';
              } else if (isAlert) {
                statusRingColor = 'border-rose-500 bg-slate-900 text-rose-300 ring-rose-500/20';
                badgeBgColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                statusText = 'No PPE';
                avatarEmoji = '⚠️';
              } else if (isVisitor) {
                statusRingColor = 'border-purple-400 bg-purple-950/90 text-purple-200 ring-purple-500/30 animate-pulse';
                badgeBgColor = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
                statusText = 'Visitor';
                avatarEmoji = '🎫';
              } else if (isSupervisor) {
                statusRingColor = 'border-indigo-400 bg-indigo-950/90 text-indigo-300 ring-indigo-500/20';
                badgeBgColor = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20';
                statusText = 'Supervisor';
                avatarEmoji = '🛡️';
              } else if (isOffline) {
                statusRingColor = 'border-slate-500 bg-slate-900 text-slate-400 ring-slate-500/20';
                badgeBgColor = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
                statusText = 'Offline';
                avatarEmoji = '💤';
              } else if (isIdle) {
                statusRingColor = 'border-yellow-500 bg-yellow-950/60 text-yellow-300 ring-yellow-500/20';
                badgeBgColor = 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
                statusText = 'Idle';
                avatarEmoji = '⏳';
              }

              // Determine specific trade emoji
              if (avatarEmoji === '👷') {
                const roleLower = (person.role || "").toLowerCase();
                if (roleLower.includes('electric')) avatarEmoji = '⚡';
                else if (roleLower.includes('mason') || roleLower.includes('brick')) avatarEmoji = '🧱';
                else if (roleLower.includes('weld')) avatarEmoji = '👨‍🏭';
                else if (roleLower.includes('scaffold')) avatarEmoji = '🪜';
                else if (roleLower.includes('carpenter') || roleLower.includes('timber')) avatarEmoji = '🪵';
                else if (roleLower.includes('plumb') || roleLower.includes('pipe')) avatarEmoji = '🔧';
                else if (roleLower.includes('crane') || roleLower.includes('operator') || roleLower.includes('excavator')) avatarEmoji = '🏗️';
                else if (roleLower.includes('safety') || roleLower.includes('ehs')) avatarEmoji = '🦺';
              }

              // Role borders
              let roleBorderColor = 'border-slate-800';
              let roleGlowShadow = 'shadow-slate-500/10';
              const roleLowerVal = (person.role || "").toLowerCase();
              if (isVisitor) {
                roleBorderColor = 'border-purple-400/90 hover:border-purple-300';
                roleGlowShadow = 'shadow-purple-500/30';
              } else if (roleLowerVal.includes('superintendent') || roleLowerVal.includes('manager') || roleLowerVal.includes('director')) {
                roleBorderColor = 'border-amber-500/80 hover:border-amber-400';
                roleGlowShadow = 'shadow-amber-500/20';
              } else if (roleLowerVal.includes('safety') || roleLowerVal.includes('ehs') || roleLowerVal.includes('inspector') || roleLowerVal.includes('officer')) {
                roleBorderColor = 'border-emerald-500/80 hover:border-emerald-400';
                roleGlowShadow = 'shadow-emerald-500/20';
              } else if (roleLowerVal.includes('operator') || roleLowerVal.includes('crane') || roleLowerVal.includes('driver')) {
                roleBorderColor = 'border-sky-500/80 hover:border-sky-400';
                roleGlowShadow = 'shadow-sky-500/20';
              } else if (roleLowerVal.includes('engineer') || roleLowerVal.includes('surveyor') || roleLowerVal.includes('foreman')) {
                roleBorderColor = 'border-indigo-500/80 hover:border-indigo-400';
                roleGlowShadow = 'shadow-indigo-500/20';
              } else if (roleLowerVal.includes('weld') || roleLowerVal.includes('electric') || roleLowerVal.includes('plumb') || roleLowerVal.includes('carpenter') || roleLowerVal.includes('mason') || roleLowerVal.includes('scaffold')) {
                roleBorderColor = 'border-purple-500/80 hover:border-purple-400';
                roleGlowShadow = 'shadow-purple-500/20';
              } else {
                roleBorderColor = 'border-slate-700 hover:border-slate-500';
                roleGlowShadow = 'shadow-slate-500/5';
              }
              
              return (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: isWorkerDimmed ? 0.2 : 1, 
                    scale: isHighlighted ? 1.25 : 1
                  }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`absolute z-40 cursor-pointer transition-opacity duration-300 ${isHighlighted ? 'z-50' : ''} ${isWorkerDimmed ? 'pointer-events-none' : ''}`}
                  style={{ 
                    left: `${person.displayX}%`, 
                    top: `${person.displayY}%`, 
                    transform: 'translate(-50%, -50%)',
                    transition: person.presenceState === 'MOVING' ? 'left 0.1s linear, top 0.1s linear' : 'left 0.3s ease-out, top 0.3s ease-out'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEntity?.({ type: 'person', data: person });
                  }}
                >
                  <div className="relative group flex flex-col items-center">
                    {/* Active Walking Footstep Ripple when moving */}
                    {person.presenceState === 'MOVING' && (
                      <span className="absolute -inset-1 rounded-full bg-sky-400/40 animate-ping pointer-events-none" />
                    )}

                    {/* Ring Pulse Effects for Alerts / SOS / Highlights */}
                    {(isSos || isAlert) && (
                      <span className="absolute -inset-1.5 rounded-full bg-rose-500 opacity-60 animate-ping pointer-events-none" />
                    )}
                    {isHighlighted && (
                      <span className="absolute -inset-2.5 rounded-full border-2 border-sky-400 opacity-60 animate-ping pointer-events-none" />
                    )}

                    {/* Compact Mode vs Full Card Mode */}
                    {useCompactMarkers && !isHighlighted ? (
                      /* Sleek Compact Pin Badge */
                      <div className="flex flex-col items-center gap-0.5 group-hover:scale-110 transition-transform duration-200">
                        <div className={`relative w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm shadow-xl bg-slate-950/90 backdrop-blur-md transition-all ${
                          isSos 
                            ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-950 shadow-rose-500/50' 
                            : isAlert 
                              ? 'ring-2 ring-amber-500 border-amber-500 bg-slate-950' 
                              : statusRingColor
                        }`}>
                          <span className="leading-none text-xs">{avatarEmoji}</span>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-950 ${
                            isSos ? 'bg-rose-500 animate-pulse' :
                            isAlert ? 'bg-rose-500' :
                            isOffline ? 'bg-slate-500' :
                            isIdle ? 'bg-yellow-500' :
                            'bg-emerald-500'
                          }`} />
                        </div>
                        <span className="text-[9px] font-black text-slate-800 bg-white/95 px-1.5 py-0.5 rounded-md border border-slate-300 shadow-md truncate max-w-[65px] leading-tight text-center">
                          {(person.name || "").split(' ')[0]}
                        </span>
                      </div>
                    ) : (
                      /* Premium Horizontal Worker Card Container */
                      <div className={`flex items-center gap-2 p-1.5 pl-2 pr-3 rounded-xl bg-white/95 backdrop-blur-md border shadow-lg transition-all duration-200 group-hover:scale-105 ${
                        isHighlighted 
                          ? 'ring-2 ring-sky-400 border-sky-400 bg-sky-50 shadow-sky-500/30' 
                          : isSos 
                            ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-50 shadow-rose-500/40 animate-pulse' 
                            : isAlert 
                              ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50 shadow-amber-500/30 animate-pulse' 
                              : `${roleBorderColor} ${roleGlowShadow}`
                      }`}>
                        <div className="relative shrink-0">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm shadow-md transition-all ${statusRingColor}`}>
                            <span className="leading-none">{avatarEmoji}</span>
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                            isSos ? 'bg-rose-500 animate-pulse' :
                            isAlert ? 'bg-rose-500' :
                            isOffline ? 'bg-slate-500' :
                            isIdle ? 'bg-yellow-500' :
                            isSupervisor ? 'bg-indigo-400' :
                            'bg-emerald-500'
                          }`} />
                        </div>

                        <div className="flex flex-col text-left min-w-[70px]">
                          <div className="text-[10px] font-black text-slate-900 leading-tight tracking-wide truncate max-w-[90px]">
                            {person.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] font-bold text-slate-500 leading-none truncate max-w-[55px]">
                              {person.role}
                            </span>
                            <span className={`text-[7px] font-extrabold px-1 py-0.5 rounded-sm uppercase tracking-wider leading-none border ${badgeBgColor}`}>
                              {statusText}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Heading pointer */}
                    {person.heading !== undefined && speedMps > 0.1 && (
                      <div 
                        className="absolute w-3 h-3 text-sky-500 -top-2" 
                        style={{ transform: `rotate(${person.heading}deg) translateY(-6px)` }}
                      >
                        <Navigation className="w-2.5 h-2.5 fill-sky-500 text-sky-500" />
                      </div>
                    )}

                    {/* Detailed Tooltip on Hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[10px] font-bold p-2.5 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50 border border-slate-700/80 min-w-[150px]">
                      <div className="flex items-center justify-between gap-2 mb-1 border-b border-slate-800 pb-1">
                        <span className="text-sky-400 font-mono tracking-tight font-black">{person.id}</span>
                        <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase border ${badgeBgColor}`}>{statusText}</span>
                      </div>
                      <div className="text-xs font-black text-white">{person.name}</div>
                      <div className="text-slate-300 text-[9px] mt-0.5">{person.role} | {person.tradeCompany || 'Contractor'}</div>
                      <div className="text-emerald-400 text-[9px] font-bold mt-0.5">📍 Zone: {person.currentZone}</div>
                      <div className="text-sky-300 font-mono text-[9px] mt-1 pt-1 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        <span>Speed: {speedMps}m/s</span>
                        <span>Batt: {person.battery ?? 90}%</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Floating Map Zoom, Pan & Custom Image Controls Dock */}
      <div className="absolute bottom-6 left-6 z-40 flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 shadow-xl pointer-events-auto">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoom(prev => Math.min(3, prev + 0.25));
          }}
          className="h-8 w-8 inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 hover:text-slate-900 border border-slate-200 transition shadow-2xs"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoom(prev => Math.max(0.4, prev - 0.25));
          }}
          className="h-8 w-8 inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 hover:text-slate-900 border border-slate-200 transition shadow-2xs"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
          className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 hover:text-slate-900 border border-slate-200 text-[10px] font-black font-mono transition shadow-2xs"
          title="Reset Zoom to 100%"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{Math.round(zoom * 100)}%</span>
        </button>

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        {/* Custom Image / Map Calibration Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsImageSettingsOpen(!isImageSettingsOpen);
          }}
          className={`h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-xl transition shadow-2xs text-[10px] font-black uppercase tracking-wider ${
            isImageSettingsOpen || isCustomFloorplan
              ? 'bg-sky-600 text-white ring-2 ring-sky-300'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200'
          }`}
          title="Configure Custom Floorplan Image, Opacity & Scaling"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>{isCustomFloorplan ? 'Custom Map: On' : 'Map Image'}</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setMarkerDensityMode(prev => prev === 'auto' ? 'compact' : prev === 'compact' ? 'full' : 'auto');
          }}
          className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 hover:text-slate-900 border border-slate-200 text-[10px] font-black uppercase tracking-wider transition shadow-2xs"
          title="Toggle Marker Density (Auto / Compact Pins / Full Cards)"
        >
          <Users className="w-3.5 h-3.5 text-sky-600" />
          <span>Density: {markerDensityMode}</span>
        </button>
      </div>

      {/* Custom Floorplan Image Calibration Popover */}
      {isImageSettingsOpen && (
        <div 
          className="absolute bottom-20 left-6 z-50 bg-white text-slate-900 backdrop-blur-xl p-4 rounded-3xl border border-slate-200 shadow-2xl w-80 space-y-3 pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-200"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-tight text-sky-600">
              <ImageIcon className="w-4 h-4" />
              <span>Custom Map Calibration</span>
            </div>
            <button
              onClick={() => setIsImageSettingsOpen(false)}
              className="h-6 w-6 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {/* Upload Button */}
            <div className="space-y-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
                className="w-full py-2.5 px-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition"
              >
                <Upload className="w-4 h-4" />
                <span>{isUploadingImage ? 'Uploading Image...' : isCustomFloorplan ? 'Change Floorplan Image' : 'Upload Blueprint Image'}</span>
              </button>
              <div className="text-[10px] text-slate-400 text-center">Supports PNG, JPG, SVG, WebP CAD exports</div>
            </div>

            {isCustomFloorplan && (
              <>
                {/* Opacity Control Slider */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                    <span>Floorplan Opacity</span>
                    <span className="font-mono text-sky-400">{Math.round(imageOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={imageOpacity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setImageOpacity(val);
                      localStorage.setItem('gao_map_img_opacity', String(val));
                    }}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                </div>

                {/* Image Fit Mode Selector */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-300 block">Aspect Ratio Fit</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['cover', 'contain', 'fill'] as const).map(fit => (
                      <button
                        key={fit}
                        onClick={() => {
                          setImageFit(fit);
                          localStorage.setItem('gao_map_img_fit', fit);
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                          imageFit === fit ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {fit}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Invert Colors (Dark CAD Mode) */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-bold text-slate-300">Invert to Dark CAD</span>
                  <button
                    onClick={() => {
                      const next = !imageInvert;
                      setImageInvert(next);
                      localStorage.setItem('gao_map_img_invert', String(next));
                    }}
                    className={`h-6 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
                      imageInvert ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {imageInvert ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                    <span>{imageInvert ? 'Dark Invert' : 'Standard'}</span>
                  </button>
                </div>

                {/* Remove Custom Image Button */}
                <button
                  onClick={handleRemoveCustomImage}
                  className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert to Architectural Vector CAD</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Drawing Control Bar */}
      {isDrawingGeofence && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl border border-sky-500/50 flex flex-wrap items-center justify-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 text-xs font-black text-sky-400">
            <PenTool className="w-4 h-4 text-sky-400 animate-spin" />
            <span>GEOFENCE DRAWING MODE ({drawingPoints.length} Points)</span>
          </div>
          <div className="text-[11px] text-slate-300 hidden md:inline">Click blueprint to place boundary vertices</div>
          <button
            onClick={() => setDrawingPoints([])}
            className="h-7 px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 rounded-lg text-[10px] font-bold inline-flex items-center justify-center transition leading-none"
          >
            Clear
          </button>
          <button
            onClick={handleOpenGeofenceModal}
            disabled={drawingPoints.length < 3}
            className={`h-7 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center justify-center transition leading-none ${
              drawingPoints.length >= 3 
                ? 'bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white shadow-md' 
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            Save Geofence ({drawingPoints.length >= 3 ? 'Ready' : 'Need 3+ pts'})
          </button>
          <button
            onClick={() => {
              setDrawingPoints([]);
              onCancelDrawing?.();
            }}
            className="h-7 w-7 inline-flex items-center justify-center hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            title="Exit Drawing Mode"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal for saving custom drawn geofence */}
      {isGeofenceModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-sky-700 font-black text-sm">
                <PenTool className="w-5 h-5" />
                <span>Define Geofence Zone</span>
              </div>
              <button onClick={() => setIsGeofenceModalOpen(false)} className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-semibold text-slate-700">
              <div>
                <label className="block mb-1 font-bold text-slate-900">Zone Name</label>
                <input
                  type="text"
                  value={newZoneName}
                  onChange={e => setNewZoneName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                  placeholder="e.g. Roof Deck Sector C"
                />
              </div>

              <div>
                <label className="block mb-1 font-bold text-slate-900">Hazard Category</label>
                <select
                  value={newZoneHazard}
                  onChange={e => setNewZoneHazard(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                >
                  <option value="critical">Critical High Hazard (Red)</option>
                  <option value="warning">Warning Hazard Zone (Amber)</option>
                  <option value="standard">Standard Monitored Zone (Blue)</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 font-bold text-slate-900">Max Worker Safety Capacity Limit</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newZoneCapacity}
                  onChange={e => setNewZoneCapacity(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400">Triggers automated alert when worker count exceeds threshold</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setIsGeofenceModalOpen(false)}
                className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center justify-center transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGeofence}
                className="flex-1 h-10 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg inline-flex items-center justify-center transition"
              >
                Save Zone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Navigation & Status Indicator */}
      <div className="absolute bottom-6 right-6 z-40 flex flex-col items-end gap-2 pointer-events-auto">
         <div className={`backdrop-blur-md text-white px-3.5 py-2 rounded-xl border shadow-xl flex items-center gap-2.5 transition-colors duration-500 ${
           mode === 'evacuation' ? 'bg-rose-600/90 border-rose-500' : 'bg-slate-900/90 border-slate-700'
         }`}>
            <Navigation className={`w-3.5 h-3.5 ${mode === 'evacuation' ? 'text-white' : 'text-sky-400'}`} />
            <span className="text-[9px] font-black uppercase tracking-widest leading-none">
              {mode === 'evacuation' ? 'EMERGENCY ACTIVE' : 'RTLS ENGINE ACTIVE'}
            </span>
         </div>
      </div>
    </div>
  );
}

