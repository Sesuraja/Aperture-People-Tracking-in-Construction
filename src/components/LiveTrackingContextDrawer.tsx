import React, { useState } from 'react';
import { Person } from '../lib/simulation';
import { AssetItem, VehicleItem, InfrastructureItem, CCTVCameraItem, EnvironmentalSensorItem } from '../lib/trackingLayers';
import { 
  X, User, ShieldCheck, ShieldAlert, Clock, MapPin, Battery, Phone, 
  Send, AlertTriangle, FileText, Activity, Radio, Truck, Wrench, Camera, 
  Thermometer, Wind, Eye, Compass, RefreshCw, CheckCircle2, ChevronRight, Zap
} from 'lucide-react';

export type SelectedEntity = 
  | { type: 'person'; data: Person }
  | { type: 'asset'; data: AssetItem }
  | { type: 'vehicle'; data: VehicleItem }
  | { type: 'infrastructure'; data: InfrastructureItem }
  | { type: 'camera'; data: CCTVCameraItem }
  | { type: 'sensor'; data: EnvironmentalSensorItem }
  | null;

interface LiveTrackingContextDrawerProps {
  entity: SelectedEntity;
  onClose: () => void;
  onTrackLive?: (entityId: string) => void;
  onReplayRoute?: (entityId: string) => void;
  onTriggerEmergency?: (subject: string) => void;
}

