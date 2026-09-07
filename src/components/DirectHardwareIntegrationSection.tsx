import React, { useState, useEffect } from "react";
import {
  Cpu,
  Radio,
  Plus,
  RefreshCw,
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
  HardHat,
  Eye,
  Send,
  Code
} from "lucide-react";
import { useTerminology, useTracking } from "../context/TrackingContext";
import { getAuthHeaders } from "../lib/gaoApi";

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

const DEFAULT_READERS: HardwareReader[] = [
  {
    id: "rdr_portal_zone1",
    readerId: "GAO-UHF-PORTAL-01",
    name: "Zone 1 Fixed Portal Reader",
    model: "GAO 818001 UHF 4-Port Fixed RFID Portal",
    ipAddress: "192.168.1.101",
    port: 8080,
    protocol: "HTTP Push / WebSocket",
    powerDbm: 30,
    sensitivityDbm: -75,
    status: "ONLINE",
    antennas: [
      { port: 1, name: "Antenna 1 (Inbound Entry)", zoneId: "Zone1", zoneName: "Zone 1 Entrance Portal", direction: "IN", powerDbm: 30 },
      { port: 2, name: "Antenna 2 (Outbound Exit)", zoneId: "Zone1", zoneName: "Zone 1 Entrance Portal", direction: "OUT", powerDbm: 30 }
    ],
    totalScans: 200,
    lastPingAt: new Date().toISOString()
  },
  {
    id: "rdr_portal_zone2",
    readerId: "GAO-UHF-PORTAL-02",
    name: "Zone 2 High-Density Portal Reader",
    model: "GAO 818001 UHF 4-Port Fixed RFID Portal",
    ipAddress: "192.168.1.102",
    port: 8080,
    protocol: "HTTP Push / WebSocket",
    powerDbm: 30,
    sensitivityDbm: -75,
    status: "ONLINE",
    antennas: [
      { port: 1, name: "Antenna 1 (Zone 2 Core Gateway)", zoneId: "Zone2", zoneName: "Zone 2 Transit Corridor", direction: "BIDIRECTIONAL", powerDbm: 30 }
    ],
    totalScans: 123,
    lastPingAt: new Date().toISOString()
  }
];

const DEFAULT_MAPPINGS: TagEntityMapping[] = [
  {
    id: "map_john_live",
    tagId: "E28011606000020788842D21",
    entityType: "PERSONNEL",
    entityId: "worker_john_01",
    entityName: "John",
    roleOrTrade: "Senior Master Electrician",
    department: "Electrical Infrastructure",
    assignedZone: "Zone2",
    status: "ACTIVE",
    lastSeenAt: new Date().toISOString(),
    lastSeenZone: "Zone2"
  }
];

