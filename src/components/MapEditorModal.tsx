import React, { useState, useRef } from 'react';
import { 
  Edit3, Plus, Trash2, Image, Save, X, Check,
  RotateCw, Lock, Unlock, Grid, Undo2, Redo2, Copy, Maximize2,
  Building2, Truck, Layers3, Box, ParkingSquare, Home, CornerDownRight, Users,
  AlertTriangle, ShieldAlert, Package, Sliders, ChevronUp, ChevronDown
} from 'lucide-react';

export type ElementCategory = 
  | 'building'
  | 'road'
  | 'scaffolding'
  | 'crane_zone'
  | 'excavation_zone'
  | 'parking'
  | 'storage'
  | 'office'
  | 'emergency_exit'
  | 'assembly_point'
  | 'hazard_zone'
  | 'restricted_zone';

export interface MapElement {
  id: string;
  name: string;
  category: ElementCategory;
  x: number; // Percentage or px
  y: number;
  width: number;
  height: number;
  rotation: number; // Degrees 0-360
  isLocked: boolean;
  groupId?: string | null;
  zIndex: number;
  color?: string;
  borderColor?: string;
  opacity?: number;
  capacity?: number;
  hazardLevel?: 'normal' | 'warning' | 'critical';
  notes?: string;
}

export interface ZoneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  capacity?: number;
  category?: string;
  hazardLevel?: 'normal' | 'warning' | 'critical';
  rotation?: number;
  isLocked?: boolean;
  groupId?: string | null;
  zIndex?: number;
  proximityAlertEnabled?: boolean;
  polygonPoints?: { x: number; y: number }[];
}

interface MapEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  zones: Record<string, ZoneBounds>;
  floorplanUrl: string | null;
  svgSource?: string | null;
  onSaveZones: (updatedZones: Record<string, ZoneBounds>, newFloorplanUrl: string | null, newSvgSource?: string | null) => void;
  siteName?: string;
  buildingName?: string;
  floorName?: string;
}

export const CATEGORY_CONFIG: Record<ElementCategory, { label: string; icon: React.ReactNode; color: string; border: string; bg: string }> = {
  building: { label: 'Building Footprint', icon: <Building2 className="w-4 h-4" />, color: '#007BC4', border: 'border-blue-500', bg: 'bg-blue-500/20' },
  road: { label: 'Site Road / Access Track', icon: <Truck className="w-4 h-4" />, color: '#64748B', border: 'border-slate-500', bg: 'bg-slate-500/20' },
  scaffolding: { label: 'Scaffolding & Decking', icon: <Layers3 className="w-4 h-4" />, color: '#0284C7', border: 'border-sky-500', bg: 'bg-sky-500/20' },
  crane_zone: { label: 'Crane Swing / Lift Radius', icon: <RotateCw className="w-4 h-4" />, color: '#D97706', border: 'border-amber-500', bg: 'bg-amber-500/20' },
  excavation_zone: { label: 'Excavation / Trench Pit', icon: <Box className="w-4 h-4" />, color: '#B45309', border: 'border-amber-700', bg: 'bg-amber-700/20' },
  parking: { label: 'Vehicle Parking & Staging', icon: <ParkingSquare className="w-4 h-4" />, color: '#4F46E5', border: 'border-indigo-500', bg: 'bg-indigo-500/20' },
  storage: { label: 'Material & Rebar Laydown', icon: <Package className="w-4 h-4" />, color: '#7C3AED', border: 'border-purple-500', bg: 'bg-purple-500/20' },
  office: { label: 'Site Office / Container', icon: <Home className="w-4 h-4" />, color: '#9333EA', border: 'border-violet-500', bg: 'bg-violet-500/20' },
  emergency_exit: { label: 'Emergency Exit Route', icon: <CornerDownRight className="w-4 h-4" />, color: '#059669', border: 'border-emerald-500', bg: 'bg-emerald-500/20' },
  assembly_point: { label: 'Emergency Assembly Point', icon: <Users className="w-4 h-4" />, color: '#10B981', border: 'border-emerald-600', bg: 'bg-emerald-600/20' },
  hazard_zone: { label: 'Hazard Caution Zone', icon: <AlertTriangle className="w-4 h-4" />, color: '#EAB308', border: 'border-yellow-500', bg: 'bg-yellow-500/20' },
  restricted_zone: { label: 'Restricted Exclusion Zone', icon: <ShieldAlert className="w-4 h-4" />, color: '#E11D48', border: 'border-rose-600', bg: 'bg-rose-600/25' },
};