export default function LiveTrackingContextDrawer({
  entity,
  onClose,
  onTrackLive,
  onReplayRoute,
  onTriggerEmergency
}: LiveTrackingContextDrawerProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'safety' | 'activity'>('profile');
  const [messageText, setMessageText] = useState('');
  const [messageSent, setMessageSent] = useState(false);

  if (!entity) return null;

  const handleSendMessage = () => {
    if (!messageText) return;
    setMessageSent(true);
    setTimeout(() => {
      setMessageText('');
      setMessageSent(false);
    }, 3000);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 md:w-[420px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-in slide-in-from-right duration-300">
      
      {/* Drawer Header */}
      <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#007BC4]/20 border border-[#007BC4]/40 flex items-center justify-center text-[#007BC4] font-black text-lg">
            {entity.type === 'person' && <User className="w-5 h-5 text-sky-400" />}
            {entity.type === 'asset' && <Wrench className="w-5 h-5 text-amber-400" />}
            {entity.type === 'vehicle' && <Truck className="w-5 h-5 text-emerald-400" />}
            {entity.type === 'infrastructure' && <Radio className="w-5 h-5 text-indigo-400" />}
            {entity.type === 'camera' && <Camera className="w-5 h-5 text-purple-400" />}
            {entity.type === 'sensor' && <Thermometer className="w-5 h-5 text-rose-400" />}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {entity.type === 'person' ? 'Workforce Details' : 
               entity.type === 'asset' ? 'Site Asset Record' :
               entity.type === 'vehicle' ? 'Vehicle Telemetry' :
               entity.type === 'infrastructure' ? 'Hardware Reader Portal' :
               entity.type === 'camera' ? 'AI Surveillance Camera' : 'Environmental Sensor'}
            </div>
            <h3 className="text-base font-extrabold text-white truncate max-w-[220px]">
              {entity.type === 'person' ? entity.data.name : entity.data.name}
            </h3>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* WORKFORCE ENTITY DETAILS */}
      {entity.type === 'person' && (() => {
        const p = entity.data;
        const isWarning = p.ppeStatus === 'NON_COMPLIANT' || (p.role === 'Site Inspector / Visitor' && p.currentZone === 'Heavy Crane & Exclusion Area');
        
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {/* Person Banner Card */}
            <div className="p-5 bg-slate-50 border-b border-slate-200">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-slate-200 border-2 border-white shadow-md flex items-center justify-center font-extrabold text-slate-700 text-xl overflow-hidden">
                    {(p.name || "").split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center ${
                    p.presenceState === 'MOVING' ? 'bg-emerald-500' :
                    p.presenceState === 'IDLE' ? 'bg-amber-500' : 'bg-slate-400'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="px-2 py-0.5 rounded-md bg-[#007BC4]/10 text-[#007BC4] font-extrabold text-[10px] uppercase">
                      ID: {p.id}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase border ${
                      isWarning ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}>
                      {isWarning ? '⚠️ Safety Violation' : '✓ Normal Status'}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-slate-900 text-lg leading-tight truncate">{p.name}</h4>
                  <p className="text-xs font-semibold text-slate-500">{p.role}</p>
                  <p className="text-[11px] font-medium text-slate-400 mt-0.5">{p.tradeCompany || 'Aperture Construction Corp'}</p>
                </div>
              </div>

              {/* Quick Status Stats Row */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="p-2 bg-white rounded-xl border border-slate-200 text-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Badge Tag</span>
                  <span className="text-xs font-extrabold font-mono text-slate-800">{p.hardhatTagId || 'RFID-4029'}</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-slate-200 text-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">BLE Battery</span>
                  <span className="text-xs font-extrabold text-emerald-600 flex items-center justify-center gap-1">
                    <Battery className="w-3 h-3" /> 88%
                  </span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-slate-200 text-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Shift</span>
                  <span className="text-xs font-extrabold text-slate-800">Day (07:00)</span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-white px-5 pt-2">
              <button
                onClick={() => setActiveTab('profile')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition ${
                  activeTab === 'profile' ? 'border-[#007BC4] text-[#007BC4]' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Profile & Status
              </button>
              <button
                onClick={() => setActiveTab('safety')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition ${
                  activeTab === 'safety' ? 'border-[#007BC4] text-[#007BC4]' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Safety & Permits
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition ${
                  activeTab === 'activity' ? 'border-[#007BC4] text-[#007BC4]' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Activity & Route
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-5 flex-1 space-y-4">
              {activeTab === 'profile' && (
                <>
                  <div className="space-y-3">
                    {/* Live Telemetry Card */}
                    <div className="p-3 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-sky-400 uppercase tracking-wider flex items-center gap-1">
                          <Zap className="w-3 h-3 text-sky-400" /> Live Physics Telemetry
                        </span>
                        <span className="text-[9px] font-mono font-bold bg-sky-950 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded">
                          {p.rssi ?? -58} dBm RSSI
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                          <span className="text-[9px] text-slate-400 block font-semibold">Real Movement Speed</span>
                          <span className="text-sm font-black font-mono text-emerald-400">
                            {p.speed !== undefined ? `${p.speed} m/s` : p.presenceState === 'MOVING' ? '1.40 m/s' : '0.00 m/s'}
                          </span>
                        </div>
                        <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                          <span className="text-[9px] text-slate-400 block font-semibold">Heading Angle</span>
                          <span className="text-sm font-black font-mono text-sky-300">
                            {p.heading !== undefined ? `${p.heading}°` : '180°'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#007BC4]" />
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Current Zone</span>
                          <span className="text-xs font-extrabold text-slate-900">{p.currentZone}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-extrabold bg-[#007BC4]/10 text-[#007BC4] px-2 py-1 rounded-md">
                        Level 2
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-emerald-500" />
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Dwell Time in Zone</span>
                          <span className="text-xs font-extrabold text-slate-900">{Math.floor(p.dwellTime / 60)}m {p.dwellTime % 60}s</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">
                        Last ping: Just now
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">AI Movement Classification</span>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>{p.activityInsights?.activity || 'Active Walking / Rebar Tying'}</span>
                        <span className="text-emerald-600 font-extrabold">{p.activityInsights?.confidence ? Math.round(p.activityInsights.confidence * 100) : 94}% match</span>
                      </div>
                    </div>
                  </div>

                  {/* Send Direct Message */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <h5 className="text-xs font-extrabold text-slate-800">Send Direct Badge Alert Message</h5>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={messageText}
                        onChange={e => setMessageText(e.target.value)}
                        placeholder="Type safety alert message..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#007BC4]"
                      />
                      <button 
                        onClick={handleSendMessage}
                        className="bg-[#007BC4] hover:bg-[#00619B] text-white px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" /> Send
                      </button>
                    </div>
                    {messageSent && (
                      <p className="text-[11px] font-extrabold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Alert dispatched to worker's UHF hardhat tag speaker!
                      </p>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'safety' && (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      <div>
                        <h5 className="text-xs font-extrabold text-emerald-900">PPE Hardhat & Vest Active</h5>
                        <p className="text-[10px] text-emerald-700 font-medium">UHF RFID sensor tag confirmed active on safety helmet.</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <h5 className="text-xs font-extrabold text-slate-800">Permit to Work (PTW) Status</h5>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-600">Hot Work Permit:</span>
                      <span className="text-emerald-700 font-extrabold bg-emerald-100 px-2 py-0.5 rounded">APPROVED (PTW-2026-99)</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-600">Work at Height Permit:</span>
                      <span className="text-emerald-700 font-extrabold bg-emerald-100 px-2 py-0.5 rounded">VALID (L1-L4)</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <h5 className="text-xs font-extrabold text-slate-800">Safety Certifications</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {(p.certifications || ['OSHA 30-Hour Construction', 'Fall Protection Qualified', 'Rigging Safety Level 2']).map((cert, idx) => (
                        <span key={idx} className="bg-white border border-slate-200 text-slate-700 font-bold text-[10px] px-2 py-1 rounded-md shadow-xs">
                          ✓ {cert}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Emergency Dispatch Contact</span>
                    <p className="text-xs font-extrabold text-slate-800">+1 (555) 019-2834 (Safety Supervisor On-Duty)</p>
                  </div>
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <h5 className="text-xs font-extrabold text-slate-800 flex items-center justify-between">
                      <span>Shift Zone History</span>
                      <span className="text-[10px] text-slate-400 font-mono">Today</span>
                    </h5>

                    <div className="space-y-2 relative pl-4 border-l-2 border-slate-200 text-xs">
                      <div className="relative">
                        <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#007BC4]" />
                        <p className="font-extrabold text-slate-900">{p.currentZone}</p>
                        <p className="text-[10px] text-slate-500 font-medium">Entered at 10:15 AM (Active Now)</p>
                      </div>
                      <div className="relative">
                        <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-300" />
                        <p className="font-bold text-slate-700">Material Laydown & Loading</p>
                        <p className="text-[10px] text-slate-500 font-medium">09:10 AM – 10:15 AM (1h 05m)</p>
                      </div>
                      <div className="relative">
                        <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-300" />
                        <p className="font-bold text-slate-700">Gate 1 / Main Access Gate</p>
                        <p className="text-[10px] text-slate-500 font-medium">Checked in at 07:15 AM</p>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => onReplayRoute?.(p.id)}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#007BC4]" />
                    Replay GPS/UWB Trail on Map
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Actions Drawer Footer */}
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex flex-col gap-2 shrink-0">
              <div className="flex gap-2">
                <button 
                  onClick={() => onTrackLive?.(p.id)}
                  className="flex-1 bg-[#007BC4] hover:bg-[#00619B] text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <MapPin className="w-4 h-4" />
                  Track Live on Map
                </button>

                <button 
                  onClick={() => onTriggerEmergency?.(p.name)}
                  className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Trigger SOS
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ASSET ENTITY DETAILS */}
      {entity.type === 'asset' && (() => {
        const ast = entity.data;
        return (
          <div className="flex-1 p-5 space-y-4 overflow-y-auto">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                {ast.category}
              </span>
              <h4 className="text-base font-extrabold text-slate-900 mt-2">{ast.name}</h4>
              <p className="text-xs font-mono text-slate-500">Asset ID: {ast.id}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Location</span>
                <span className="text-xs font-extrabold text-slate-800">{ast.location}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Operational Status</span>
                <span className="text-xs font-extrabold text-emerald-600">{ast.status}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Utilization Rate</span>
                <span className="text-xs font-extrabold text-slate-900">{ast.utilization}%</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Battery Level</span>
                <span className="text-xs font-extrabold text-slate-900">{ast.battery}%</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Assigned Worker</span>
              <p className="text-xs font-extrabold text-slate-900">{ast.assignedWorker}</p>
            </div>

            <button 
              onClick={() => onTrackLive?.(ast.id)}
              className="w-full bg-[#007BC4] text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-[#00619B] transition"
            >
              <MapPin className="w-4 h-4" /> Locate Asset on Map
            </button>
          </div>
        );
      })()}

      {/* VEHICLE ENTITY DETAILS */}
      {entity.type === 'vehicle' && (() => {
        const veh = entity.data;
        return (
          <div className="flex-1 p-5 space-y-4 overflow-y-auto">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                {veh.type}
              </span>
              <h4 className="text-base font-extrabold text-slate-900 mt-2">{veh.name}</h4>
              <p className="text-xs font-mono text-slate-500">Vehicle ID: {veh.id}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Operator</span>
                <span className="text-xs font-extrabold text-slate-900">{veh.operator}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Current Speed</span>
                <span className="text-xs font-extrabold text-emerald-600">{veh.speed} km/h</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Location Zone</span>
                <span className="text-xs font-extrabold text-slate-900">{veh.location}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Fuel / Charge</span>
                <span className="text-xs font-extrabold text-slate-900">{veh.fuel}%</span>
              </div>
            </div>

            <button 
              onClick={() => onTrackLive?.(veh.id)}
              className="w-full bg-[#007BC4] text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-[#00619B] transition"
            >
              <Truck className="w-4 h-4" /> Center Vehicle on Map
            </button>
          </div>
        );
      })()}

      {/* INFRASTRUCTURE / CCTV / SENSOR DETAILS */}
      {(entity.type === 'infrastructure' || entity.type === 'camera' || entity.type === 'sensor') && (
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl">
            <h4 className="text-base font-extrabold text-slate-900">{entity.data.name}</h4>
            <p className="text-xs font-mono text-slate-500">ID: {entity.data.id}</p>
          </div>

          {entity.type === 'camera' && (
            <div className="space-y-3">
              <div className="aspect-video bg-black rounded-xl overflow-hidden relative group">
                <img 
                  src={`https://images.unsplash.com/photo-1590247813693-5541d1c609fd?auto=format&fit=crop&q=80&w=400&h=225&${entity.data.id}`} 
                  alt="Live Feed" 
                  className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black text-white drop-shadow-md">LIVE RECAP v2.1</span>
                </div>
                {/* AI Overlays */}
                <div className="absolute inset-0 border-2 border-emerald-500/40 m-4 rounded pointer-events-none">
                  <div className="absolute -top-1 -left-1 bg-emerald-500 text-[8px] px-1 text-white font-bold">HARDHAT_DETECTED</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                 <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">AI Model</span>
                    <span className="text-[10px] font-black text-slate-700">YOLOv8 Safety</span>
                 </div>
                 <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Bitrate</span>
                    <span className="text-[10px] font-black text-slate-700">4.2 Mbps</span>
                 </div>
              </div>
            </div>
          )}

          {entity.type === 'sensor' && (
            <div className="space-y-3">
              <div className="p-4 bg-slate-900 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-black text-sky-400">TELEMETRY STREAM</span>
                   <Zap className="w-3 h-3 text-amber-400" />
                </div>
                <div className="flex justify-around items-end h-16 gap-1">
                   {[40, 70, 45, 90, 65, 80, 50, 85, 30, 60, 40, 75].map((h, i) => (
                     <div key={i} className="flex-1 bg-sky-500/40 rounded-t-sm animate-pulse" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
                   ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                 <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">VOC Index</span>
                    <span className="text-[10px] font-black text-emerald-600">Optimal</span>
                 </div>
                 <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">CO2</span>
                    <span className="text-[10px] font-black text-slate-700">412 ppm</span>
                 </div>
                 <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">PM2.5</span>
                    <span className="text-[10px] font-black text-slate-700">12 µg/m³</span>
                 </div>
              </div>
            </div>
          )}

          {entity.type === 'infrastructure' && (
            <div className="space-y-4">
               <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                     <span className="text-xs font-black text-indigo-700 uppercase">Hardware Health</span>
                     <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="space-y-3">
                     <div className="flex justify-between items-center text-[11px] font-bold">
                        <span className="text-slate-500 uppercase">UHF Power</span>
                        <span className="text-slate-900">30 dBm (Max)</span>
                     </div>
                     <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 w-[90%]" />
                     </div>
                     <div className="flex justify-between items-center text-[11px] font-bold">
                        <span className="text-slate-500 uppercase">CPU Load</span>
                        <span className="text-slate-900">14%</span>
                     </div>
                     <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 w-[14%]" />
                     </div>
                  </div>
               </div>
               
               <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                     <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">PoE Status</span>
                     <span className="text-xs font-black text-emerald-600">Active (12.4W)</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                     <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Antenna SWR</span>
                     <span className="text-xs font-black text-slate-800">1.15:1 (Opt)</span>
                  </div>
               </div>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Device Telemetry</span>
            <div className="text-xs font-medium space-y-1 text-slate-700">
              <p><strong>Status:</strong> <span className="text-emerald-600 font-bold">ONLINE</span></p>
              {'ipAddress' in entity.data && <p><strong>IP:</strong> {entity.data.ipAddress}</p>}
              {'recentEvent' in entity.data && <p><strong>AI Event:</strong> {entity.data.recentEvent}</p>}
              {'temperature' in entity.data && <p><strong>Temp:</strong> {entity.data.temperature}°C | <strong>Gas:</strong> {entity.data.gasLevel} ppm</p>}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
