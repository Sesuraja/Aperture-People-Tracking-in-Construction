import { motion, AnimatePresence } from 'motion/react';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Radio, User, Users, AlertTriangle, ShieldCheck, Truck, HardHat, Camera, Thermometer,
  Layers, Navigation, Maximize2, ZoomIn, ZoomOut, RotateCcw, Ruler, Box, BarChart3, Flame,
  PenTool, Check, X, ShieldAlert, BellRing, Eye, EyeOff, Filter, Sliders, ChevronUp, ChevronDown, Info
} from 'lucide-react';
import { SelectedEntity } from './LiveTrackingContextDrawer';
import { Person, Asset, Vehicle, CameraDevice, EnvSensor } from '../types';

export interface ReaderDevice { id: string; name: string; x: number; y: number; range: number; health: number; status: 'online' | 'offline'; }
export interface AccessGate { id: string; name: string; x: number; y: number; status: 'locked' | 'unlocked'; }
export interface MaterialAsset { id: string; name: string; type: string; x: number; y: number; }

export type MapMode = 'standard' | 'bim' | 'satellite' | 'heatmap' | 'coverage' | 'evacuation' | 'asset' | 'hardware' | 'productivity' | 'security' | 'inventory' | 'environment';

export function getBlueprintSvg(projectId: string, title: string, contractor: string, dimensions: string, mode: MapMode = 'standard'): string {
  // Clean architectural white/light theme CAD blueprint
  const bgColor = '#f8fafc';
  const gridColor = 'rgba(100,116,139,0.12)';
  const subGridColor = 'rgba(100,116,139,0.05)';
  const lineStroke = '#0284c7';
  const wallFill = '#ffffff';
  const wallStroke = '#cbd5e1';

  const svg = `
    <svg width="1200" height="800" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- CAD Grid Patterns -->
        <pattern id="cadGrid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="${gridColor}" stroke-width="1"/>
        </pattern>
        <pattern id="cadSubGrid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="${subGridColor}" stroke-width="0.5"/>
        </pattern>
        <!-- Rebar grid for concrete pads -->
        <pattern id="rebarGrid" width="15" height="15" patternUnits="userSpaceOnUse">
          <path d="M 15 0 L 0 0 0 15" fill="none" stroke="rgba(2,132,199,0.10)" stroke-width="0.5"/>
        </pattern>
        <!-- Hazard Stripes -->
        <pattern id="hazardStripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="20" fill="rgba(239,68,68,0.12)" />
          <rect x="10" width="10" height="20" fill="rgba(248,250,252,0.6)" />
        </pattern>
        <!-- Dirt hatch for Excavation -->
        <pattern id="dirtHatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(217,119,6,0.18)" stroke-width="1.5" />
        </pattern>
      </defs>
      
      <!-- Canvas Background -->
      <rect width="100%" height="100%" fill="${bgColor}"/>
      <rect width="100%" height="100%" fill="url(#cadSubGrid)"/>
      <rect width="100%" height="100%" fill="url(#cadGrid)"/>

      <!-- ========================================== -->
      <!-- ACCESS ROADS & VEHICULAR LANES             -->
      <!-- ========================================== -->
      <g opacity="0.95">
        <!-- Main Entrance Road (Clean slate pavement) -->
        <path d="M 10 520 L 150 520 L 150 780" fill="none" stroke="#e2e8f0" stroke-width="48" stroke-linecap="round" />
        <path d="M 150 520 L 1180 520" fill="none" stroke="#e2e8f0" stroke-width="40" stroke-linecap="round" />
        
        <!-- Road borders -->
        <path d="M 10 520 L 150 520 L 150 780" fill="none" stroke="#cbd5e1" stroke-width="50" stroke-linecap="round" opacity="0.4" />
        <path d="M 150 520 L 1180 520" fill="none" stroke="#cbd5e1" stroke-width="42" stroke-linecap="round" opacity="0.4" />

        <!-- Road center dash lines -->
        <path d="M 10 520 L 150 520 L 150 780" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="10,10" stroke-linecap="round" />
        <path d="M 150 520 L 1180 520" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="10,10" stroke-linecap="round" />
        
        <!-- Road Label Text -->
        <text x="80" y="505" font-family="sans-serif" font-size="9" font-weight="900" fill="#475569" letter-spacing="1">MAIN ENTERPRISE ROUTE</text>
        <text x="400" y="535" font-family="sans-serif" font-size="9" font-weight="900" fill="#475569" letter-spacing="1">HEAVY TRUCK ACCESS CORRIDOR</text>
      </g>

      <!-- ========================================== -->
      <!-- SITE AREA 1: MUSTER ASSEMBLY POINT         -->
      <!-- (Corresponds to: Muster Point A)          -->
      <!-- ========================================== -->
      <g>
        <rect x="24" y="80" width="96" height="96" rx="12" fill="#ecfdf5" stroke="#10b981" stroke-width="2.5" />
        <rect x="28" y="84" width="88" height="88" rx="8" fill="none" stroke="rgba(16,185,129,0.15)" stroke-width="6" stroke-dasharray="4,8" />
        <!-- Green muster point symbol -->
        <circle cx="72" cy="120" r="18" fill="#10b981" />
        <circle cx="72" cy="120" r="8" fill="#ffffff" />
        <text x="72" y="162" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="900" fill="#065f46" letter-spacing="0.5">MUSTER POINT A</text>
        <text x="72" y="98" text-anchor="middle" font-family="sans-serif" font-size="7.5" font-weight="bold" fill="#059669">SAFE ZONE</text>
      </g>

      <!-- ========================================== -->
      <!-- SITE AREA 2: DEEP EXCAVATION PIT SHAFT     -->
      <!-- (Corresponds to: Excavation Shaft)        -->
      <!-- ========================================== -->
      <g>
        <!-- Outer Boundary -->
        <rect x="120" y="120" width="408" height="496" rx="16" fill="#fef3c7" stroke="#d97706" stroke-width="2.5" stroke-dasharray="6,4" />
        <rect x="120" y="120" width="408" height="496" rx="16" fill="url(#dirtHatch)" />
        
        <!-- Excavation Stepped Rings -->
        <rect x="150" y="150" width="348" height="436" rx="12" fill="#fef9c3" stroke="rgba(217,119,6,0.4)" stroke-width="2" />
        <rect x="180" y="180" width="288" height="376" rx="8" fill="#fffbeb" stroke="rgba(217,119,6,0.3)" stroke-width="2" />
        <rect x="210" y="210" width="228" height="316" rx="6" fill="#ffffff" stroke="rgba(217,119,6,0.25)" stroke-width="1.5" />
        
        <!-- Labels -->
        <rect x="230" y="340" width="188" height="56" rx="8" fill="#ffffff" stroke="#d97706" stroke-width="1.5" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.06))" />
        <text x="324" y="358" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="900" fill="#92400e">EXCAVATION PIT</text>
        <text x="324" y="372" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="bold" fill="#b45309">ELEV: -14.50 METERS</text>
        <text x="324" y="384" text-anchor="middle" font-family="sans-serif" font-size="7" font-weight="bold" fill="#64748b">SHORING & PILING MONITORED</text>
        
        <text x="140" y="142" font-family="sans-serif" font-size="9" font-weight="900" fill="#92400e" letter-spacing="0.5">⚠️ HAZARD SHAFT PERIMETER</text>
      </g>

      <!-- ========================================== -->
      <!-- SITE AREA 3: BUILDING A (TOWER CORE)       -->
      <!-- (Corresponds to: Tower Core / Building A)  -->
      <!-- ========================================== -->
      <g>
        <!-- Main Foundation Slab Footprint -->
        <rect x="612" y="200" width="384" height="400" rx="20" fill="#f0f9ff" stroke="#0284c7" stroke-width="3" />
        <rect x="612" y="200" width="384" height="400" rx="20" fill="url(#rebarGrid)" />
        
        <!-- Outer Concrete Shear Walls -->
        <rect x="650" y="240" width="308" height="320" rx="10" fill="#ffffff" stroke="#0284c7" stroke-width="3.5" />
        
        <!-- Internal Columns & Structural Grid Matrix -->
        <g stroke="#0284c7" stroke-width="1.2" opacity="0.35">
          <line x1="650" y1="320" x2="958" y2="320" stroke-dasharray="4,4" />
          <line x1="650" y1="400" x2="958" y2="400" stroke-dasharray="4,4" />
          <line x1="650" y1="480" x2="958" y2="480" stroke-dasharray="4,4" />
          
          <line x1="727" y1="240" x2="727" y2="560" stroke-dasharray="4,4" />
          <line x1="804" y1="240" x2="804" y2="560" stroke-dasharray="4,4" />
          <line x1="881" y1="240" x2="881" y2="560" stroke-dasharray="4,4" />
        </g>
        
        <!-- Heavy Structural Column Footings -->
        <g fill="#0284c7" opacity="0.85">
          <rect x="717" y="310" width="20" height="20" rx="3" />
          <rect x="794" y="310" width="20" height="20" rx="3" />
          <rect x="871" y="310" width="20" height="20" rx="3" />
          <rect x="717" y="390" width="20" height="20" rx="3" />
          <rect x="794" y="390" width="20" height="20" rx="3" />
          <rect x="871" y="390" width="20" height="20" rx="3" />
          <rect x="717" y="470" width="20" height="20" rx="3" />
          <rect x="794" y="470" width="20" height="20" rx="3" />
          <rect x="871" y="470" width="20" height="20" rx="3" />
        </g>

        <!-- Elevator core shaft wells -->
        <rect x="764" y="250" width="80" height="40" rx="4" fill="#e0f2fe" stroke="#0284c7" stroke-width="2" />
        
        <text x="804" y="232" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="900" fill="#0369a1">BUILDING A (CORE TOWER)</text>
        <text x="804" y="415" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="bold" fill="#0284c7">LEVEL 7 - REINFORCING ACTIVE</text>
        <text x="804" y="430" text-anchor="middle" font-family="sans-serif" font-size="7" font-weight="bold" fill="#64748b">88.00m SITE SPAN GRID</text>
      </g>

      <!-- ========================================== -->
      <!-- SITE AREA 4: CRANE SWING & RESTRICTED AREA -->
      <!-- (Corresponds to: Crane Swing Zone)         -->
      <!-- ========================================== -->
      <g>
        <!-- Boundary Box -->
        <rect x="960" y="40" width="192" height="336" rx="16" fill="#fff1f2" stroke="#ef4444" stroke-width="2" stroke-dasharray="8,4" />
        
        <!-- Large Transparent Crane Jib Swing Circle -->
        <circle cx="1040" cy="190" r="140" fill="url(#hazardStripes)" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,4" />
        
        <!-- Structural Yellow Lattice Crane Base -->
        <rect x="1025" y="175" width="30" height="30" rx="4" fill="#fbbf24" stroke="#d97706" stroke-width="2" />
        
        <!-- Crane Jib Slewing Ring Assembly & Long Slewing Arm Jib Line -->
        <circle cx="1040" cy="190" r="6" fill="#ffffff" stroke="#d97706" stroke-width="2.5" />
        <line x1="1040" y1="190" x2="940" y2="100" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round" />
        <line x1="1040" y1="190" x2="1080" y2="226" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" />
        <rect x="1074" y="220" width="12" height="12" rx="2" fill="#d97706" />

        <text x="1040" y="354" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="900" fill="#dc2626">CRANE SWING ZONE</text>
        <text x="1040" y="62" text-anchor="middle" font-family="sans-serif" font-size="7" font-weight="bold" fill="#ef4444">CRITICAL DANGER ZONE</text>
        <text x="1040" y="130" text-anchor="middle" font-family="sans-serif" font-size="7" font-weight="bold" fill="#b45309">CRANE T1 ACTIVE</text>
      </g>

      <!-- ========================================== -->
      <!-- COMPACT SECONDARY AREAS                    -->
      <!-- ========================================== -->
      
      <!-- 1. Site Admin Offices -->
      <g>
        <rect x="140" y="640" width="130" height="90" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="2" />
        <line x1="180" y1="640" x2="180" y2="730" stroke="#3b82f6" stroke-width="1" stroke-dasharray="3,3" />
        <line x1="225" y1="640" x2="225" y2="730" stroke="#3b82f6" stroke-width="1" stroke-dasharray="3,3" />
        <text x="205" y="688" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="900" fill="#1d4ed8">SITE OFFICE</text>
        <text x="205" y="704" text-anchor="middle" font-family="sans-serif" font-size="7" font-weight="bold" fill="#3b82f6">HQ & COMMAND</text>
      </g>
      
      <!-- 2. Vehicle Parking Bay Area -->
      <g>
        <rect x="24" y="640" width="96" height="96" rx="6" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" />
        <line x1="24" y1="664" x2="120" y2="664" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,2" />
        <line x1="24" y1="688" x2="120" y2="688" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,2" />
        <line x1="24" y1="712" x2="120" y2="712" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,2" />
        <text x="72" y="654" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="900" fill="#475569">PARKING</text>
        <text x="72" y="726" text-anchor="middle" font-family="sans-serif" font-size="6.5" font-weight="bold" fill="#64748b">14 VEHICLES MAX</text>
      </g>
      
      <!-- 3. Material Staging Area -->
      <g>
        <rect x="480" y="640" width="180" height="90" rx="8" fill="#faf5ff" stroke="#8b5cf6" stroke-width="1.5" />
        <rect x="492" y="652" width="48" height="20" rx="2" fill="#c084fc" opacity="0.5" stroke="#8b5cf6" stroke-width="1" />
        <rect x="492" y="682" width="48" height="20" rx="2" fill="#60a5fa" opacity="0.5" stroke="#3b82f6" stroke-width="1" />
        <rect x="552" y="652" width="48" height="20" rx="2" fill="#34d399" opacity="0.5" stroke="#10b981" stroke-width="1" />
        <rect x="552" y="682" width="48" height="20" rx="2" fill="#fbbf24" opacity="0.5" stroke="#f59e0b" stroke-width="1" />
        
        <text x="618" y="700" font-family="sans-serif" font-size="9" font-weight="900" fill="#6b21a8">MATERIAL</text>
        <text x="618" y="712" font-family="sans-serif" font-size="9" font-weight="900" fill="#6b21a8">STAGING</text>
        <text x="570" y="648" text-anchor="middle" font-family="sans-serif" font-size="7" font-weight="bold" fill="#7c3aed">YARD B</text>
      </g>

      <!-- 4. Steel Storage Yard -->
      <g>
        <rect x="820" y="620" width="180" height="90" rx="8" fill="#fffbeb" stroke="#f59e0b" stroke-width="1.5" />
        <line x1="840" y1="645" x2="900" y2="645" stroke="#d97706" stroke-width="4" stroke-linecap="round" opacity="0.9" />
        <line x1="840" y1="655" x2="900" y2="655" stroke="#d97706" stroke-width="4" stroke-linecap="round" opacity="0.9" />
        <line x1="840" y1="665" x2="900" y2="665" stroke="#d97706" stroke-width="4" stroke-linecap="round" opacity="0.9" />
        <line x1="840" y1="675" x2="900" y2="675" stroke="#d97706" stroke-width="4" stroke-linecap="round" opacity="0.9" />
        
        <rect x="912" y="640" width="76" height="40" rx="4" fill="#ffffff" stroke="#f59e0b" stroke-width="1" />
        <text x="950" y="656" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="900" fill="#b45309">STEEL</text>
        <text x="950" y="670" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="900" fill="#b45309">YARD</text>
        <text x="910" y="632" text-anchor="middle" font-family="sans-serif" font-size="7" font-weight="bold" fill="#d97706">ZONE S3</text>
      </g>

      <!-- ========================================== -->
      <!-- TECHNICAL DIMENSION LINES                  -->
      <!-- ========================================== -->
      <g stroke="#64748b" stroke-width="0.8" opacity="0.5" font-family="sans-serif" font-size="8" fill="#475569">
        <line x1="16" y1="20" x2="16" y2="780" stroke-dasharray="2,4" />
        <line x1="1184" y1="20" x2="1184" y2="780" stroke-dasharray="2,4" />
        
        <line x1="16" y1="40" x2="1184" y2="40" />
        <text x="600" y="34" text-anchor="middle" font-weight="bold" letter-spacing="1">SITE HORIZONTAL MATRIX: 250 METERS</text>
        
        <line x1="20" y1="760" x2="1180" y2="760" stroke-dasharray="8,2" />
        <text x="600" y="754" text-anchor="middle" font-weight="bold">GAO AUTOMATED RFID TELEMETRY BLUEPRINT</text>
      </g>

      <!-- Compass North Indicator -->
      <g transform="translate(1140, 720) scale(0.75)">
        <circle cx="0" cy="0" r="24" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" />
        <path d="M 0 -20 L 6 0 L 0 4 L -6 0 Z" fill="#0284c7" />
        <text x="0" y="-26" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="900" fill="#0284c7">N</text>
      </g>

    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function InteractiveSiteMap({
  mode,
  activeFloor = 'Floor 1',
  activeZones,
  people,
  vehicles,
  onSelectEntity
}: {
  mode: MapMode;
  activeFloor?: string;
  activeZones: Record<string, any>;
  people: Person[];
  vehicles: Vehicle[];
  onSelectEntity?: (entity: SelectedEntity) => void;
}) {
  const getRFIDMarkersInZone = (zoneName: string) => {
    const bounds = activeZones[zoneName];
    if (!bounds) return [];
    const rfidMarkers = [
      ...(people || []).map(p => ({ ...p, markerType: 'person' })),
      ...(vehicles || []).map(v => ({ ...v, markerType: 'vehicle' }))
    ];
    return rfidMarkers.filter(m => 
      m && m.x >= bounds.x && m.x <= bounds.x + bounds.width &&
      m.y >= bounds.y && m.y <= bounds.y + bounds.height
    );
  };

  const isExcavationShaftBreached = getRFIDMarkersInZone('Excavation Shaft').length > 0;
  const isTowerCoreBreached = getRFIDMarkersInZone('Tower Core').length > 0;
  const isCraneSwingBreached = getRFIDMarkersInZone('Crane Swing Zone').length > 0;
  const isHighVoltageBreached = getRFIDMarkersInZone('High Voltage Area').length > 0;

  const floorTitles: Record<string, string> = {
    'ALL': 'MASTER SITE COMPOSITE BLUEPRINT — ALL LEVELS',
    'Floor 1': 'LEVEL 1 — GROUND ACCESS & LOGISTICS PORTAL',
    'Floor 2': 'LEVEL 2 — 440V SUBSTATION & MEP RISERS',
    'Floor 3': 'LEVEL 3 — REBAR & CONCRETE POUR SLAB',
    'Floor 4': 'LEVEL 4 — STEEL FRAMING & INTERIOR RISERS',
    'Floor 5': 'LEVEL 5 — CURTAIN WALL & FACADE DECK',
    'Floor 6': 'LEVEL 6 — MECHANICAL PENTHOUSE & CHILLER PLANT',
    'Floor 7': 'LEVEL 7 — TOWER CORE & 360° CRANE SWING RADIUS'
  };

  const currentFloorTitle = floorTitles[activeFloor] || `${(activeFloor || 'Level 1').toUpperCase()} ARCHITECTURAL BLUEPRINT`;

  return (
    <svg viewBox="0 0 1200 800" className="absolute inset-0 w-full h-full bg-slate-50 dark:bg-slate-900 select-none">
      <defs>
        <pattern id="cadGrid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(100,116,139,0.12)" strokeWidth="1"/>
        </pattern>
        <pattern id="cadSubGrid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(100,116,139,0.05)" strokeWidth="0.5"/>
        </pattern>
        <pattern id="rebarGrid" width="15" height="15" patternUnits="userSpaceOnUse">
          <path d="M 15 0 L 0 0 0 15" fill="none" stroke="rgba(2,132,199,0.10)" strokeWidth="0.5"/>
        </pattern>
        <pattern id="hazardStripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="20" fill="rgba(239,68,68,0.15)" />
          <rect x="10" width="10" height="20" fill="rgba(248,250,252,0.6)" />
        </pattern>
        <pattern id="dirtHatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(217,119,6,0.18)" strokeWidth="1.5" />
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill="#f8fafc"/>
      <rect width="100%" height="100%" fill="url(#cadSubGrid)"/>
      <rect width="100%" height="100%" fill="url(#cadGrid)"/>

      {/* ACCESS ROADS & VEHICULAR LANES */}
      <g opacity="0.95" className="transition-all hover:opacity-100 cursor-pointer" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'road-access',
            name: 'Heavy Truck Access Route',
            type: 'IoT Edge Gateway',
            location: 'Main Logistics Gate',
            status: 'Online',
            occupancy: 'Unrestricted',
            x: 10,
            y: 52
          }
        });
      }}>
        <path d="M 10 520 L 150 520 L 150 780" fill="none" stroke="#cbd5e1" strokeWidth="52" strokeLinecap="round" />
        <path d="M 150 520 L 1180 520" fill="none" stroke="#cbd5e1" strokeWidth="44" strokeLinecap="round" />
        <path d="M 10 520 L 150 520 L 150 780" fill="none" stroke="#e2e8f0" strokeWidth="48" strokeLinecap="round" />
        <path d="M 150 520 L 1180 520" fill="none" stroke="#e2e8f0" strokeWidth="40" strokeLinecap="round" />
        
        <path d="M 10 520 L 150 520 L 150 780" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="10,10" strokeLinecap="round" opacity="0.9" />
        <path d="M 150 520 L 1180 520" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="10,10" strokeLinecap="round" opacity="0.9" />
        
        <text x="80" y="505" fontFamily="sans-serif" fontSize="9" fontWeight="900" fill="#475569" letterSpacing="1">MAIN ENTERPRISE ROUTE</text>
        <text x="400" y="535" fontFamily="sans-serif" fontSize="9" fontWeight="900" fill="#475569" letterSpacing="1">HEAVY TRUCK ACCESS CORRIDOR</text>
      </g>

      {/* MUSTER ASSEMBLY POINT A */}
      <g className="transition-all hover:opacity-100 cursor-pointer" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'muster-point-a',
            name: 'Muster Point A (Assembly Area)',
            type: 'IoT Edge Gateway',
            location: 'Main North Gate Perimeter',
            status: 'Online',
            occupancy: `${people.filter(p => p.currentZone === 'Muster Point A').length} Onsite`,
            x: 2,
            y: 10
          }
        });
      }}>
        <rect x="24" y="80" width="96" height="96" rx="12" fill="#ecfdf5" stroke="#10b981" strokeWidth="2.5" />
        <rect x="28" y="84" width="88" height="88" rx="8" fill="none" stroke="rgba(16,185,129,0.15)" strokeWidth="6" strokeDasharray="4,8" />
        <circle cx="72" cy="120" r="18" fill="#10b981" />
        <circle cx="72" cy="120" r="8" fill="#ffffff" />
        <text x="72" y="162" textAnchor="middle" fontFamily="sans-serif" fontSize="9" fontWeight="900" fill="#065f46" letterSpacing="0.5">MUSTER POINT A</text>
        <text x="72" y="98" textAnchor="middle" fontFamily="sans-serif" fontSize="7.5" fontWeight="bold" fill="#059669">SAFE ZONE</text>
      </g>

      {/* DEEP EXCAVATION PIT SHAFT */}
      <g className="transition-all cursor-pointer group" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'zone-excavation-shaft',
            name: 'Deep Excavation Pit Shaft',
            type: 'IoT Edge Gateway',
            location: 'Central West Sector',
            status: isExcavationShaftBreached ? 'Warning' : 'Online',
            occupancy: `${getRFIDMarkersInZone('Excavation Shaft').length} Entities`,
            x: 10,
            y: 15
          }
        });
      }}>
        <rect x="120" y="120" width="408" height="496" rx="16" fill="#fef3c7" stroke={isExcavationShaftBreached ? '#ef4444' : '#d97706'} strokeWidth="2.5" strokeDasharray="6,4" className="transition-colors duration-300" />
        <rect x="120" y="120" width="408" height="496" rx="16" fill="url(#dirtHatch)" />
        
        <rect x="150" y="150" width="348" height="436" rx="12" fill="#fef9c3" stroke={isExcavationShaftBreached ? 'rgba(239,68,68,0.5)' : 'rgba(217,119,6,0.4)'} strokeWidth="2" />
        <rect x="180" y="180" width="288" height="376" rx="8" fill="#fffbeb" stroke="rgba(217,119,6,0.3)" strokeWidth="2" />
        <rect x="210" y="210" width="228" height="316" rx="6" fill="#ffffff" stroke="rgba(217,119,6,0.25)" strokeWidth="1.5" />
        
        <line x1="324" y1="120" x2="324" y2="210" stroke="#94a3b8" strokeWidth="2.5" />
        <line x1="324" y1="616" x2="324" y2="526" stroke="#94a3b8" strokeWidth="2.5" />
        <line x1="120" y1="368" x2="210" y2="368" stroke="#94a3b8" strokeWidth="2.5" />
        <line x1="528" y1="368" x2="438" y2="368" stroke="#94a3b8" strokeWidth="2.5" />

        {isExcavationShaftBreached && (
          <rect x="120" y="120" width="408" height="496" rx="16" fill="rgba(239, 68, 68, 0.12)" />
        )}

        <rect x="230" y="340" width="188" height="56" rx="8" fill="#ffffff" stroke={isExcavationShaftBreached ? '#ef4444' : '#d97706'} strokeWidth="1.5" />
        <text x="324" y="358" textAnchor="middle" fontFamily="sans-serif" fontSize="10" fontWeight="900" fill={isExcavationShaftBreached ? '#dc2626' : '#92400e'}>
          {isExcavationShaftBreached ? "🚨 SHAFT OCCUPIED" : "EXCAVATION PIT"}
        </text>
        <text x="324" y="372" textAnchor="middle" fontFamily="sans-serif" fontSize="8" fontWeight="bold" fill="#b45309">ELEV: -14.50 METERS</text>
        <text x="324" y="384" textAnchor="middle" fontFamily="sans-serif" fontSize="7" fontWeight="bold" fill="#64748b">RFID GEOMATRIX CALIBRATED</text>
        <text x="140" y="142" fontFamily="sans-serif" fontSize="9" fontWeight="900" fill="#92400e" letterSpacing="0.5">⚠️ EXCAVATION PERIMETER</text>
      </g>

      {/* BUILDING A (TOWER CORE) */}
      <g className="transition-all cursor-pointer group" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'zone-building-a',
            name: 'Building A (Core Tower Structure)',
            type: 'IoT Edge Gateway',
            location: 'Central East Sector',
            status: 'Online',
            occupancy: `${getRFIDMarkersInZone('Tower Core').length} Onsite`,
            x: 51,
            y: 25
          }
        });
      }}>
        <rect x="612" y="200" width="384" height="400" rx="20" fill="#f0f9ff" stroke="#0284c7" strokeWidth="3" />
        <rect x="612" y="200" width="384" height="400" rx="20" fill="url(#rebarGrid)" />
        
        <rect x="650" y="240" width="308" height="320" rx="10" fill="#ffffff" stroke="#0284c7" strokeWidth="3.5" />
        
        <g stroke="#0284c7" strokeWidth="1.2" opacity="0.35">
          <line x1="650" y1="320" x2="958" y2="320" strokeDasharray="4,4" />
          <line x1="650" y1="400" x2="958" y2="400" strokeDasharray="4,4" />
          <line x1="650" y1="480" x2="958" y2="480" strokeDasharray="4,4" />
          
          <line x1="727" y1="240" x2="727" y2="560" strokeDasharray="4,4" />
          <line x1="804" y1="240" x2="804" y2="560" strokeDasharray="4,4" />
          <line x1="881" y1="240" x2="881" y2="560" strokeDasharray="4,4" />
        </g>
        
        <g fill="#0284c7" opacity="0.85">
          <rect x="717" y="310" width="20" height="20" rx="3" />
          <rect x="794" y="310" width="20" height="20" rx="3" />
          <rect x="871" y="310" width="20" height="20" rx="3" />
          <rect x="717" y="390" width="20" height="20" rx="3" />
          <rect x="794" y="390" width="20" height="20" rx="3" />
          <rect x="871" y="390" width="20" height="20" rx="3" />
          <rect x="717" y="470" width="20" height="20" rx="3" />
          <rect x="794" y="470" width="20" height="20" rx="3" />
          <rect x="871" y="470" width="20" height="20" rx="3" />
        </g>

        <rect x="764" y="250" width="80" height="40" rx="4" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2" />
        
        <text x="804" y="232" textAnchor="middle" fontFamily="sans-serif" fontSize="11" fontWeight="900" fill="#0369a1">BUILDING A (CORE TOWER)</text>
        <text x="804" y="415" textAnchor="middle" fontFamily="sans-serif" fontSize="8" fontWeight="bold" fill="#0284c7">LEVEL 7 - REINFORCING ACTIVE</text>
        <text x="804" y="430" textAnchor="middle" fontFamily="sans-serif" fontSize="7" fontWeight="bold" fill="#64748b">88.00m SITE SPAN GRID</text>
      </g>

      {/* DYNAMIC RED-TINTED OVERLAYS & COLLISION ALERTS */}
      
      {/* 1. Crane Swing & Restricted Area */}
      <g className="transition-all cursor-pointer" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'zone-crane-swing',
            name: 'Crane Swing Exclusion Radius',
            type: 'IoT Edge Gateway',
            location: 'North East Sector',
            status: isCraneSwingBreached ? 'Warning' : 'Online',
            occupancy: `${getRFIDMarkersInZone('Crane Swing Zone').length} Active Markers`,
            x: 80,
            y: 5
          }
        });
      }}>
        <rect x="960" y="40" width="192" height="336" rx="16" fill="#fff1f2" stroke={isCraneSwingBreached ? "#dc2626" : "#ef4444"} strokeWidth={isCraneSwingBreached ? 3.5 : 2} strokeDasharray={isCraneSwingBreached ? "4,4" : "8,4"} className="transition-all duration-300" />
        
        <circle cx="1040" cy="190" r="140" fill={isCraneSwingBreached ? "rgba(239, 68, 68, 0.20)" : "rgba(239, 68, 68, 0.08)"} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,4" className="transition-all duration-300" />
        {isCraneSwingBreached && (
          <circle cx="1040" cy="190" r="140" fill="url(#hazardStripes)" opacity="0.65" />
        )}
        
        <rect x="1025" y="175" width="30" height="30" rx="4" fill="#fbbf24" stroke="#d97706" strokeWidth="2" />
        
        <circle cx="1040" cy="190" r="6" fill="#ffffff" stroke="#d97706" strokeWidth="2.5" />
        <line x1="1040" y1="190" x2="940" y2="100" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="1040" y1="190" x2="1080" y2="226" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        <rect x="1074" y="220" width="12" height="12" rx="2" fill="#d97706" />

        <text x="1040" y="354" textAnchor="middle" fontFamily="sans-serif" fontSize="10" fontWeight="900" fill={isCraneSwingBreached ? "#b91c1c" : "#dc2626"}>
          {isCraneSwingBreached ? "🚨 CRITICAL SWING BREACH" : "CRANE SWING ZONE"}
        </text>
        <text x="1040" y="62" textAnchor="middle" fontFamily="sans-serif" fontSize="7" fontWeight="bold" fill={isCraneSwingBreached ? "#b91c1c" : "#ef4444"}>
          {isCraneSwingBreached ? "⚠️ PERSONNEL DETECTED" : "CRITICAL DANGER ZONE"}
        </text>
        <text x="1040" y="130" textAnchor="middle" fontFamily="sans-serif" fontSize="7" fontWeight="bold" fill="#b45309">CRANE T1 ACTIVE</text>
      </g>

      {/* 2. High Voltage Area Substation */}
      <g className="transition-all cursor-pointer" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'zone-high-voltage',
            name: 'High Voltage Area (Substation)',
            type: 'IoT Edge Gateway',
            location: 'North Center Perimeter',
            status: isHighVoltageBreached ? 'Warning' : 'Online',
            occupancy: `${getRFIDMarkersInZone('High Voltage Area').length} Active Markers`,
            x: 46,
            y: 5
          }
        });
      }}>
        <rect x="548" y="40" width="172" height="128" rx="12" fill={isHighVoltageBreached ? "rgba(239, 68, 68, 0.22)" : "rgba(239, 68, 68, 0.06)"} stroke={isHighVoltageBreached ? "#dc2626" : "#ef4444"} strokeWidth={isHighVoltageBreached ? 3.5 : 1.8} strokeDasharray={isHighVoltageBreached ? "2,2" : "6,4"} className="transition-all duration-300" />
        {isHighVoltageBreached && (
          <rect x="548" y="40" width="172" height="128" rx="12" fill="url(#hazardStripes)" opacity="0.65" />
        )}

        <path d="M 634 60 L 618 100 L 632 100 L 622 136 L 642 90 L 628 90 Z" fill={isHighVoltageBreached ? "#d97706" : "rgba(239, 68, 68, 0.3)"} />

        <text x="634" y="148" textAnchor="middle" fontFamily="sans-serif" fontSize="9" fontWeight="900" fill={isHighVoltageBreached ? "#b91c1c" : "#dc2626"}>
          {isHighVoltageBreached ? "⚡ HIGH VOLTAGE BREACH" : "HIGH VOLTAGE AREA"}
        </text>
        <text x="634" y="52" textAnchor="middle" fontFamily="sans-serif" fontSize="6.5" fontWeight="bold" fill={isHighVoltageBreached ? "#b91c1c" : "#ef4444"}>
          {isHighVoltageBreached ? "🚨 INTRUDER RFID TAGGED" : "DANGER: 440V SUBSTATION"}
        </text>
      </g>

      {/* COMPACT STAGING & STORAGE AREAS */}
      
      {/* Site Admin Offices */}
      <g className="transition-all hover:opacity-100 cursor-pointer" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'site-office',
            name: 'Site Admin Offices & Headquarters',
            type: 'IoT Edge Gateway',
            location: 'South West Corner',
            status: 'Online',
            occupancy: 'Command Center Active',
            x: 12,
            y: 68
          }
        });
      }}>
        <rect x="140" y="640" width="130" height="90" rx="6" fill="#eff6ff" stroke="#3b82f6" strokeWidth="2" />
        <line x1="180" y1="640" x2="180" y2="730" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3,3" />
        <line x1="225" y1="640" x2="225" y2="730" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3,3" />
        <text x="205" y="688" textAnchor="middle" fontFamily="sans-serif" fontSize="9" fontWeight="900" fill="#1d4ed8">SITE OFFICE</text>
        <text x="205" y="704" textAnchor="middle" fontFamily="sans-serif" fontSize="7" fontWeight="bold" fill="#3b82f6">HQ & VISITOR CENTRE</text>
      </g>
      
      {/* Vehicle Parking Bay Area */}
      <g className="transition-all hover:opacity-100 cursor-pointer" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'parking-bay',
            name: 'Vehicle Parking & Fleet Bay',
            type: 'IoT Edge Gateway',
            location: 'South West Perimeter',
            status: 'Online',
            occupancy: '9 / 14 Lots Occupied',
            x: 5,
            y: 68
          }
        });
      }}>
        <rect x="24" y="640" width="96" height="96" rx="6" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="24" y1="664" x2="120" y2="664" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,2" />
        <line x1="24" y1="688" x2="120" y2="688" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,2" />
        <line x1="24" y1="712" x2="120" y2="712" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,2" />
        <text x="72" y="654" textAnchor="middle" fontFamily="sans-serif" fontSize="8" fontWeight="900" fill="#475569">PARKING</text>
        <text x="72" y="726" textAnchor="middle" fontFamily="sans-serif" fontSize="6.5" fontWeight="bold" fill="#64748b">14 VEHICLES MAX</text>
      </g>
      
      {/* Material Staging Area Yard B */}
      <g className="transition-all hover:opacity-100 cursor-pointer" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'material-staging-yard',
            name: 'Material Staging Yard B',
            type: 'IoT Edge Gateway',
            location: 'South Center Sector',
            status: 'Online',
            occupancy: '4 Container Stacks',
            x: 45,
            y: 80
          }
        });
      }}>
        <rect x="480" y="640" width="180" height="90" rx="8" fill="#faf5ff" stroke="#8b5cf6" strokeWidth="1.5" />
        <rect x="492" y="652" width="48" height="20" rx="2" fill="#c084fc" opacity="0.4" stroke="#8b5cf6" strokeWidth="1" />
        <rect x="492" y="682" width="48" height="20" rx="2" fill="#60a5fa" opacity="0.4" stroke="#3b82f6" strokeWidth="1" />
        <rect x="552" y="652" width="48" height="20" rx="2" fill="#34d399" opacity="0.4" stroke="#10b981" strokeWidth="1" />
        <rect x="552" y="682" width="48" height="20" rx="2" fill="#fbbf24" opacity="0.4" stroke="#f59e0b" strokeWidth="1" />
        <text x="618" y="700" fontFamily="sans-serif" fontSize="9" fontWeight="900" fill="#6b21a8">MATERIAL</text>
        <text x="618" y="712" fontFamily="sans-serif" fontSize="9" fontWeight="900" fill="#6b21a8">STAGING</text>
        <text x="570" y="648" textAnchor="middle" fontFamily="sans-serif" fontSize="7" fontWeight="bold" fill="#7c3aed">YARD B</text>
      </g>

      {/* Steel Storage Yard Zone S3 */}
      <g className="transition-all hover:opacity-100 cursor-pointer" onClick={(e) => {
        e.stopPropagation();
        onSelectEntity?.({
          type: 'infrastructure',
          data: {
            id: 'steel-yard-s3',
            name: 'Steel Storage Yard Zone S3',
            type: 'IoT Edge Gateway',
            location: 'South East Sector',
            status: 'Online',
            occupancy: 'Heavy Duty Rebar Stacked',
            x: 82,
            y: 65
          }
        });
      }}>
        <rect x="820" y="620" width="180" height="90" rx="8" fill="#fffbeb" stroke="#f59e0b" strokeWidth="1.5" />
        <line x1="840" y1="645" x2="900" y2="645" stroke="#d97706" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        <line x1="840" y1="655" x2="900" y2="655" stroke="#d97706" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        <line x1="840" y1="665" x2="900" y2="665" stroke="#d97706" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        <line x1="840" y1="675" x2="900" y2="675" stroke="#d97706" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        <rect x="912" y="640" width="76" height="40" rx="4" fill="#ffffff" stroke="#f59e0b" strokeWidth="1" />
        <text x="950" y="656" textAnchor="middle" fontFamily="sans-serif" fontSize="8" fontWeight="900" fill="#b45309">STEEL</text>
        <text x="950" y="670" textAnchor="middle" fontFamily="sans-serif" fontSize="8" fontWeight="900" fill="#b45309">YARD</text>
        <text x="910" y="632" textAnchor="middle" fontFamily="sans-serif" fontSize="7" fontWeight="bold" fill="#d97706">ZONE S3</text>
      </g>

      {/* Grid boundary markers & compass */}
      <g stroke="#64748b" strokeWidth="0.8" opacity="0.5" fontFamily="sans-serif" fontSize="8" fill="#475569">
        <line x1="16" y1="20" x2="16" y2="780" strokeDasharray="2,4" />
        <line x1="1184" y1="20" x2="1184" y2="780" strokeDasharray="2,4" />
        <line x1="16" y1="40" x2="1184" y2="40" />
        <text x="600" y="34" textAnchor="middle" fontWeight="bold" letterSpacing="1">SITE HORIZONTAL MATRIX: 250 METERS</text>
        <line x1="20" y1="760" x2="1180" y2="760" strokeDasharray="8,2" />
        <text x="600" y="754" textAnchor="middle" fontWeight="bold">{currentFloorTitle}</text>
      </g>

      {/* Compass North Indicator */}
      <g transform="translate(1140, 720) scale(0.75)">
        <circle cx="0" cy="0" r="24" fill="#ffffff" stroke="#0284c7" strokeWidth="1.5" />
        <path d="M 0 -20 L 6 0 L 0 4 L -6 0 Z" fill="#0284c7" />
        <text x="0" y="-26" textAnchor="middle" fontFamily="sans-serif" fontSize="14" fontWeight="900" fill="#0284c7">N</text>
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
  projectName = 'Metro Tower Site',
  contractor = 'Apex Construction',
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

  // Dispersal algorithm: Fan out overlapping or clustered workers so every worker marker is distinct and visible
  const dispersedPeople = useMemo(() => {
    if (!people || people.length === 0) return [];
    
    const visited = new Set<string>();
    const clusters: Person[][] = [];

    people.forEach((p, idx) => {
      if (!p || visited.has(p.id)) return;
      const cluster: Person[] = [p];
      visited.add(p.id);

      people.forEach((otherP, otherIdx) => {
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
          // If worker is moving, maintain their precise walking coordinates
          if (item.presenceState === 'MOVING') {
            result.push({
              ...item,
              displayX: item.x,
              displayY: item.y,
              clusterSize: cluster.length
            });
          } else {
            // Subtle micro-offset for idle workers in the exact same spot (max 1.5%)
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
  }, [people]);

  const activeZones = customZones || zones;
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

  const isCustomFloorplan = Boolean(floorplanUrl && !floorplanUrl.includes('unsplash.com') && floorplanUrl.length > 5);
  const currentBlueprintUrl = isCustomFloorplan
    ? (floorplanUrl as string)
    : getBlueprintSvg(projectId, projectName, contractor, dimensions, mode);

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
      } bg-[#020617]`}
      ref={mapRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div 
        ref={containerRef}
        onClick={handleBlueprintClick}
        className="relative w-full h-full rounded-xl shadow-2xl transition-transform duration-75 ease-out border-4 border-slate-900 overflow-hidden bg-[#090d16]"
        style={{ transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)` }}
      >
        {svgSource ? (
          <div 
            className="absolute inset-0 w-full h-full pointer-events-none" 
            dangerouslySetInnerHTML={{ __html: svgSource }}
          />
        ) : isCustomFloorplan ? (
          <img 
            src={currentBlueprintUrl} 
            alt="Site Blueprint" 
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500 opacity-100"
            loading="eager"
          />
        ) : (
          <InteractiveSiteMap 
            mode={mode}
            activeFloor={activeFloor}
            activeZones={activeZones}
            people={people}
            vehicles={vehicles}
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

           const zoneWorkerCount = (people || []).filter(p => p && p.currentZone && (p.currentZone || "").toLowerCase() === (name || "").toLowerCase()).length;
           
           // Check if any worker position overlaps with this zone's coordinates
           const hasWorkerOverlap = (people || []).some(p => 
             p && p.x >= bounds.x && p.x <= bounds.x + bounds.width &&
             p.y >= bounds.y && p.y <= bounds.y + bounds.height
           );

           const maxCapacity = zoneCapacities[name] || bounds.maxCapacity || (isHazard ? 4 : 10);
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
               className={`absolute border-2 transition-all duration-300 group/zone cursor-pointer ${
                 isHazardActive ? 'bg-rose-600/30 border-rose-600 ring-4 ring-rose-500/60 animate-pulse' :
                 isOverCapacity ? 'bg-rose-600/15 border-rose-600 ring-4 ring-rose-500/30 animate-pulse' :
                 isHazard ? 'bg-rose-500/5 border-rose-500/30' : 
                 isWarning ? 'bg-amber-500/5 border-amber-500/30' : 
                 isMusterPoint && isEvacMode ? 'bg-emerald-500/20 border-emerald-500 ring-4 ring-emerald-500/20 animate-pulse' :
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
                  <span className={`px-1 rounded font-mono text-[9px] ${
                    isHazardActive || isOverCapacity ? 'bg-black text-amber-300 font-extrabold' : 'bg-black/30 text-white'
                  }`}>
                    {zoneWorkerCount}/{maxCapacity} {isHazardActive ? '🚨 BREACH' : isOverCapacity ? '⚠️ OVER' : ''}
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
                      location: 'Active Construction Sector',
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

        {/* Motion Trails with last 60 seconds fading-segment historical effect */}
        {(visibleLayers?.workers ?? true) && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible">
            <defs>
              <linearGradient id="workerTrailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#007BC4" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id="alertTrailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e11d48" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {people.map(p => {
              if (!p.trail || p.trail.length < 2) return null;
              const isAlert = p.ppeStatus === 'NON_COMPLIANT';
              const baseColor = isAlert ? '#f43f5e' : '#0284c7';
              const glowColor = isAlert ? '#fb7185' : '#38bdf8';
              const trailPoints = p.trail;

              return (
                <g key={`trail-worker-${p.id}`} className="transition-all duration-300">
                  {/* Glowing background corridor path */}
                  {trailPoints.slice(0, -1).map((pt, idx) => {
                    const nextPt = trailPoints[idx + 1];
                    const progress = (idx + 1) / trailPoints.length;
                    const opacity = Math.max(0.15, progress * 0.85);
                    const strokeWidth = 1.5 + progress * 2.2;

                    return (
                      <g key={`seg-worker-${p.id}-${idx}`}>
                        {/* Glow halo */}
                        <line
                          x1={`${pt.x}%`}
                          y1={`${pt.y}%`}
                          x2={`${nextPt.x}%`}
                          y2={`${nextPt.y}%`}
                          stroke={glowColor}
                          strokeWidth={strokeWidth + 2.5}
                          strokeOpacity={opacity * 0.35}
                          strokeLinecap="round"
                        />
                        {/* Core neon path line */}
                        <line
                          x1={`${pt.x}%`}
                          y1={`${pt.y}%`}
                          x2={`${nextPt.x}%`}
                          y2={`${nextPt.y}%`}
                          stroke={baseColor}
                          strokeWidth={strokeWidth}
                          strokeOpacity={opacity}
                          strokeLinecap="round"
                        />
                        {/* Footstep waypoint nodes along walking path */}
                        {idx % 2 === 0 && (
                          <circle
                            cx={`${pt.x}%`}
                            cy={`${pt.y}%`}
                            r={1.2 + progress * 1.6}
                            fill={glowColor}
                            fillOpacity={opacity * 0.9}
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Animated directional walking indicator when moving */}
                  {p.presenceState === 'MOVING' && trailPoints.length >= 2 && (
                    <circle
                      cx={`${trailPoints[trailPoints.length - 1].x}%`}
                      cy={`${trailPoints[trailPoints.length - 1].y}%`}
                      r="4"
                      fill="none"
                      stroke={glowColor}
                      strokeWidth="1.5"
                      strokeDasharray="2,2"
                      className="animate-spin"
                    />
                  )}
                </g>
              );
            })}

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
              if (roleLowerVal.includes('superintendent') || roleLowerVal.includes('manager') || roleLowerVal.includes('director')) {
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
                    transition: 'left 0.6s linear, top 0.6s linear'
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
                        <span className="text-[9px] font-black text-slate-100 bg-slate-950/90 px-1.5 py-0.5 rounded-md border border-slate-800 shadow-md truncate max-w-[65px] leading-tight text-center">
                          {(person.name || "").split(' ')[0]}
                        </span>
                      </div>
                    ) : (
                      /* Premium Horizontal Worker Card Container */
                      <div className={`flex items-center gap-2 p-1.5 pl-2 pr-3 rounded-xl bg-slate-950/90 backdrop-blur-md border shadow-2xl transition-all duration-200 group-hover:scale-105 ${
                        isHighlighted 
                          ? 'ring-2 ring-sky-400 border-sky-400 bg-slate-900 shadow-sky-500/30' 
                          : isSos 
                            ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-950/90 shadow-rose-500/40 animate-pulse' 
                            : isAlert 
                              ? 'ring-2 ring-amber-500 border-amber-500 bg-slate-950/90 shadow-amber-500/30 animate-pulse' 
                              : `${roleBorderColor} ${roleGlowShadow}`
                      }`}>
                        <div className="relative shrink-0">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm shadow-md transition-all ${statusRingColor}`}>
                            <span className="leading-none">{avatarEmoji}</span>
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-950 shadow-sm ${
                            isSos ? 'bg-rose-500 animate-pulse' :
                            isAlert ? 'bg-rose-500' :
                            isOffline ? 'bg-slate-500' :
                            isIdle ? 'bg-yellow-500' :
                            isSupervisor ? 'bg-indigo-400' :
                            'bg-emerald-500'
                          }`} />
                        </div>

                        <div className="flex flex-col text-left min-w-[70px]">
                          <div className="text-[10px] font-black text-white leading-tight tracking-wide truncate max-w-[90px]">
                            {person.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] font-bold text-slate-400 leading-none truncate max-w-[55px]">
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
                        className="absolute w-3 h-3 text-sky-400 -top-2" 
                        style={{ transform: `rotate(${person.heading}deg) translateY(-6px)` }}
                      >
                        <Navigation className="w-2.5 h-2.5 fill-sky-400 text-sky-400" />
                      </div>
                    )}

                    {/* Detailed Tooltip on Hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-950 text-white text-[10px] font-bold p-2.5 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50 border border-slate-700/80 min-w-[150px]">
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





      {/* Floating Map Zoom & Pan Action Controls Dock */}
      <div className="absolute bottom-6 left-6 z-40 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-700/80 shadow-2xl pointer-events-auto">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoom(prev => Math.min(3, prev + 0.25));
          }}
          className="h-8 w-8 inline-flex items-center justify-center rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white transition shadow-xs"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoom(prev => Math.max(0.4, prev - 0.25));
          }}
          className="h-8 w-8 inline-flex items-center justify-center rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white transition shadow-xs"
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
          className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white text-[10px] font-black font-mono transition shadow-xs"
          title="Reset Zoom to 100%"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{Math.round(zoom * 100)}%</span>
        </button>

        <div className="h-4 w-px bg-slate-700 mx-0.5" />

        <button
          onClick={(e) => {
            e.stopPropagation();
            setMarkerDensityMode(prev => prev === 'auto' ? 'compact' : prev === 'compact' ? 'full' : 'auto');
          }}
          className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white text-[10px] font-black uppercase tracking-wider transition shadow-xs"
          title="Toggle Marker Density (Auto / Compact Pins / Full Cards)"
        >
          <Users className="w-3.5 h-3.5 text-sky-400" />
          <span>Density: {markerDensityMode}</span>
        </button>
      </div>

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

