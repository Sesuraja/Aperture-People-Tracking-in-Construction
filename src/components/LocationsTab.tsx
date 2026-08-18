import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin, Map as MapIcon, Image as ImageIcon, Save, X, Radio } from 'lucide-react';
import { collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, db } from '../lib/db';

interface FloorPlan {
  id: string;
  name: string;
  building: string;
  imageUrl: string;
  devices: DeviceAllocation[];
}

interface DeviceAllocation {
  id: string;
  name: string;
  mac: string;
  x: number;
  y: number;
}

export default function LocationsTab() {
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<FloorPlan | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // New plan state
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanBuilding, setNewPlanBuilding] = useState('Metro Tower Construction Site');
  const [newPlanImage, setNewPlanImage] = useState<File | null>(null);

  // Device overlay state
  const [isPlacingDevice, setIsPlacingDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceMac, setNewDeviceMac] = useState('');
  const [pendingDevicePos, setPendingDevicePos] = useState<{x: number, y: number} | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'floorplans'), (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FloorPlan));
      setFloorPlans(plans);
      if (plans.length > 0 && !selectedPlan) {
        setSelectedPlan(plans[0]);
      } else if (selectedPlan) {
        const updated = plans.find(p => p.id === selectedPlan.id);
        if (updated) setSelectedPlan(updated);
      }
    });
    return () => unsub();
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setNewPlanImage(e.target.files[0]);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanName || !newPlanImage) return;

    setIsUploading(true);
    try {
      // Resize and convert to base64 to avoid storage rule issues
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
             const canvas = document.createElement('canvas');
             let width = img.width;
             let height = img.height;
             const MAX_DIM = 1200;
             if (width > height) {
                if (width > MAX_DIM) {
                   height *= MAX_DIM / width;
                   width = MAX_DIM;
                }
             } else {
                if (height > MAX_DIM) {
                   width *= MAX_DIM / height;
                   height = MAX_DIM;
                }
             }
             canvas.width = width;
             canvas.height = height;
             const ctx = canvas.getContext('2d');
             ctx?.drawImage(img, 0, 0, width, height);
             resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.onerror = reject;
          img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(newPlanImage);
      });

      const newPlan = {
        name: newPlanName,
        building: newPlanBuilding,
        imageUrl: url,
        devices: []
      };

      const docRef = await addDoc(collection(db, 'floorplans'), newPlan);
      setSelectedPlan({ id: docRef.id, ...newPlan });
      setIsAdding(false);
      setNewPlanName('');
      setNewPlanImage(null);
    } catch (err) {
      console.error(err);
      alert('Error saving floor plan.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (confirm('Are you sure you want to delete this floor plan?')) {
      await deleteDoc(doc(db, 'floorplans', id));
      if (selectedPlan?.id === id) {
        setSelectedPlan(floorPlans.find(p => p.id !== id) || null);
      }
    }
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlacingDevice || !selectedPlan) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setPendingDevicePos({ x, y });
  };

  const handleAddDevice = async () => {
    if (!selectedPlan || !pendingDevicePos || !newDeviceName) return;

    const newDevice: DeviceAllocation = {
      id: Date.now().toString(),
      name: newDeviceName,
      mac: newDeviceMac,
      x: pendingDevicePos.x,
      y: pendingDevicePos.y
    };

    const updatedDevices = [...(selectedPlan.devices || []), newDevice];
    await updateDoc(doc(db, 'floorplans', selectedPlan.id), {
      devices: updatedDevices
    });

    setPendingDevicePos(null);
    setIsPlacingDevice(false);
    setNewDeviceName('');
    setNewDeviceMac('');
  };

  const handleRemoveDevice = async (deviceId: string) => {
    if (!selectedPlan) return;
    const updatedDevices = selectedPlan.devices.filter(d => d.id !== deviceId);
    await updateDoc(doc(db, 'floorplans', selectedPlan.id), {
      devices: updatedDevices
    });
  };

  return (
    <div className="flex flex-col gap-6 w-full p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Location Management</h2>
          <p className="text-slate-500 font-medium">Manage buildings, floor plans, and device placements.</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-2 rounded-lg text-xs font-bold shadow-sm">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
             Aperture Building Registry Locked
          </div>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Sidebar for locations list */}
        <div className="w-64 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800">Buildings & Floors</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {floorPlans.length === 0 && !isAdding && (
               <div className="text-center p-4 text-slate-500 text-sm">No floor plans added yet.</div>
            )}
            {floorPlans.map(plan => (
              <div 
                key={plan.id}
                onClick={() => { setSelectedPlan(plan); setIsAdding(false); }}
                className={`p-3 mb-2 rounded-xl cursor-pointer border transition-all ${
                  selectedPlan?.id === plan.id 
                    ? 'bg-blue-50 border-blue-200 shadow-sm' 
                    : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapIcon className={`w-4 h-4 ${selectedPlan?.id === plan.id ? 'text-[#007BC4]' : 'text-slate-400'}`} />
                    <span className={`font-semibold text-sm ${selectedPlan?.id === plan.id ? 'text-[#007BC4]' : 'text-slate-700'}`}>
                      {plan.name}
                    </span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeletePlan(plan.id); }} className="text-slate-400 hover:text-red-500 p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-xs text-slate-500 mt-1 pl-6">{plan.building}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
          
          {isAdding ? (
            <div className="p-8 max-w-lg">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <MapIcon className="text-[#007BC4]" /> Add New Floor Plan
              </h3>
              <form onSubmit={handleCreatePlan} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Building</label>
                  <select 
                    value={newPlanBuilding}
                    onChange={(e) => setNewPlanBuilding(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#007BC4] transition"
                  >
                    <option>Aperture Office</option>
                    <option>Manufacturing and Warehousing</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Floor Name</label>
                  <input 
                    required
                    type="text" 
                    placeholder="e.g. 1st Floor East Wing"
                    value={newPlanName}
                    onChange={(e) => setNewPlanName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#007BC4] transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Floor Map Image</label>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition">
                    <input 
                      required
                      type="file" 
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden" 
                      id="floor-image"
                    />
                    <label htmlFor="floor-image" className="cursor-pointer flex flex-col items-center">
                      <ImageIcon className="w-8 h-8 text-slate-400 mb-2" />
                      <span className="text-sm font-semibold text-[#007BC4]">Click to upload</span>
                      <span className="text-xs text-slate-500 mt-1">PNG, JPG up to 5MB</span>
                      {newPlanImage && <span className="pt-2 text-sm text-emerald-600 font-medium truncate max-w-[200px]">{newPlanImage.name}</span>}
                    </label>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isUploading}
                  className="w-full flex items-center justify-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-semibold shadow-md transition disabled:opacity-50 mt-4"
                >
                  {isUploading ? 'Uploading...' : 'Save Floor Plan'}
                </button>
              </form>
            </div>
          ) : selectedPlan ? (
            <div className="flex-1 flex flex-col min-h-0">
               <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">{selectedPlan.name}</h3>
                    <p className="text-sm text-slate-500">{selectedPlan.building}</p>
                  </div>
                  <div className="flex gap-2">
                     <button
                       onClick={() => {
                          setIsPlacingDevice(!isPlacingDevice);
                          setPendingDevicePos(null);
                       }}
                       className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition ${
                          isPlacingDevice 
                             ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200' 
                             : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                       }`}
                     >
                        {isPlacingDevice ? 'Cancel Placement' : 'Add Device/Door'}
                        <MapPin className="w-4 h-4" />
                     </button>
                  </div>
               </div>
               
               <div className="flex-1 relative bg-slate-100 overflow-hidden group">
                  {/* Map Container */}
                  <div 
                    className={`absolute inset-0 flex items-center justify-center p-4 ${isPlacingDevice ? 'cursor-crosshair' : ''}`}
                    onClick={handleMapClick}
                  >
                     <div className="relative max-w-full max-h-full h-fit w-fit shadow-lg bg-white">
                        <img 
                          src={selectedPlan.imageUrl} 
                          alt="Floor plan" 
                          className="max-w-full max-h-[60vh] object-contain block opacity-90"
                          draggable={false}
                        />

                        {/* Existing Devices overlay */}
                        {selectedPlan.devices?.map(device => (
                           <div 
                             key={device.id}
                             className="absolute -translate-x-1/2 -translate-y-1/2 group/device"
                             style={{ left: `${device.x}%`, top: `${device.y}%` }}
                             title={device.name}
                           >
                              <div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-md animate-pulse"></div>
                              <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-white px-2 py-1 rounded shadow text-xs font-bold whitespace-nowrap hidden group-hover/device:flex items-center gap-2 z-10 border border-slate-200">
                                 {device.name}
                                 <button onClick={(e) => { e.stopPropagation(); handleRemoveDevice(device.id); }} className="text-slate-400 hover:text-red-500">
                                    <Trash2 className="w-3 h-3" />
                                 </button>
                              </div>
                           </div>
                        ))}

                        {/* Pending Device placement overlay */}
                        {pendingDevicePos && (
                           <div 
                             className="absolute -translate-x-1/2 -translate-y-1/2"
                             style={{ left: `${pendingDevicePos.x}%`, top: `${pendingDevicePos.y}%` }}
                           >
                              <div className="w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-md"></div>
                              
                              <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white p-3 rounded-xl shadow-xl border border-slate-200 w-64 z-20" onClick={e => e.stopPropagation()}>
                                 <h4 className="font-bold text-sm mb-2 text-slate-800">Add New Device Here</h4>
                                 <input 
                                   autoFocus
                                   type="text" 
                                   placeholder="Device/Door Name" 
                                   className="w-full text-xs border border-slate-200 rounded p-1.5 mb-2 outline-none focus:border-[#007BC4]"
                                   value={newDeviceName}
                                   onChange={e => setNewDeviceName(e.target.value)}
                                 />
                                 <input 
                                   type="text" 
                                   placeholder="MAC/Gateway ID (optional)" 
                                   className="w-full text-xs font-mono border border-slate-200 rounded p-1.5 mb-3 outline-none focus:border-[#007BC4]"
                                   value={newDeviceMac}
                                   onChange={e => setNewDeviceMac(e.target.value)}
                                 />
                                 <div className="flex gap-2">
                                    <button onClick={handleAddDevice} className="flex-1 bg-[#007BC4] text-white text-xs font-bold py-1.5 rounded hover:bg-blue-600">Save</button>
                                    <button onClick={() => setPendingDevicePos(null)} className="flex-1 bg-slate-100 text-slate-600 text-xs font-bold py-1.5 rounded hover:bg-slate-200">Cancel</button>
                                 </div>
                              </div>
                           </div>
                        )}
                     </div>
                  </div>
                  
                  {isPlacingDevice && !pendingDevicePos && (
                     <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white px-4 py-2 rounded-full text-sm font-medium animate-bounce shadow-lg backdrop-blur pointer-events-none z-10">
                        Click anywhere on the map to add a device
                     </div>
                  )}
               </div>
               
               <div className="bg-white border-t border-slate-200 p-4 h-48 overflow-y-auto">
                  <h4 className="font-bold text-sm text-slate-800 mb-3">Devices on this Floor</h4>
                  {selectedPlan.devices?.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                       {selectedPlan.devices.map(device => (
                          <div key={device.id} className="border border-slate-200 rounded-lg p-2.5 flex items-center justify-between bg-slate-50">
                             <div className="flex items-center gap-2">
                                <Radio className="w-4 h-4 text-[#007BC4]" />
                                <div>
                                  <div className="text-xs font-bold text-slate-800">{device.name}</div>
                                  <div className="text-[10px] font-mono text-slate-500">{device.mac || 'No MAC'}</div>
                                </div>
                             </div>
                             <button onClick={() => handleRemoveDevice(device.id)} className="text-slate-400 hover:text-red-500">
                               <Trash2 className="w-3 h-3" />
                             </button>
                          </div>
                       ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500 italic">No devices added to this floor plan yet.</div>
                  )}
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <MapIcon className="w-16 h-16 opacity-20" />
              <p>Select a location from the left or create a new floor plan.</p>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
