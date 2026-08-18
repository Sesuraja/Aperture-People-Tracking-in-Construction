import React, { useState } from 'react';
import { Person } from '../lib/simulation';
import { Users, Plus, Trash2, Edit3, X, Check, ShieldCheck, HardHat, Award, MapPin } from 'lucide-react';

interface ManageWorkforceModalProps {
  isOpen: boolean;
  onClose: () => void;
  people: Person[];
  availableZones: string[];
  onAddPerson: (newPerson: Person) => void;
  onUpdatePerson: (updatedPerson: Person) => void;
  onDeletePerson: (id: string) => void;
}

export default function ManageWorkforceModal({
  isOpen,
  onClose,
  people,
  availableZones,
  onAddPerson,
  onUpdatePerson,
  onDeletePerson
}: ManageWorkforceModalProps) {
  if (!isOpen) return null;

  const [selectedPerson, setSelectedPerson] = useState<Person | null>(people[0] || null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<Person>>({
    name: '',
    role: 'Construction Worker',
    tradeCompany: 'BuildCorp Subcontractor',
    ppeStatus: 'COMPLIANT',
    certifications: ['OSHA 10', 'Site Safety'],
    hardhatTagId: `HH-${Math.floor(1000 + Math.random() * 9000)}`,
    currentZone: availableZones[0] || 'Site Office & Welfare Container',
    presenceState: 'IDLE',
    dwellTime: 60,
    x: 50,
    y: 50
  });

  const handleSelectPerson = (p: Person) => {
    setIsAddingNew(false);
    setSelectedPerson(p);
    setFormData({ ...p });
  };

  const handleStartAdding = () => {
    setIsAddingNew(true);
    setSelectedPerson(null);
    setFormData({
      id: `w-${Date.now().toString().slice(-4)}`,
      name: '',
      role: 'Construction Worker',
      tradeCompany: 'BuildCorp General',
      ppeStatus: 'COMPLIANT',
      certifications: ['OSHA 30', 'Site Safety'],
      hardhatTagId: `HH-${Math.floor(1000 + Math.random() * 9000)}`,
      currentZone: availableZones[0] || 'Site Office & Welfare Container',
      presenceState: 'IDLE',
      dwellTime: 10,
      x: 30 + Math.floor(Math.random() * 40),
      y: 30 + Math.floor(Math.random() * 40),
      lastSeen: new Date(),
      trail: []
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    if (isAddingNew) {
      const newP: Person = {
        id: formData.id || `w-${Date.now()}`,
        name: formData.name,
        role: formData.role || 'Construction Worker',
        tradeCompany: formData.tradeCompany || 'BuildCorp General',
        ppeStatus: (formData.ppeStatus as any) || 'COMPLIANT',
        certifications: formData.certifications || ['OSHA 10'],
        hardhatTagId: formData.hardhatTagId || `HH-${Math.floor(1000 + Math.random() * 9000)}`,
        currentZone: formData.currentZone || availableZones[0] || 'Gate 1 / Main Access Gate',
        presenceState: formData.presenceState || 'IDLE',
        dwellTime: formData.dwellTime || 10,
        x: Number(formData.x) || 50,
        y: Number(formData.y) || 50,
        lastSeen: new Date(),
        trail: []
      };
      onAddPerson(newP);
      setSelectedPerson(newP);
      setIsAddingNew(false);
    } else if (selectedPerson) {
      const updatedP: Person = {
        ...selectedPerson,
        ...formData,
        name: formData.name || selectedPerson.name,
        x: Number(formData.x) || selectedPerson.x,
        y: Number(formData.y) || selectedPerson.y
      } as Person;
      onUpdatePerson(updatedP);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col my-6 max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 border border-blue-500/40 text-sky-400 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white">Workforce & Site Personnel Manager</h3>
              <p className="text-xs text-slate-400">Register new site workers, assign UHF RFID hardhat tags, trade certifications & sector permissions</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Layout */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
          
          {/* Left Column: People Roster */}
          <div className="w-full md:w-80 bg-slate-50 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto max-h-[280px] md:max-h-none">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Active Personnel ({people.length})</span>
              <button
                type="button"
                onClick={handleStartAdding}
                className="bg-[#007BC4] hover:bg-[#0062a0] text-white px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" /> Add Worker
              </button>
            </div>

            {/* List */}
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {people.map(p => {
                const isActive = !isAddingNew && selectedPerson?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPerson(p)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                      isActive 
                        ? 'bg-[#007BC4] text-white border-[#007BC4] shadow-md' 
                        : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-extrabold truncate text-sm">{p.name}</div>
                      <div className={`text-[10px] font-mono mt-0.5 ${isActive ? 'text-sky-100' : 'text-slate-400'}`}>
                        {p.role} • Tag: {p.hardhatTagId}
                      </div>
                    </div>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                      p.ppeStatus === 'NON_COMPLIANT' ? 'bg-rose-500 text-white' :
                      p.ppeStatus === 'WARNING' ? 'bg-amber-400 text-slate-900' :
                      isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {p.ppeStatus}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Person Form */}
          <div className="flex-1 p-6 overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-5">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <HardHat className="w-4 h-4 text-[#007BC4]" />
                  {isAddingNew ? 'Register New Workforce Personnel' : `Edit Profile: ${selectedPerson?.name}`}
                </h4>
                {!isAddingNew && selectedPerson && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove ${selectedPerson.name} from live site tracking?`)) {
                        onDeletePerson(selectedPerson.id);
                        setSelectedPerson(people.find(p => p.id !== selectedPerson.id) || null);
                      }
                    }}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Worker
                  </button>
                )}
              </div>

              {/* Name & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Full Worker Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Marcus Vance"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#007BC4] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Site Job Role</label>
                  <select
                    value={formData.role || 'Construction Worker'}
                    onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                  >
                    <option value="Site Superintendent">Site Superintendent</option>
                    <option value="Safety Officer (EHS)">Safety Officer (EHS)</option>
                    <option value="Heavy Equipment Operator">Heavy Equipment Operator</option>
                    <option value="Scaffolder / Rigger">Scaffolder / Rigger</option>
                    <option value="Electrician (Subcontractor)">Electrician (Subcontractor)</option>
                    <option value="Structural Steelworker">Structural Steelworker</option>
                    <option value="Site Inspector / Visitor">Site Inspector / Visitor</option>
                  </select>
                </div>
              </div>

              {/* Company & Hardhat Tag */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Subcontractor Company</label>
                  <input
                    type="text"
                    value={formData.tradeCompany || ''}
                    onChange={e => setFormData(prev => ({ ...prev, tradeCompany: e.target.value }))}
                    placeholder="e.g. BuildCorp General"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Assigned Hardhat Tag ID</label>
                  <input
                    type="text"
                    required
                    value={formData.hardhatTagId || ''}
                    onChange={e => setFormData(prev => ({ ...prev, hardhatTagId: e.target.value }))}
                    placeholder="e.g. HH-9021"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-[#007BC4]"
                  />
                </div>
              </div>

              {/* Zone & PPE Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Current Assigned Zone</label>
                  <select
                    value={formData.currentZone || availableZones[0]}
                    onChange={e => setFormData(prev => ({ ...prev, currentZone: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                  >
                    {availableZones.map(z => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">PPE Compliance Rating</label>
                  <select
                    value={formData.ppeStatus || 'COMPLIANT'}
                    onChange={e => setFormData(prev => ({ ...prev, ppeStatus: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                  >
                    <option value="COMPLIANT">COMPLIANT (100% PPE Verified)</option>
                    <option value="WARNING">WARNING (Missing Vest / Gloves)</option>
                    <option value="NON_COMPLIANT">NON COMPLIANT (No Hardhat Sensor)</option>
                  </select>
                </div>
              </div>

              {/* Map Coordinates (X%, Y%) */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  <MapPin className="w-4 h-4 text-[#007BC4]" /> Live Map Marker Position (% Coordinate)
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">X Position (% across map)</label>
                    <input
                      type="number"
                      min="2"
                      max="98"
                      value={formData.x || 50}
                      onChange={e => setFormData(prev => ({ ...prev, x: Number(e.target.value) }))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Y Position (% down map)</label>
                    <input
                      type="number"
                      min="2"
                      max="98"
                      value={formData.y || 50}
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
                  className="px-5 py-2 bg-[#007BC4] hover:bg-[#0062a0] text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {isAddingNew ? 'Save & Add Worker' : 'Update Worker Profile'}
                </button>
              </div>

            </form>
          </div>

        </div>

      </div>
    </div>
  );
}