export default function DirectHardwareIntegrationSection() {
  const { personnelSingular, personnelPlural, roleLabel, idBadgeLabel, zoneLabel } = useTerminology();
  const trackingCtx = useTracking();
  const [activeTab, setActiveTab] = useState<'readers' | 'tags' | 'api_docs'>('readers');
  const [readers, setReaders] = useState<HardwareReader[]>([]);
  const [mappings, setMappings] = useState<TagEntityMapping[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Add Reader State
  const [showAddReader, setShowAddReader] = useState(false);
  const [newReader, setNewReader] = useState<Partial<HardwareReader>>({
    readerId: "GAO-UHF-PORTAL-03",
    name: "Zone 3 Assembly Gate Reader",
    model: "GAO 818001 UHF 4-Port Fixed Gateway",
    ipAddress: "192.168.1.103",
    port: 8080,
    protocol: "HTTP Push",
    powerDbm: 30,
    sensitivityDbm: -75,
    status: "ONLINE",
    antennas: [
      { port: 1, name: "Antenna 1 (Entry)", zoneId: "Zone1", zoneName: "Zone 1", direction: "IN", powerDbm: 30 }
    ]
  });

  // Modal / Add Tag Mapping State
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTag, setNewTag] = useState<Partial<TagEntityMapping>>({
    tagId: "",
    entityType: "PERSONNEL",
    entityId: "",
    entityName: "",
    roleOrTrade: "Field Specialist",
    department: "Site Operations",
    assignedZone: "Zone1",
    status: "ACTIVE"
  });

  const fetchHardwareData = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [rRes, mRes] = await Promise.all([
        fetch("/api/hardware/readers", { headers }),
        fetch("/api/hardware/mappings", { headers })
      ]);
      const rData = await rRes.json().catch(() => ({}));
      const mData = await mRes.json().catch(() => ({}));

      if (rData.success && Array.isArray(rData.readers) && rData.readers.length > 0) {
        setReaders(rData.readers);
      } else {
        // Seed default readers into MongoDB
        for (const r of DEFAULT_READERS) {
          await fetch("/api/hardware/readers", {
            method: "POST",
            headers,
            body: JSON.stringify(r)
          }).catch(() => {});
        }
        setReaders(DEFAULT_READERS);
      }

      if (mData.success && Array.isArray(mData.mappings) && mData.mappings.length > 0) {
        setMappings(mData.mappings);
      } else {
        // Seed default mapping for active worker John
        for (const m of DEFAULT_MAPPINGS) {
          await fetch("/api/hardware/mappings", {
            method: "POST",
            headers,
            body: JSON.stringify(m)
          }).catch(() => {});
        }
        setMappings(DEFAULT_MAPPINGS);
      }
    } catch (err) {
      console.error("Failed to fetch hardware data:", err);
      setReaders(DEFAULT_READERS);
      setMappings(DEFAULT_MAPPINGS);
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
        headers: getAuthHeaders(),
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
    if (!window.confirm("Remove this hardware reader configuration from MongoDB Atlas?")) return;
    try {
      await fetch(`/api/hardware/readers/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      await fetchHardwareData();
    } catch (err) {
      console.error("Delete reader failed:", err);
    }
  };

  const handleSaveTagMapping = async () => {
    if (!newTag.tagId || !newTag.entityName) {
      alert("Please specify both a Tag ID and an Entity Name.");
      return;
    }
    try {
      const res = await fetch("/api/hardware/mappings", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(newTag)
      });
      const data = await res.json();
      if (data.success) {
        setShowAddTag(false);
        setNewTag({
          tagId: "",
          entityType: "PERSONNEL",
          entityId: "",
          entityName: "",
          roleOrTrade: "Field Specialist",
          department: "Site Operations",
          assignedZone: "Zone1",
          status: "ACTIVE"
        });
        await fetchHardwareData();
      }
    } catch (err) {
      console.error("Save mapping failed:", err);
    }
  };

  const handleDeleteMapping = async (id: string) => {
    if (!window.confirm("Delete this RFID tag association from MongoDB Atlas?")) return;
    try {
      await fetch(`/api/hardware/mappings/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      await fetchHardwareData();
    } catch (err) {
      console.error("Delete mapping failed:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Visual Pipeline Header - White Theme */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-900 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-[#007BC4]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Option 2: Direct Hardware Connection</h3>
              <p className="text-xs text-slate-500 font-medium">
                Connect physical RFID readers, antenna portals, and badge scanners directly to MongoDB Atlas.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider bg-blue-50 text-[#007BC4] border border-blue-200 rounded-full shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#007BC4] animate-pulse"></span>
            Direct Ingestion Mode
          </span>
        </div>

        {/* Visual Pipeline Flow */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Cpu className="w-4 h-4 text-emerald-600 mb-1.5" />
            <span className="font-bold text-slate-800">1. Fixed Reader</span>
            <span className="text-[10px] text-slate-500">UHF Portal Gate</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Radio className="w-4 h-4 text-cyan-600 mb-1.5" />
            <span className="font-bold text-slate-800">2. Antenna Sweep</span>
            <span className="text-[10px] text-slate-500">Fast Sub-Second Scans</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Layers className="w-4 h-4 text-amber-600 mb-1.5" />
            <span className="font-bold text-slate-800">3. Tag Mapping</span>
            <span className="text-[10px] text-slate-500">John / Electrician</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Bot className="w-4 h-4 text-purple-600 mb-1.5" />
            <span className="font-bold text-slate-800">4. AI Analysis</span>
            <span className="text-[10px] text-slate-500">Zone Dwell & Safety</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Database className="w-4 h-4 text-[#007BC4] mb-1.5" />
            <span className="font-bold text-slate-800">5. MongoDB Atlas</span>
            <span className="text-[10px] text-slate-500">Hardware Readers DB</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Activity className="w-4 h-4 text-rose-500 mb-1.5" />
            <span className="font-bold text-slate-800">6. Live Map</span>
            <span className="text-[10px] text-slate-500">Real-Time Badges</span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-2 pt-1 gap-2 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('readers')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'readers'
              ? 'border-[#007BC4] text-[#007BC4] bg-slate-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Hardware Readers & Gateways ({readers.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tags')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'tags'
              ? 'border-[#007BC4] text-[#007BC4] bg-slate-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          RFID Tag-to-Entity Association ({mappings.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('api_docs')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'api_docs'
              ? 'border-[#007BC4] text-[#007BC4] bg-slate-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          Direct Ingestion Endpoints
        </button>
      </div>

      {/* TAB 1: READERS */}
      {activeTab === 'readers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Connected Hardware Readers
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Manage physical RFID readers, antenna portals, IP configurations, and assigned site zones.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddReader(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg shadow-xs transition cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Reader
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
              <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-[#007BC4]" />
              Loading hardware readers from MongoDB...
            </div>
          ) : readers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 bg-white rounded-xl">
              No hardware readers registered. Click &quot;Register Reader&quot; to configure your first fixed gateway.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {readers.map((reader) => (
                <div
                  key={reader.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-800 rounded border border-slate-200">
                        {reader.readerId}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex items-center gap-1 border ${
                          reader.status === 'ONLINE' || reader.status === 'SCANNING'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {reader.status}
                      </span>
                    </div>

                    <h5 className="text-sm font-bold text-slate-900 mb-1">
                      {reader.name}
                    </h5>
                    <p className="text-xs text-slate-500 font-medium mb-3">
                      {reader.model}
                    </p>

                    <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-xs text-slate-600 mb-3 border border-slate-100 font-medium">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-bold">Network IP:</span>
                        <span className="font-mono text-slate-800 font-bold">{reader.ipAddress}:{reader.port}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-bold">Protocol:</span>
                        <span className="text-slate-800">{reader.protocol}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-bold">RF Power:</span>
                        <span className="text-slate-800">{reader.powerDbm} dBm</span>
                      </div>
                    </div>

                    {reader.antennas && reader.antennas.length > 0 && (
                      <div className="border-t border-slate-100 pt-3 space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Connected Antennas ({reader.antennas.length})
                        </span>
                        {reader.antennas.map((ant, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200">
                            <span className="font-semibold text-slate-800 text-[11px] truncate max-w-[150px]">{ant.name}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-[#007BC4] border border-blue-100">
                              {ant.zoneId || ant.zoneName}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs">
                    <span className="text-slate-400 font-medium">Scans: {reader.totalScans || 0}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteReader(reader.id)}
                      className="text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TAG-TO-ENTITY ASSOCIATION */}
      {activeTab === 'tags' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                RFID Tag Associations & Hardware Mappings
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Map raw UHF RFID hex tags directly to {personnelPlural.toLowerCase()}, visitors, or construction assets in MongoDB Atlas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddTag(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg shadow-xs transition cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Assign New Tag
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                  <tr>
                    <th className="p-3.5 pl-5">Hardware Tag ID (Hex/EPC)</th>
                    <th className="p-3.5">Assigned Entity</th>
                    <th className="p-3.5">Type</th>
                    <th className="p-3.5">Role / Trade</th>
                    <th className="p-3.5">Primary Zone</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappings.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No tag mappings configured. Click &quot;Assign New Tag&quot; above to link an RFID tag.
                      </td>
                    </tr>
                  ) : (
                    mappings.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70 transition">
                        <td className="p-3.5 pl-5 font-mono font-bold text-slate-900">
                          {m.tagId}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">
                          {m.entityName}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {m.entityType}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-600 font-medium">
                          {m.roleOrTrade || 'General Staff'}
                        </td>
                        <td className="p-3.5 text-slate-700 font-semibold">
                          {m.assignedZone || 'All Zones'}
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            m.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="p-3.5 pr-5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteMapping(m.id)}
                            className="text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INGESTION PROTOCOLS & API DOCS */}
      {activeTab === 'api_docs' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-[#007BC4]" /> Direct Hardware HTTP Ingest Specification
            </h4>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Fixed RFID portals can stream tag detection bursts directly to the server endpoint below:
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">POST</span>
              <span className="text-slate-900 font-bold">{window.location.origin}/api/hardware/scan</span>
            </div>
            <div className="text-[11px] text-slate-500">Headers: Content-Type: application/json</div>
          </div>

          <div>
            <span className="text-xs font-bold text-slate-800 block mb-2">Sample Ingest Payload:</span>
            <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto">
{`{
  "tagId": "E28011606000020788842D21",
  "readerId": "GAO-UHF-PORTAL-01",
  "antenna": 1,
  "rssi": -58,
  "readCount": 1,
  "timestamp": "${new Date().toISOString()}"
}`}
            </pre>
          </div>
        </div>
      )}

      {/* Modal: Add Reader */}
      {showAddReader && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#007BC4]" /> Register Hardware Reader
              </h4>
              <button
                type="button"
                onClick={() => setShowAddReader(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Reader ID / Serial</label>
                <input
                  type="text"
                  value={newReader.readerId || ""}
                  onChange={(e) => setNewReader({ ...newReader, readerId: e.target.value })}
                  placeholder="e.g. GAO-UHF-PORTAL-03"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Display Name</label>
                <input
                  type="text"
                  value={newReader.name || ""}
                  onChange={(e) => setNewReader({ ...newReader, name: e.target.value })}
                  placeholder="Zone 3 Assembly Gate Reader"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">IP Address</label>
                  <input
                    type="text"
                    value={newReader.ipAddress || ""}
                    onChange={(e) => setNewReader({ ...newReader, ipAddress: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Port</label>
                  <input
                    type="number"
                    value={newReader.port || 8080}
                    onChange={(e) => setNewReader({ ...newReader, port: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddReader(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReader}
                className="px-4 py-2 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg shadow-xs cursor-pointer"
              >
                Save Reader to MongoDB
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Tag Mapping */}
      {showAddTag && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#007BC4]" /> Link RFID Tag to Entity
              </h4>
              <button
                type="button"
                onClick={() => setShowAddTag(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Tag ID / Hex EPC</label>
                <input
                  type="text"
                  value={newTag.tagId || ""}
                  onChange={(e) => setNewTag({ ...newTag, tagId: e.target.value })}
                  placeholder="e.g. E28011606000020788842D21"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Personnel / Entity Name</label>
                <input
                  type="text"
                  value={newTag.entityName || ""}
                  onChange={(e) => setNewTag({ ...newTag, entityName: e.target.value })}
                  placeholder="John"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Role / Trade</label>
                  <input
                    type="text"
                    value={newTag.roleOrTrade || ""}
                    onChange={(e) => setNewTag({ ...newTag, roleOrTrade: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Assigned Zone</label>
                  <input
                    type="text"
                    value={newTag.assignedZone || ""}
                    onChange={(e) => setNewTag({ ...newTag, assignedZone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddTag(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTagMapping}
                className="px-4 py-2 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg shadow-xs cursor-pointer"
              >
                Save Tag Mapping to MongoDB
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
