import React, { useState } from 'react';
import { AssetItem, VehicleItem, CCTVCameraItem, EnvironmentalSensorItem } from '../lib/trackingLayers';
import { Wrench, Truck, Camera, Thermometer, Plus, Trash2, Edit3, X, Check, Box, Shield, Zap } from 'lucide-react';

export type AssetCategoryType = 'asset' | 'vehicle' | 'camera' | 'sensor';

export interface GenericAsset {
  id: string;
  name: string;
  category: AssetCategoryType;
  type?: string;
  zone: string;
  status?: string;
  batteryLevel?: number;
  fuelLevel?: number;
  operator?: string;
  temperature?: number;
  dustPM25?: number;
  aiStatus?: string;
  x: number;
  y: number;
}

interface ManageAssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableZones: string[];
  assets: AssetItem[];
  vehicles: VehicleItem[];
  cameras: CCTVCameraItem[];
  sensors: EnvironmentalSensorItem[];
  onSaveAsset: (item: GenericAsset) => void;
  onDeleteAsset: (id: string, category: AssetCategoryType) => void;
}

export default function ManageAssetsModal({
  isOpen,
  onClose,
  availableZones,
  assets,
  vehicles,
  cameras,
  sensors,
  onSaveAsset,
  onDeleteAsset
}: ManageAssetsModalProps) {
  if (!isOpen) return null;

  // Combine into single manageable list
  const combinedList: GenericAsset[] = [
    ...assets.map(a => ({ id: a.id, name: a.name, category: 'asset' as AssetCategoryType, type: a.category, zone: a.location, status: a.status, batteryLevel: a.battery, x: a.x, y: a.y })),
    ...vehicles.map(v => ({ id: v.id, name: v.name, category: 'vehicle' as AssetCategoryType, type: v.type, zone: v.location, status: v.status, fuelLevel: v.fuel, operator: v.operator, x: v.x, y: v.y })),
    ...cameras.map(c => ({ id: c.id, name: c.name, category: 'camera' as AssetCategoryType, zone: c.zone, status: c.status, aiStatus: c.aiStatus, x: c.x, y: c.y })),
    ...sensors.map(s => ({ id: s.id, name: s.id, category: 'sensor' as AssetCategoryType, zone: s.zone, status: s.status, temperature: s.temperature, dustPM25: s.dustPM25, x: s.x, y: s.y }))
  ];

  const [selectedAsset, setSelectedAsset] = useState<GenericAsset | null>(combinedList[0] || null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const [formData, setFormData] = useState<GenericAsset>({
    id: `AST-${Math.floor(1000 + Math.random() * 9000)}`,
    name: '',
    category: 'asset',
    type: 'Heavy Tool / Machinery',
    zone: availableZones[0] || 'Material Laydown & Loading',
    status: 'In Use',
    batteryLevel: 95,
    fuelLevel: 80,
    operator: 'Assigned Crew',
    temperature: 24,
    dustPM25: 18,
    aiStatus: 'Active',
    x: 45,
    y: 45
  });

  const handleSelectAsset = (item: GenericAsset) => {
    setIsAddingNew(false);
    setSelectedAsset(item);
    setFormData({ ...item });
  };

  const handleStartAdding = () => {
    setIsAddingNew(true);
    setSelectedAsset(null);
    setFormData({
      id: `AST-${Math.floor(1000 + Math.random() * 9000)}`,
      name: '',
      category: 'asset',
      type: 'Power Generator 50kW',
      zone: availableZones[0] || 'Material Laydown & Loading',
      status: 'In Use',
      batteryLevel: 100,
      fuelLevel: 90,
      operator: 'Site Foreman',
      temperature: 22,
      dustPM25: 12,
      aiStatus: 'Active Safety Eye',
      x: 35 + Math.floor(Math.random() * 30),
      y: 35 + Math.floor(Math.random() * 30)
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name && formData.category !== 'sensor') return;
    
    onSaveAsset(formData);
    setIsAddingNew(false);
    setSelectedAsset(formData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col my-6 max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white">Equipment, Vehicles & Sensor Layer Manager</h3>
              <p className="text-xs text-slate-400">Add & position heavy machinery, cranes, AI CCTV cameras & environmental sensors on site floorplan</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Layout */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
          
          {/* Left Column: List */}
          <div className="w-full md:w-80 bg-slate-50 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto max-h-[280px] md:max-h-none">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Site Assets ({combinedList.length})</span>
              <button
                type="button"
                onClick={handleStartAdding}
                className="bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" /> Create Asset
              </button>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {combinedList.map(item => {
                const isActive = !isAddingNew && selectedAsset?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectAsset(item)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                      isActive 
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                        : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-extrabold truncate text-sm flex items-center gap-1.5">
                        {item.category === 'asset' && <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        {item.category === 'vehicle' && <Truck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                        {item.category === 'camera' && <Camera className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                        {item.category === 'sensor' && <Thermometer className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        {item.name || item.id}
                      </div>
                      <div className={`text-[10px] font-mono mt-0.5 ${isActive ? 'text-slate-400' : 'text-slate-500'}`}>
                        {item.id} • Zone: {item.zone}
                      </div>
                    </div>
                    <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                      {item.category}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Asset Form */}
          <div className="flex-1 p-6 overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-5">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Box className="w-4 h-4 text-amber-600" />
                  {isAddingNew ? 'Create New Machinery / Sensor Asset' : `Edit Asset: ${selectedAsset?.name}`}
                </h4>
                {!isAddingNew && selectedAsset && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete ${selectedAsset.name || selectedAsset.id}?`)) {
                        onDeleteAsset(selectedAsset.id, selectedAsset.category);
                        setSelectedAsset(combinedList.find(i => i.id !== selectedAsset.id) || null);
                      }
                    }}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Asset
                  </button>
                )}
              </div>

              {/* Category & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Asset Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as AssetCategoryType }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                  >
                    <option value="asset">Heavy Tool / Machinery Asset</option>
                    <option value="vehicle">Heavy Machinery / Transport Vehicle</option>
                    <option value="camera">AI CCTV Security Camera</option>
                    <option value="sensor">Environmental Dust & Temp Sensor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Asset Title / Identifier</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Caterpillar 320 Excavator"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#007BC4] outline-none"
                  />
                </div>
              </div>

              {/* Zone & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Assigned Zone / Sector</label>
                  <select
                    value={formData.zone}
                    onChange={e => setFormData(prev => ({ ...prev, zone: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                  >
                    {availableZones.map(z => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Operational Status</label>
                  <select
                    value={formData.status || 'In Use'}
                    onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                  >
                    <option value="In Use">Active / In Use</option>
                    <option value="Standby">Standby / Idle</option>
                    <option value="Warning">Warning / Maintenance Required</option>
                    <option value="Offline">Offline / Transport</option>
                  </select>
                </div>
              </div>

              {/* Specific fields depending on category */}
              {formData.category === 'vehicle' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Assigned Operator</label>
                    <input
                      type="text"
                      value={formData.operator || ''}
                      onChange={e => setFormData(prev => ({ ...prev, operator: e.target.value }))}
                      placeholder="e.g. Marcus Vance"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Fuel / Charge Level (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.fuelLevel || 80}
                      onChange={e => setFormData(prev => ({ ...prev, fuelLevel: Number(e.target.value) }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Coordinates */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">Map Location Coordinates (% of Blueprint)</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">X Position (%)</label>
                    <input
                      type="number"
                      min="2"
                      max="98"
                      value={formData.x}
                      onChange={e => setFormData(prev => ({ ...prev, x: Number(e.target.value) }))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Y Position (%)</label>
                    <input
                      type="number"
                      min="2"
                      max="98"
                      value={formData.y}
                      onChange={e => setFormData(prev => ({ ...prev, y: Number(e.target.value) }))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {isAddingNew ? 'Create & Place Asset' : 'Save Asset Parameters'}
                </button>
              </div>

            </form>
          </div>

        </div>

      </div>
    </div>
  );
}
