import React, { useState, useEffect } from "react";
import {
  Cpu,
  Radio,
  Plus,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  Bot,
  User,
  Tag,
  Shield,
  Layers,
  MapPin,
  Trash2,
  Check,
  Zap,
  Activity,
  Server,
  Settings,
  Flame,
  Truck,
  HardHat
} from "lucide-react";

export interface HardwareReader {
  id: string;
  readerId: string;
  name: string;
  model: string;
  ipAddress: string;
  port: number;
  protocol: string;
  powerDbm: number;
  sensitivityDbm: number;
  status: 'ONLINE' | 'SCANNING' | 'STANDBY' | 'OFFLINE';
  antennas: Array<{
    port: number;
    name: string;
    zoneId: string;
    zoneName: string;
    direction: 'IN' | 'OUT' | 'BIDIRECTIONAL';
    powerDbm: number;
  }>;
  totalScans: number;
  lastPingAt?: string;
  lastScanAt?: string;
}

export interface TagEntityMapping {
  id: string;
  tagId: string;
  entityType: 'PERSONNEL' | 'VISITOR' | 'ASSET' | 'VEHICLE';
  entityId: string;
  entityName: string;
  roleOrTrade?: string;
  department?: string;
  assignedZone?: string;
  status: 'ACTIVE' | 'REVOKED' | 'MAINTENANCE';
  lastSeenAt?: string;
  lastSeenZone?: string;
}

