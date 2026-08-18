import React, { useState } from 'react';
import { Radio, X, Check, Activity, ShieldAlert, Cpu, Sliders, Zap, Wifi, RefreshCw, Trash2 } from 'lucide-react';

export interface HardwareDevice {
  id: string;
  name: string;
  macAddress: string;
  ipAddress: string;
  port: number;
  x: number;
  y: number;
  zone: string;
  type: string;
  orientation: 'horizontal' | 'vertical';
  powerDbm: number;
  antennaGainDbi: number;
  frequencyBand: string;
  scanIntervalMs: number;
  rssiThreshold: number;
  status: 'Online' | 'Maintenance' | 'Offline';
  alertsEnabled: {
    unauthorizedAccess: boolean;
    ppeViolation: boolean;
    loiteringDwell: boolean;
  };
}

interface HardwareConfigModalProps {
  device: HardwareDevice | null;
  availableZones: string[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedDevice: HardwareDevice) => void;
  onDelete?: (deviceId: string) => void;
  isNew?: boolean;
}

export default function HardwareConfigModal({
  device,
  availableZones,
  isOpen,
  onClose,
  onSave,
  onDelete,
  isNew = false
}: HardwareConfigModalProps) {
  if (!isOpen || !device) return null;

  const [formData, setFormData] = useState<HardwareDevice>({ ...device });
  const [activeTab, setActiveTab] = useState<'rfid' | 'network' | 'alerts' | 'diagnostics'>('rfid');
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  React.useEffect(() => {
    if (device) {
      setFormData({ ...device });
    }
  }, [device]);

  const handleChange = (field: keyof HardwareDevice, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAlertChange = (field: keyof HardwareDevice['alertsEnabled'], value: boolean) => {
    setFormData(prev => ({
      ...prev,
      alertsEnabled: {
        ...prev.alertsEnabled,
        [field]: value
      }
    }));
  };

  const handleRunDiagnostic = () => {
    setIsRunningDiagnostic(true);
    setDiagnosticResult(null);
    setTimeout(() => {
      setIsRunningDiagnostic(false);
      setDiagnosticResult(`✓ Hardware Diagnostic Complete:
• Coverage Radius: 18.5m (Power Output: ${formData.powerDbm} dBm)
• Dead Zones Detected: None in active sector (${formData.zone})
• Signal Health & RSSI: -${Math.abs(formData.rssiThreshold || 70)} dBm cutoff | SWR 1.12:1 Optimal
• Coverage Overlap: 12% adjacent overlap with secondary gateway (Good redundancy)
• Tag Integrity Check: 0 ghost tags detected, 0 missing reader heartbeats
• Anti-Collision Engine: Duplicate reads filtered (120 tags/sec throughput active)`);
    }, 1200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col my-8">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${formData.status === 'Online' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : formData.status === 'Maintenance' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-700 text-slate-300'}`}>
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg text-white">{formData.name}</h3>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${formData.status === 'Online' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-amber-500/20 text-amber-300'}`}>
                  {formData.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{formData.macAddress} • {formData.ipAddress}:{formData.port}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('rfid')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-2 transition ${activeTab === 'rfid' ? 'bg-white text-[#007BC4] border-t-2 border-x border-[#007BC4]' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Zap className="w-3.5 h-3.5" />
            RFID Transmit & Power
          </button>
          <button
            onClick={() => setActiveTab('network')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-2 transition ${activeTab === 'network' ? 'bg-white text-[#007BC4] border-t-2 border-x border-[#007BC4]' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Wifi className="w-3.5 h-3.5" />
            Network & Binding
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-2 transition ${activeTab === 'alerts' ? 'bg-white text-[#007BC4] border-t-2 border-x border-[#007BC4]' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Safety Rules & Triggers
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-2 transition ${activeTab === 'diagnostics' ? 'bg-white text-[#007BC4] border-t-2 border-x border-[#007BC4]' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Diagnostics
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto max-h-[60vh]">
          {activeTab === 'rfid' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Device Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => handleChange('name', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#007BC4]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Device Hardware Type</label>
                  <input
                    type="text"
                    value={formData.type}
                    onChange={e => handleChange('type', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Operating Mode</label>
                  <select
                    value={formData.status}
                    onChange={e => handleChange('status', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                  >
                    <option value="Online">Online (Active Scanning)</option>
                    <option value="Maintenance">Maintenance Mode</option>
                    <option value="Offline">Offline / Standby</option>
                  </select>
                </div>
              </div>

              {/* Slider Transmit Power */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Transmit Power (dBm)</span>
                  <span className="text-sm font-black text-[#007BC4] bg-[#007BC4]/10 px-2 py-0.5 rounded-lg">{formData.powerDbm} dBm</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="33"
                  step="1"
                  value={formData.powerDbm}
                  onChange={e => handleChange('powerDbm', Number(e.target.value))}
                  className="w-full accent-[#007BC4] cursor-pointer"
                />
                <p className="text-[11px] text-slate-500">Higher power increases UHF hardhat tag scan distance (up to 25 meters outdoors).</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Antenna Gain (dBi)</label>
                  <select
                    value={formData.antennaGainDbi}
                    onChange={e => handleChange('antennaGainDbi', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
                  >
                    <option value={6}>6 dBi (Short Range Patch)</option>
                    <option value={8}>8 dBi (Standard Portal)</option>
                    <option value={10}>10 dBi (High Gain Gate Antenna)</option>
                    <option value={12}>12 dBi (Long Range Crane Perimeter)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Frequency Band</label>
                  <select
                    value={formData.frequencyBand}
                    onChange={e => handleChange('frequencyBand', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
                  >
                    <option value="US 902-928 MHz UHF">US 902-928 MHz UHF</option>
                    <option value="EU 865-868 MHz UHF">EU 865-868 MHz UHF</option>
                    <option value="Global 2.4 GHz Active Beacon">Global 2.4 GHz Active Beacon</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Scan Polling Interval</label>
                  <select
                    value={formData.scanIntervalMs}
                    onChange={e => handleChange('scanIntervalMs', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
                  >
                    <option value={100}>100 ms (Real-time Fast Scan)</option>
                    <option value={250}>250 ms (Standard Continuous)</option>
                    <option value={500}>500 ms (Medium Frequency)</option>
                    <option value={1000}>1000 ms (Power Saver)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">RSSI Sensitivity Cutoff</label>
                  <input
                    type="number"
                    value={formData.rssiThreshold}
                    onChange={e => handleChange('rssiThreshold', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-semibold text-slate-800"
                    placeholder="-70"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">e.g. -70 dBm (filters weak signals)</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Bound Sector / Zone</label>
                <select
                  value={formData.zone}
                  onChange={e => handleChange('zone', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-[#007BC4]"
                >
                  {availableZones.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">IP Address</label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={e => handleChange('ipAddress', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">TCP Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={e => handleChange('port', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">MAC Address / Hardware ID</label>
                <input
                  type="text"
                  value={formData.macAddress}
                  onChange={e => handleChange('macAddress', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Map Position X (% coordinate)</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={formData.x}
                    onChange={e => handleChange('x', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Map Position Y (% coordinate)</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={formData.y}
                    onChange={e => handleChange('y', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-medium">Configure automatic safety hazards and boundary breach alerts triggered directly by this RFID reader antenna.</p>
              
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/80 transition">
                  <input
                    type="checkbox"
                    checked={formData.alertsEnabled.unauthorizedAccess}
                    onChange={e => handleAlertChange('unauthorizedAccess', e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#007BC4] rounded"
                  />
                  <div>
                    <div className="text-sm font-bold text-slate-900">Unauthorized Sector Access Breach</div>
                    <div className="text-xs text-slate-500">Triggers alert if a worker enters without proper sector trade clearance certification.</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/80 transition">
                  <input
                    type="checkbox"
                    checked={formData.alertsEnabled.ppeViolation}
                    onChange={e => handleAlertChange('ppeViolation', e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#007BC4] rounded"
                  />
                  <div>
                    <div className="text-sm font-bold text-slate-900">Hardhat & PPE Compliance Scanner</div>
                    <div className="text-xs text-slate-500">Flags worker tags missing mandatory active hardhat or vest sensor signals upon entry.</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/80 transition">
                  <input
                    type="checkbox"
                    checked={formData.alertsEnabled.loiteringDwell}
                    onChange={e => handleAlertChange('loiteringDwell', e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#007BC4] rounded"
                  />
                  <div>
                    <div className="text-sm font-bold text-slate-900">Prolonged Stationary / Fall Alarm</div>
                    <div className="text-xs text-slate-500">Triggers emergency safety warning if tag remains motionless for &gt; 180 seconds in high risk zones.</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-900 text-white rounded-xl font-mono text-xs space-y-2">
                <div className="flex justify-between items-center text-slate-400 text-[10px] uppercase">
                  <span>Hardware Diagnostics Shell</span>
                  <span className="text-emerald-400">STATUS: READY</span>
                </div>
                <div>Device: {formData.name} ({formData.macAddress})</div>
                <div>IP: {formData.ipAddress}:{formData.port}</div>
                <div>Signal Output: {formData.powerDbm} dBm | Gain: {formData.antennaGainDbi} dBi</div>
                {diagnosticResult && (
                  <div className="mt-3 p-2.5 bg-emerald-950 border border-emerald-500/40 text-emerald-300 rounded whitespace-pre-line text-[11px] leading-relaxed">
                    {diagnosticResult}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleRunDiagnostic}
                disabled={isRunningDiagnostic}
                className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition"
              >
                <RefreshCw className={`w-4 h-4 text-[#007BC4] ${isRunningDiagnostic ? 'animate-spin' : ''}`} />
                {isRunningDiagnostic ? 'Testing Hardware Connections...' : 'Run Device Diagnostic Test'}
              </button>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {onDelete && !isNew && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${formData.name}?`)) {
                      onDelete(formData.id);
                      onClose();
                    }
                  }}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Device
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#007BC4] hover:bg-[#0062a0] text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {isNew ? 'Create Device' : 'Save Hardware Config'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