function convertZonesToElements(zones: Record<string, ZoneBounds>): MapElement[] {
  return Object.entries(zones).map(([name, b], idx) => {
    let cat: ElementCategory = 'building';
    const lowerCat = (b.category || name).toLowerCase();
    
    if (lowerCat.includes('road') || lowerCat.includes('track')) cat = 'road';
    else if (lowerCat.includes('scaffold')) cat = 'scaffolding';
    else if (lowerCat.includes('crane')) cat = 'crane_zone';
    else if (lowerCat.includes('excavat') || lowerCat.includes('pit') || lowerCat.includes('trench')) cat = 'excavation_zone';
    else if (lowerCat.includes('park') || lowerCat.includes('stag')) cat = 'parking';
    else if (lowerCat.includes('stor') || lowerCat.includes('laydown') || lowerCat.includes('rebar')) cat = 'storage';
    else if (lowerCat.includes('office') || lowerCat.includes('welfare') || lowerCat.includes('trailer')) cat = 'office';
    else if (lowerCat.includes('exit') || lowerCat.includes('egress')) cat = 'emergency_exit';
    else if (lowerCat.includes('muster') || lowerCat.includes('assembl')) cat = 'assembly_point';
    else if (lowerCat.includes('hazard') || b.hazardLevel === 'warning') cat = 'hazard_zone';
    else if (lowerCat.includes('restrict') || lowerCat.includes('voltage') || b.hazardLevel === 'critical') cat = 'restricted_zone';

    return {
      id: `elem-${idx}-${Date.now()}`,
      name,
      category: cat,
      x: b.x || 10,
      y: b.y || 10,
      width: b.width || 25,
      height: b.height || 20,
      rotation: b.rotation || 0,
      isLocked: b.isLocked || false,
      groupId: b.groupId || null,
      zIndex: b.zIndex || idx + 1,
      capacity: b.capacity || 10,
      hazardLevel: b.hazardLevel || (cat === 'restricted_zone' ? 'critical' : cat === 'hazard_zone' ? 'warning' : 'normal'),
    };
  });
}

function convertElementsToZones(elements: MapElement[]): Record<string, ZoneBounds> {
  const result: Record<string, ZoneBounds> = {};
  elements.forEach(elem => {
    result[elem.name] = {
      x: Math.round(elem.x * 10) / 10,
      y: Math.round(elem.y * 10) / 10,
      width: Math.round(elem.width * 10) / 10,
      height: Math.round(elem.height * 10) / 10,
      capacity: elem.capacity,
      category: CATEGORY_CONFIG[elem.category]?.label || (elem.category || "").toUpperCase(),
      hazardLevel: elem.hazardLevel,
      rotation: elem.rotation,
      isLocked: elem.isLocked,
      groupId: elem.groupId,
      zIndex: elem.zIndex,
    };
  });
  return result;
}