export default function DirectHardwareIntegrationSection() {
  const [activeTab, setActiveTab] = useState<'readers' | 'tags' | 'simulator' | 'api_docs'>('readers');
  const [readers, setReaders] = useState<HardwareReader[]>([]);
  const [mappings, setMappings] = useState<TagEntityMapping[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Add Reader State
  const [showAddReader, setShowAddReader] = useState(false);
  const [newReader, setNewReader] = useState<Partial<HardwareReader>>({
    readerId: `GAO-UHF-${Math.floor(100 + Math.random() * 900)}`,
    name: "Zone 1 Fixed Gate Reader",
    model: "GAO 818001 UHF 4-Port Fixed Reader",
    ipAddress: "192.168.1.120",
    port: 8080,
    protocol: "HTTP Push",
    powerDbm: 30,
    sensitivityDbm: -75,
    status: "ONLINE",
    antennas: [
      { port: 1, name: "Antenna 1 (Inbound Entry)", zoneId: "zone_entrance", zoneName: "Main Entrance Turnstile", direction: "IN", powerDbm: 30 },
      { port: 2, name: "Antenna 2 (Outbound Exit)", zoneId: "zone_entrance", zoneName: "Main Entrance Turnstile", direction: "OUT", powerDbm: 30 }
    ]
  });

  // Modal / Add Tag Mapping State
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTag, setNewTag] = useState<Partial<TagEntityMapping>>({
    tagId: `E28011606000020788842D${Math.floor(10 + Math.random() * 89)}`,
    entityType: "PERSONNEL",
    entityId: `EMP-${Math.floor(100 + Math.random() * 900)}`,
    entityName: "Alex Rivera",
    roleOrTrade: "Structural Welder",
    department: "Construction Crew B",
    assignedZone: "Main Facility & Zone 1",
    status: "ACTIVE"
  });

  // Hardware Scanner Simulator State
  const [simReaderId, setSimReaderId] = useState<string>("GAO-UHF-818-A");
  const [simAntennaId, setSimAntennaId] = useState<number>(1);
  const [simTagId, setSimTagId] = useState<string>("E28011606000020788842D31");
  const [simRssi, setSimRssi] = useState<number>(-55);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  const fetchHardwareData = async () => {
    try {
      setLoading(true);
      const [rRes, mRes] = await Promise.all([
        fetch("/api/hardware/readers"),
        fetch("/api/hardware/mappings")
      ]);
      const rData = await rRes.json();
      const mData = await mRes.json();

      if (rData.success && Array.isArray(rData.readers)) setReaders(rData.readers);
      if (mData.success && Array.isArray(mData.mappings)) setMappings(mData.mappings);
    } catch (err) {
      console.error("Failed to fetch hardware data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHardwareData();
  }, []);

  const handleSaveReader = async () => {
    try {
      const res = await fetch("/api/hardware/readers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newReader)
      });
      const data = await res.json();
      if (data.success) {
        setShowAddReader(false);
        await fetchHardwareData();
      }
    } catch (err) {
      console.error("Save reader failed:", err);
    }
  };

  const handleDeleteReader = async (id: string) => {
    if (!window.confirm("Remove this hardware reader configuration?")) return;
    try {
      await fetch(`/api/hardware/readers/${id}`, { method: "DELETE" });
      await fetchHardwareData();
    } catch (err) {
      console.error("Delete reader failed:", err);
    }
  };

  const handleSaveTag = async () => {
    try {
      const res = await fetch("/api/hardware/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTag)
      });
      const data = await res.json();
      if (data.success) {
        setShowAddTag(false);
        await fetchHardwareData();
      }
    } catch (err) {
      console.error("Save tag failed:", err);
    }
  };

  const handleDeleteTag = async (id: string) => {
    if (!window.confirm("Remove this tag mapping?")) return;
    try {
      await fetch(`/api/hardware/mappings/${id}`, { method: "DELETE" });
      await fetchHardwareData();
    } catch (err) {
      console.error("Delete tag failed:", err);
    }
  };

  const handleTriggerSimScan = async () => {
    try {
      setIsSimulating(true);
      setSimResult(null);
      const res = await fetch("/api/hardware/test-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readerId: simReaderId,
          antennaId: simAntennaId,
          tagId: simTagId,
          rssi: simRssi
        })
      });
      const data = await res.json();
      setSimResult(data);
      await fetchHardwareData();
    } catch (err: any) {
      setSimResult({
        success: false,
        error: err.message || "Failed to trigger scan"
      });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Pipeline Diagram Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Option 2: Direct Hardware Connection</h3>
              <p className="text-xs text-slate-400">
                Connect RFID readers, antennas, handhelds, and LoRaWAN gateways directly to the software without any third-party API intermediary.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md">
            Direct Ingestion
          </span>
        </div>

        {/* Visual Pipeline Flow */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Cpu className="w-4 h-4 text-emerald-400 mb-1" />
            <span className="font-semibold text-slate-200">1. RFID Reader</span>
            <span className="text-[10px] text-slate-400">UHF / LLRP / HTTP</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Radio className="w-4 h-4 text-cyan-400 mb-1" />
            <span className="font-semibold text-slate-200">2. Direct Ingest</span>
            <span className="text-[10px] text-slate-400">Scan Stream</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Layers className="w-4 h-4 text-amber-400 mb-1" />
            <span className="font-semibold text-slate-200">3. Data Mapping</span>
            <span className="text-[10px] text-slate-400">Zone & Tag Entity</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Bot className="w-4 h-4 text-purple-400 mb-1" />
            <span className="font-semibold text-slate-200">4. AI Engine</span>
            <span className="text-[10px] text-slate-400">Safety & Proximity</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Database className="w-4 h-4 text-blue-400 mb-1" />
            <span className="font-semibold text-slate-200">5. MongoDB Storage</span>
            <span className="text-[10px] text-slate-400">Devices & Logs</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Activity className="w-4 h-4 text-rose-400 mb-1" />
            <span className="font-semibold text-slate-200">6. Dashboard</span>
            <span className="text-[10px] text-slate-400">Live Live Tracking</span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('readers')}
          className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'readers'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Hardware Readers & Gateways ({readers.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tags')}
          className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'tags'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          RFID Tag-to-Entity Association ({mappings.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('simulator')}
          className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'simulator'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Play className="w-3.5 h-3.5 text-emerald-500" />
          Live Hardware Scan Simulator
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('api_docs')}
          className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'api_docs'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          Reader Ingest Protocols & Endpoints
        </button>
      </div>

      {/* TAB 1: READERS */}
      {activeTab === 'readers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Connected Hardware Readers
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage physical RFID readers, IP addresses, protocols, antenna ports, and assigned zones.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddReader(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Reader
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
              Loading hardware readers...
            </div>
          ) : readers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No hardware readers registered. Click &quot;Register Reader&quot; to configure your first fixed gateway.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {readers.map((reader) => (
                <div
                  key={reader.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700">
                        {reader.readerId}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex items-center gap-1 ${
                          reader.status === 'ONLINE' || reader.status === 'SCANNING'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {reader.status}
                      </span>
                    </div>

                    <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                      {reader.name}
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      {reader.model}
                    </p>

                    <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/60 mb-3">
                      <div className="flex justify-between">
                        <span>IP / Port:</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">{reader.ipAddress}:{reader.port}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Protocol:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{reader.protocol}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>TX Power:</span>
                        <span className="text-slate-800 dark:text-slate-200">{reader.powerDbm} dBm</span>
                      </div>
                    </div>

                    {/* Antennas List */}
                    <div className="mb-3">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Antenna Ports ({reader.antennas?.length || 0}):
                      </span>
                      <div className="space-y-1">
                        {reader.antennas?.map((ant, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                            <span className="font-mono">Port {ant.port}</span>
                            <span className="text-slate-500 dark:text-slate-400 truncate max-w-[140px]">{ant.zoneName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                    <span>Total Scans: {reader.totalScans || 0}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteReader(reader.id)}
                      className="text-rose-500 hover:text-rose-700 p-1"
                      title="Delete Reader"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TAG-TO-ENTITY MAPPING */}
      {activeTab === 'tags' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                RFID Tag-to-Entity Association Directory
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Link raw RFID EPC Hex tags to Personnel (Workers), Visitors, Heavy Machinery Assets, and Vehicles in MongoDB.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddTag(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Link New Tag
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Tag ID (EPC Hex)</th>
                    <th className="px-4 py-3">Entity Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Role / Trade</th>
                    <th className="px-4 py-3">Assigned Zone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {mappings.map((map) => (
                    <tr key={map.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-mono text-slate-900 dark:text-slate-100">
                        {map.tagId}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {map.entityName}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            map.entityType === 'PERSONNEL'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                              : map.entityType === 'ASSET'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              : map.entityType === 'VISITOR'
                              ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {map.entityType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {map.roleOrTrade || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {map.assignedZone || 'All Zones'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                          <Check className="w-3.5 h-3.5" />
                          {map.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(map.id)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-500" />
              Direct Hardware Scanner Simulator & Verification Tool
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Simulate a physical RFID reader tag detection. Verify the complete flow: Hardware Reader → Zone Resolution → AI Engine Analysis → MongoDB Storage → Dashboard Broadcast.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Reader Gateway
              </label>
              <select
                value={simReaderId}
                onChange={(e) => setSimReaderId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
              >
                {readers.map((r) => (
                  <option key={r.id} value={r.readerId}>
                    {r.name} ({r.readerId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Antenna Port
              </label>
              <select
                value={simAntennaId}
                onChange={(e) => setSimAntennaId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
              >
                <option value={1}>Antenna 1 (Inbound Entry)</option>
                <option value={2}>Antenna 2 (Outbound Exit)</option>
                <option value={3}>Antenna 3</option>
                <option value={4}>Antenna 4</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                RFID Tag ID / EPC Hex
              </label>
              <input
                type="text"
                value={simTagId}
                onChange={(e) => setSimTagId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Signal Strength (RSSI)
              </label>
              <select
                value={simRssi}
                onChange={(e) => setSimRssi(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
              >
                <option value={-45}>-45 dBm (Direct Proximity)</option>
                <option value={-58}>-58 dBm (Strong Reading)</option>
                <option value={-72}>-72 dBm (Medium Range)</option>
                <option value={-85}>-85 dBm (Fringe Perimeter)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Quick Tag Preset:{" "}
              <button
                type="button"
                onClick={() => setSimTagId("E28011606000020788842D31")}
                className="text-indigo-600 dark:text-indigo-400 font-mono underline mr-2"
              >
                Marcus Vance (EMP-901)
              </button>
              <button
                type="button"
                onClick={() => setSimTagId("AST-CAT336-991")}
                className="text-indigo-600 dark:text-indigo-400 font-mono underline"
              >
                CAT 336 Excavator
              </button>
            </span>

            <button
              type="button"
              disabled={isSimulating}
              onClick={handleTriggerSimScan}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Transmit Hardware Scan Ping
            </button>
          </div>

          {/* Simulation Output Card */}
          {simResult && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-white space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  Hardware Telemetry Ingested & Analyzed
                </span>
                <span className="text-slate-400">{new Date().toLocaleTimeString()}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Resolved Entity:</span>
                  <span className="text-indigo-400 font-bold">{simResult.resolvedEntity?.name}</span>
                  <span className="text-[10px] text-slate-400 block">({simResult.resolvedEntity?.role || simResult.resolvedEntity?.type})</span>
                </div>

                <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Resolved Zone:</span>
                  <span className="text-amber-400 font-bold">{simResult.resolvedZone}</span>
                </div>

                <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">AI Risk Score & Level:</span>
                  <span className="text-emerald-400 font-bold">{simResult.aiRiskScore}/100 ({simResult.aiRiskLevel})</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-300 bg-slate-900 p-2 rounded border border-slate-800">
                <span className="text-purple-400 font-semibold">AI Safety Insight: </span>
                {simResult.aiInsight}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PROTOCOLS & ENDPOINTS */}
      {activeTab === 'api_docs' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-500" />
              Direct Hardware Ingestion Protocols
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure your physical RFID readers to stream raw scans directly into this application.
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                1. HTTP JSON Push (Recommended for Fixed Readers & Gateways)
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                Configure reader firmware to HTTP POST event arrays or single scans to:
              </p>
              <pre className="p-2.5 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded overflow-x-auto">
{`POST /api/hardware/scan
Content-Type: application/json

{
  "readerId": "GAO-UHF-818-A",
  "antennaId": 1,
  "tagId": "E28011606000020788842D31",
  "rssi": -55,
  "timestamp": "2026-08-17T12:00:00Z"
}`}
              </pre>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                2. LLRP (Low Level Reader Protocol) & GAO Socket Relay
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Supports Impinj Speedway, Zebra FX, and GAO UHF fixed readers over port 5084 / 8080.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Hardware Reader */}
      {showAddReader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Register Physical Hardware Reader
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Reader ID</label>
                <input
                  type="text"
                  value={newReader.readerId || ""}
                  onChange={(e) => setNewReader({ ...newReader, readerId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Reader Name</label>
                <input
                  type="text"
                  value={newReader.name || ""}
                  onChange={(e) => setNewReader({ ...newReader, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">IP Address</label>
                  <input
                    type="text"
                    value={newReader.ipAddress || ""}
                    onChange={(e) => setNewReader({ ...newReader, ipAddress: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Protocol</label>
                  <select
                    value={newReader.protocol || "HTTP Push"}
                    onChange={(e) => setNewReader({ ...newReader, protocol: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="HTTP Push">HTTP Push</option>
                    <option value="GAO TCP/IP">GAO TCP/IP</option>
                    <option value="LLRP (EPC Gen2)">LLRP (EPC Gen2)</option>
                    <option value="BLE Gateway">BLE Gateway</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddReader(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReader}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Save Reader to MongoDB
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Tag Mapping */}
      {showAddTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Link RFID Tag to Entity
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Tag ID / EPC Hex</label>
                <input
                  type="text"
                  value={newTag.tagId || ""}
                  onChange={(e) => setNewTag({ ...newTag, tagId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Entity Name</label>
                  <input
                    type="text"
                    value={newTag.entityName || ""}
                    onChange={(e) => setNewTag({ ...newTag, entityName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Entity Type</label>
                  <select
                    value={newTag.entityType || "PERSONNEL"}
                    onChange={(e) => setNewTag({ ...newTag, entityType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="PERSONNEL">Personnel / Staff</option>
                    <option value="VISITOR">Visitor / Guest</option>
                    <option value="ASSET">Machinery / Asset</option>
                    <option value="VEHICLE">Vehicle</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Role / Trade</label>
                  <input
                    type="text"
                    value={newTag.roleOrTrade || ""}
                    onChange={(e) => setNewTag({ ...newTag, roleOrTrade: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Assigned Zone</label>
                  <input
                    type="text"
                    value={newTag.assignedZone || ""}
                    onChange={(e) => setNewTag({ ...newTag, assignedZone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddTag(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTag}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Save Tag Mapping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