export default function MapEditorModal({
  isOpen,
  onClose,
  zones,
  floorplanUrl,
  svgSource,
  onSaveZones,
  siteName = 'Metro Tower Site',
  buildingName = 'Main Building A',
  floorName = 'Level 1'
}: MapEditorModalProps) {
  if (!isOpen) return null;

  // Primary state
  const [elements, setElements] = useState<MapElement[]>(() => convertZonesToElements(zones));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customFloorplan, setCustomFloorplan] = useState<string>(floorplanUrl || '');
  const [customSvg, setCustomSvg] = useState<string>(svgSource || '');
  
  // Grid & Editor Controls
  const [snapGrid, setSnapGrid] = useState(true);
  const [gridSize, setGridSize] = useState<number>(5); // 5% snap
  const [showGrid, setShowGrid] = useState(true);
  const [newElementName, setNewElementName] = useState('');
  const [newElementCategory, setNewElementCategory] = useState<ElementCategory>('scaffolding');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<MapElement[][]>([convertZonesToElements(zones)]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Canvas Interaction Ref & State
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggedElemId, setDraggedElemId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [resizingElemId, setResizingElemId] = useState<string | null>(null);

  const activeElement = elements.find(e => selectedIds.includes(e.id)) || null;

  // Push history state snapshot
  const pushHistory = (newElements: MapElement[]) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push(JSON.parse(JSON.stringify(newElements)));
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = historyIndex - 1;
      setHistoryIndex(prev);
      setElements(JSON.parse(JSON.stringify(history[prev])));
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = historyIndex + 1;
      setHistoryIndex(next);
      setElements(JSON.parse(JSON.stringify(history[next])));
    }
  };

  const applySnap = (val: number): number => {
    if (!snapGrid || gridSize <= 0) return Math.round(val * 10) / 10;
    return Math.round(val / gridSize) * gridSize;
  };

  // Add New Map Element
  const handleAddElement = () => {
    const name = newElementName.trim() || `${CATEGORY_CONFIG[newElementCategory].label} ${elements.length + 1}`;
    
    // Default size based on category
    let w = 25, h = 20;
    if (newElementCategory === 'road') { w = 80; h = 10; }
    else if (newElementCategory === 'crane_zone') { w = 30; h = 30; }
    else if (newElementCategory === 'emergency_exit' || newElementCategory === 'assembly_point') { w = 15; h = 12; }

    const newElem: MapElement = {
      id: `elem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      category: newElementCategory,
      x: applySnap(30 + (elements.length % 5) * 5),
      y: applySnap(30 + (elements.length % 5) * 5),
      width: w,
      height: h,
      rotation: 0,
      isLocked: false,
      groupId: null,
      zIndex: elements.length + 1,
      capacity: 15,
      hazardLevel: newElementCategory === 'restricted_zone' ? 'critical' : newElementCategory === 'hazard_zone' ? 'warning' : 'normal',
    };

    const nextElements = [...elements, newElem];
    setElements(nextElements);
    setSelectedIds([newElem.id]);
    setNewElementName('');
    pushHistory(nextElements);
  };

  // Delete Element
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    const nextElements = elements.filter(e => !selectedIds.includes(e.id));
    setElements(nextElements);
    setSelectedIds([]);
    pushHistory(nextElements);
  };

  // Duplicate Selected
  const handleDuplicateSelected = () => {
    if (selectedIds.length === 0) return;
    const toDuplicate = elements.filter(e => selectedIds.includes(e.id));
    const newItems: MapElement[] = toDuplicate.map(e => ({
      ...e,
      id: `elem-${Date.now()}-${Math.random()}`,
      name: `${e.name} (Copy)`,
      x: applySnap(Math.min(85, e.x + 5)),
      y: applySnap(Math.min(85, e.y + 5)),
      isLocked: false,
      zIndex: elements.length + 1,
    }));
    const nextElements = [...elements, ...newItems];
    setElements(nextElements);
    setSelectedIds(newItems.map(i => i.id));
    pushHistory(nextElements);
  };

  // Update Single Element
  const handleUpdateElement = (id: string, updates: Partial<MapElement>) => {
    const nextElements = elements.map(e => e.id === id ? { ...e, ...updates } : e);
    setElements(nextElements);
    pushHistory(nextElements);
  };

  // Group Selected Elements
  const handleGroupSelected = () => {
    if (selectedIds.length < 2) return;
    const newGroupId = `group-${Date.now()}`;
    const nextElements = elements.map(e => selectedIds.includes(e.id) ? { ...e, groupId: newGroupId } : e);
    setElements(nextElements);
    pushHistory(nextElements);
  };

  // Ungroup Selected Elements
  const handleUngroupSelected = () => {
    if (selectedIds.length === 0) return;
    const nextElements = elements.map(e => selectedIds.includes(e.id) ? { ...e, groupId: null } : e);
    setElements(nextElements);
    pushHistory(nextElements);
  };

  // Toggle Lock
  const handleToggleLock = (id: string) => {
    const target = elements.find(e => e.id === id);
    if (!target) return;
    handleUpdateElement(id, { isLocked: !target.isLocked });
  };

  // Layer Ordering: Z-Index controls
  const handleBringToFront = (id: string) => {
    const maxZ = Math.max(...elements.map(e => e.zIndex), 0);
    handleUpdateElement(id, { zIndex: maxZ + 1 });
  };

  const handleSendToBack = (id: string) => {
    const minZ = Math.min(...elements.map(e => e.zIndex), 1);
    handleUpdateElement(id, { zIndex: Math.max(0, minZ - 1) });
  };

  const handleMoveLayerUp = (id: string) => {
    const target = elements.find(e => e.id === id);
    if (!target) return;
    handleUpdateElement(id, { zIndex: target.zIndex + 1 });
  };

  const handleMoveLayerDown = (id: string) => {
    const target = elements.find(e => e.id === id);
    if (!target) return;
    handleUpdateElement(id, { zIndex: Math.max(0, target.zIndex - 1) });
  };

  // Mouse Dragging on Canvas
  const handleMouseDownElement = (e: React.MouseEvent, elem: MapElement) => {
    if (elem.isLocked) return;
    e.stopPropagation();

    // Group Selection Check
    if (elem.groupId) {
      const groupMembers = elements.filter(item => item.groupId === elem.groupId).map(i => i.id);
      setSelectedIds(groupMembers);
    } else {
      if (e.shiftKey) {
        setSelectedIds(prev => prev.includes(elem.id) ? prev.filter(id => id !== elem.id) : [...prev, elem.id]);
      } else {
        setSelectedIds([elem.id]);
      }
    }

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 100;
      const clickY = ((e.clientY - rect.top) / rect.height) * 100;
      setDraggedElemId(elem.id);
      setDragOffset({ x: clickX - elem.x, y: clickY - elem.y });
    }
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currX = ((e.clientX - rect.left) / rect.width) * 100;
    const currY = ((e.clientY - rect.top) / rect.height) * 100;

    if (draggedElemId) {
      const elem = elements.find(item => item.id === draggedElemId);
      if (!elem || elem.isLocked) return;

      const newX = applySnap(Math.max(0, Math.min(100 - elem.width, currX - dragOffset.x)));
      const newY = applySnap(Math.max(0, Math.min(100 - elem.height, currY - dragOffset.y)));

      if (elem.groupId) {
        const deltaX = newX - elem.x;
        const deltaY = newY - elem.y;
        setElements(prev => prev.map(item => item.groupId === elem.groupId ? {
          ...item,
          x: Math.max(0, Math.min(100 - item.width, item.x + deltaX)),
          y: Math.max(0, Math.min(100 - item.height, item.y + deltaY))
        } : item));
      } else {
        setElements(prev => prev.map(item => item.id === draggedElemId ? { ...item, x: newX, y: newY } : item));
      }
    } else if (resizingElemId) {
      const elem = elements.find(item => item.id === resizingElemId);
      if (!elem || elem.isLocked) return;

      const newWidth = applySnap(Math.max(5, Math.min(100 - elem.x, currX - elem.x)));
      const newHeight = applySnap(Math.max(5, Math.min(100 - elem.y, currY - elem.y)));

      setElements(prev => prev.map(item => item.id === resizingElemId ? { ...item, width: newWidth, height: newHeight } : item));
    }
  };

  const handleMouseUpCanvas = () => {
    if (draggedElemId || resizingElemId) {
      setDraggedElemId(null);
      setResizingElemId(null);
      pushHistory(elements);
    }
  };

  // Save changes back to parent
  const handleSave = () => {
    const updatedZones = convertElementsToZones(elements);
    onSaveZones(updatedZones, customFloorplan.trim() || null, customSvg.trim() || null);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-7xl overflow-hidden flex flex-col my-auto max-h-[95vh] h-[900px]">
        
        {/* Modal Top Header Bar */}
        <div className="bg-slate-950 text-white p-4 px-6 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#007BC4]/20 border border-[#007BC4]/40 text-[#007BC4] rounded-xl">
              <Edit3 className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-white tracking-tight">Interactive Map Canvas & Vector Zone Editor</h3>
                <span className="px-2 py-0.5 bg-[#007BC4] text-white text-[10px] font-mono font-bold rounded-full uppercase">
                  {siteName} • {buildingName} • {floorName}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Drag, resize, rotate, group, lock & structure elements across 12 infrastructure categories.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl transition flex items-center gap-1 text-xs font-bold"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
              <span className="hidden sm:inline">Undo</span>
            </button>

            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl transition flex items-center gap-1 text-xs font-bold"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
              <span className="hidden sm:inline">Redo</span>
            </button>

            <div className="h-5 w-[1px] bg-slate-800 mx-1" />

            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editor Toolbar */}
        <div className="bg-slate-100 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 p-3 px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs font-semibold">
          
          {/* Left Controls: Add Category Element & Quick Snap */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="New element name..."
                value={newElementName}
                onChange={e => setNewElementName(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#007BC4] w-44"
              />
              <select
                value={newElementCategory}
                onChange={e => setNewElementCategory(e.target.value as ElementCategory)}
                className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white outline-none"
              >
                {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => (
                  <option key={cat} value={cat}>{cfg.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddElement}
                className="px-3 py-1.5 bg-[#007BC4] hover:bg-[#0062a0] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                Add Element
              </button>
            </div>

            <div className="h-5 w-[1px] bg-slate-300 dark:bg-slate-700" />

            {/* Grid Snap Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSnapGrid(!snapGrid)}
                className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 font-bold transition ${snapGrid ? 'bg-sky-50 dark:bg-sky-950/60 text-[#007BC4] border-sky-300 dark:border-sky-700' : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-300'}`}
              >
                <Grid className="w-3.5 h-3.5" />
                Snap: {snapGrid ? `${gridSize}%` : 'Off'}
              </button>
              {snapGrid && (
                <select
                  value={gridSize}
                  onChange={e => setGridSize(Number(e.target.value))}
                  className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold"
                >
                  <option value={2}>2% Grid</option>
                  <option value={5}>5% Grid</option>
                  <option value={10}>10% Grid</option>
                  <option value={20}>20% Grid</option>
                </select>
              )}
            </div>
          </div>

          {/* Right Controls: Grouping, Locking, Layering for Selected */}
          {activeElement && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-500 font-extrabold uppercase mr-1">
                Selected: {selectedIds.length > 1 ? `${selectedIds.length} Items` : activeElement.name}
              </span>

              {selectedIds.length >= 2 && (
                <button
                  type="button"
                  onClick={handleGroupSelected}
                  className="px-2.5 py-1 bg-purple-50 dark:bg-purple-950/50 text-purple-600 border border-purple-200 dark:border-purple-800 rounded-lg font-bold hover:bg-purple-100 transition"
                >
                  Group ({selectedIds.length})
                </button>
              )}

              {activeElement.groupId && (
                <button
                  type="button"
                  onClick={handleUngroupSelected}
                  className="px-2.5 py-1 bg-purple-50 dark:bg-purple-950/50 text-purple-600 border border-purple-200 dark:border-purple-800 rounded-lg font-bold hover:bg-purple-100 transition"
                >
                  Ungroup
                </button>
              )}

              <button
                type="button"
                onClick={() => handleToggleLock(activeElement.id)}
                className={`p-1.5 rounded-lg border font-bold transition ${activeElement.isLocked ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-slate-700 border-slate-300'}`}
                title={activeElement.isLocked ? 'Unlock Element' : 'Lock Element'}
              >
                {activeElement.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={handleDuplicateSelected}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 transition"
                title="Duplicate Element"
              >
                <Copy className="w-4 h-4" />
              </button>

              <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />

              {/* Layer Z-Index */}
              <button
                type="button"
                onClick={() => handleBringToFront(activeElement.id)}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 transition"
                title="Bring to Front"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleSendToBack(activeElement.id)}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 transition"
                title="Send to Back"
              >
                <ChevronDown className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleDeleteSelected}
                className="p-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-100 transition"
                title="Delete Selected"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>

        {/* Workspace Main Grid */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
          
          {/* Left Column: Element Manager List */}
          <div className="w-full md:w-80 bg-slate-50 dark:bg-slate-900/80 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto max-h-[250px] md:max-h-none">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                Map Elements ({elements.length})
              </span>
              <div className="flex items-center gap-2">
                {elements.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setElements([]);
                      setSelectedIds([]);
                      pushHistory([]);
                    }}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200"
                  >
                    Clear All
                  </button>
                )}
                <span className="text-[10px] text-slate-400 font-mono">
                  Z-Stacking Active
                </span>
              </div>
            </div>

            <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
              {elements
                .sort((a, b) => b.zIndex - a.zIndex)
                .map(elem => {
                  const cfg = CATEGORY_CONFIG[elem.category] || CATEGORY_CONFIG.building;
                  const isSelected = selectedIds.includes(elem.id);

                  return (
                    <div
                      key={elem.id}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          setSelectedIds(prev => prev.includes(elem.id) ? prev.filter(id => id !== elem.id) : [...prev, elem.id]);
                        } else {
                          setSelectedIds([elem.id]);
                        }
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                        isSelected 
                          ? 'bg-[#007BC4] text-white border-[#007BC4] shadow-md' 
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`p-1 rounded ${isSelected ? 'text-white' : 'text-[#007BC4]'}`}>
                          {cfg.icon}
                        </span>
                        <div className="truncate">
                          <div className="truncate font-black">{elem.name}</div>
                          <div className={`text-[9px] font-mono opacity-80 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                            {cfg.label} • z:{elem.zIndex}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {elem.isLocked && <Lock className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-amber-500'}`} />}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateElement(elem.id, { isLocked: !elem.isLocked });
                          }}
                          className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition ${isSelected ? 'text-white' : 'text-slate-400'}`}
                        >
                          {elem.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = elements.filter(item => item.id !== elem.id);
                            setElements(next);
                            setSelectedIds(prev => prev.filter(id => id !== elem.id));
                            pushHistory(next);
                          }}
                          className={`p-1 rounded hover:bg-rose-500 hover:text-white transition ${isSelected ? 'text-rose-200' : 'text-slate-400 hover:text-rose-500'}`}
                          title={`Delete ${elem.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Middle Column: Interactive Vector Canvas */}
          <div className="flex-1 bg-slate-900 p-4 flex flex-col relative overflow-hidden items-center justify-center">
            
            <div className="absolute top-3 left-4 z-10 flex items-center gap-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-bold text-slate-300">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Vector Canvas
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">Click & Drag to Move • Drag Corners to Resize</span>
            </div>

            {/* Canvas Box */}
            <div 
              ref={canvasRef}
              onMouseMove={handleMouseMoveCanvas}
              onMouseUp={handleMouseUpCanvas}
              onMouseLeave={handleMouseUpCanvas}
              className="w-full h-full relative rounded-2xl border-2 border-slate-800 bg-slate-950 overflow-hidden shadow-2xl select-none cursor-default"
              style={{
                backgroundImage: showGrid 
                  ? `radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)`
                  : 'none',
                backgroundSize: `${gridSize * 10}px ${gridSize * 10}px`
              }}
            >
              {/* Optional Custom SVG Floorplan Overlay */}
              {customSvg ? (
                <div 
                  className="absolute inset-0 opacity-40 pointer-events-none overflow-hidden" 
                  dangerouslySetInnerHTML={{ __html: customSvg }} 
                />
              ) : customFloorplan ? (
                <img src={customFloorplan} alt="Site Blueprint" className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none text-white text-6xl font-black tracking-widest uppercase">
                  VECTOR MAP DIGITAL TWIN
                </div>
              )}

              {/* Render Map Elements on Canvas */}
              {elements.map(elem => {
                const cfg = CATEGORY_CONFIG[elem.category] || CATEGORY_CONFIG.building;
                const isSelected = selectedIds.includes(elem.id);
                const isHazard = elem.hazardLevel === 'critical' || elem.category === 'restricted_zone';
                const isWarning = elem.hazardLevel === 'warning' || elem.category === 'hazard_zone';

                let borderStyle = cfg.border;
                let bgStyle = cfg.bg;

                if (isHazard) {
                  borderStyle = 'border-rose-600';
                  bgStyle = 'bg-rose-600/30';
                } else if (isWarning) {
                  borderStyle = 'border-amber-500';
                  bgStyle = 'bg-amber-500/25';
                }

                return (
                  <div
                    key={elem.id}
                    onMouseDown={(e) => handleMouseDownElement(e, elem)}
                    className={`absolute border-2 rounded-xl p-2 transition-all flex flex-col justify-between group ${borderStyle} ${bgStyle} ${
                      isSelected ? 'ring-4 ring-[#007BC4] z-50 shadow-2xl scale-[1.01]' : ''
                    } ${elem.isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-grab active:cursor-grabbing'}`}
                    style={{
                      left: `${elem.x}%`,
                      top: `${elem.y}%`,
                      width: `${elem.width}%`,
                      height: `${elem.height}%`,
                      transform: `rotate(${elem.rotation || 0}deg)`,
                      zIndex: elem.zIndex,
                    }}
                  >
                    {/* Header Label */}
                    <div className="flex items-center justify-between gap-1 text-white text-[10px] font-black tracking-wider truncate">
                      <div className="flex items-center gap-1 truncate">
                        <span>{cfg.icon}</span>
                        <span className="truncate">{elem.name}</span>
                      </div>
                      {elem.isLocked && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                    </div>

                    {/* Footer Info */}
                    <div className="text-[8px] font-mono text-slate-300 opacity-90 flex items-center justify-between mt-auto pt-1">
                      <span className="uppercase">{cfg.label}</span>
                      {elem.capacity && <span>Cap: {elem.capacity}</span>}
                    </div>

                    {/* Interactive Resize Handle on Corner */}
                    {isSelected && !elem.isLocked && (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingElemId(elem.id);
                        }}
                        className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-[#007BC4] border-2 border-white rounded-full cursor-se-resize shadow-lg z-50 flex items-center justify-center"
                        title="Resize Element"
                      >
                        <Maximize2 className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          </div>

          {/* Right Column: Element Properties & Blueprint Settings */}
          <div className="w-full md:w-80 bg-slate-50 dark:bg-slate-900/80 p-5 flex flex-col gap-5 shrink-0 overflow-y-auto">
            
            {activeElement ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#007BC4]" />
                    <h4 className="font-black text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                      Element Parameters
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ID: {activeElement.id.slice(-6)}
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                    Element Title
                  </label>
                  <input
                    type="text"
                    value={activeElement.name}
                    onChange={e => handleUpdateElement(activeElement.id, { name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#007BC4]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                    Infrastructure Category
                  </label>
                  <select
                    value={activeElement.category}
                    onChange={e => handleUpdateElement(activeElement.id, { category: e.target.value as ElementCategory })}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white"
                  >
                    {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => (
                      <option key={cat} value={cat}>{cfg.label}</option>
                    ))}
                  </select>
                </div>

                {/* Bounds (X, Y, W, H, Rotation) */}
                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Spatial Geometry (% of Canvas)
                  </span>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">X Position</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={activeElement.x}
                        onChange={e => handleUpdateElement(activeElement.id, { x: applySnap(Number(e.target.value)) })}
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border rounded font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Y Position</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={activeElement.y}
                        onChange={e => handleUpdateElement(activeElement.id, { y: applySnap(Number(e.target.value)) })}
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border rounded font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Width</label>
                      <input
                        type="number"
                        min="5"
                        max="100"
                        value={activeElement.width}
                        onChange={e => handleUpdateElement(activeElement.id, { width: applySnap(Number(e.target.value)) })}
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border rounded font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Height</label>
                      <input
                        type="number"
                        min="5"
                        max="100"
                        value={activeElement.height}
                        onChange={e => handleUpdateElement(activeElement.id, { height: applySnap(Number(e.target.value)) })}
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border rounded font-bold"
                      />
                    </div>
                  </div>

                  {/* Rotation Controls */}
                  <div>
                    <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase mb-1">
                      <span>Rotation Angle</span>
                      <span>{activeElement.rotation || 0}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="15"
                        value={activeElement.rotation || 0}
                        onChange={e => handleUpdateElement(activeElement.id, { rotation: Number(e.target.value) })}
                        className="flex-1 accent-[#007BC4]"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateElement(activeElement.id, { rotation: ((activeElement.rotation || 0) + 90) % 360 })}
                        className="p-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-xs font-bold"
                        title="Rotate +90°"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Capacity & Hazard Level */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                      Max Capacity
                    </label>
                    <input
                      type="number"
                      value={activeElement.capacity || 10}
                      onChange={e => handleUpdateElement(activeElement.id, { capacity: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                      EHS Hazard Level
                    </label>
                    <select
                      value={activeElement.hazardLevel || 'normal'}
                      onChange={e => handleUpdateElement(activeElement.id, { hazardLevel: e.target.value as any })}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                    >
                      <option value="normal">Standard</option>
                      <option value="warning">Warning / Caution</option>
                      <option value="critical">Critical Exclusion</option>
                    </select>
                  </div>
                </div>

              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 font-medium border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                Click any element on the map or list to modify coordinates, rotation, category, locking & layering.
              </div>
            )}

            {/* Blueprint Overlay Image / SVG Panel */}
            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 mt-auto">
              <label className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">
                <Image className="w-4 h-4 text-[#007BC4]" />
                Blueprint / SVG Graphic Overlay
              </label>

              <div>
                <span className="text-[10px] text-slate-400 font-bold block mb-1">Image Blueprint URL (PNG/JPG)</span>
                <input
                  type="url"
                  placeholder="https://example.com/blueprint.png"
                  value={customFloorplan}
                  onChange={e => setCustomFloorplan(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold block mb-1">Raw Vector SVG Source (`&lt;svg&gt;...&lt;/svg&gt;`)</span>
                <textarea
                  rows={2}
                  placeholder="Paste <svg> XML source string here..."
                  value={customSvg}
                  onChange={e => setCustomSvg(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-mono text-slate-800 dark:text-slate-200 resize-none"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 px-6 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {saveSuccess ? (
              <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Vector Map Layout Saved & Synchronized!
              </span>
            ) : (
              `Configured ${elements.length} layout elements across ${siteName}.`
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold rounded-xl text-xs transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-[#007BC4] hover:bg-[#0062a0] text-white font-bold rounded-xl text-xs shadow-md flex items-center gap-2 transition"
            >
              <Save className="w-4 h-4" />
              Save Digital Twin Vector Map
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
