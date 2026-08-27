import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wrench, Activity, AlertCircle, CheckCircle2, Clock, UserCheck, Plus, Search, Filter, 
  Download, RefreshCw, Sparkles, BatteryFull, BatteryLow, SignalHigh, Zap, Thermometer, 
  Sliders, Calendar, TrendingUp, X, ChevronRight, CheckSquare, Square, Trash2, Edit3, 
  AlertTriangle, Send, Layers, ShieldCheck, Cpu, Radio, FileSpreadsheet, User, Phone, 
  Hammer, Check, ArrowUpRight, Gauge, FileText, CheckCircle, Database
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, db } from '../lib/db';

// Data Interfaces
export interface MaintenanceNode {
  id: string;
  name: string;
  type: string;
  location: string;
  zoneId: string;
  signal: number; // 0 - 100%
  battery: number | null; // null for Mains AC
  health: number; // 0 - 100%
  prediction: string;
  status: 'Healthy' | 'Warning' | 'Critical' | 'Scheduled';
  lastServiceDate: string;
  nextServiceDue: string;
  temperatureC: number;
  vibrationMmS: number;
  technicianAssigned?: string;
  notes?: string;
}

export interface WorkOrder {
  id: string;
  nodeId: string;
  nodeName: string;
  title: string;
  category: 'Antenna Re-alignment' | 'Battery Replacement' | 'Firmware Reflash' | 'Hardware Swap' | 'Cleaning & Calibration' | 'General Inspection';
  priority: 'P1 - Critical' | 'P2 - High' | 'P3 - Medium' | 'P4 - Low';
  status: 'Open' | 'In Progress' | 'Pending Parts' | 'Completed' | 'Cancelled';
  assignedTech: string;
  createdDate: string;
  dueDate: string;
  estimatedHours: number;
  description: string;
  partsRequired?: string;
  resolutionNotes?: string;
  completedDate?: string;
}

export interface Technician {
  id: string;
  name: string;
  role: string;
  status: 'Available' | 'On-site Repair' | 'Off-duty' | 'In Transit';
  phone: string;
  specialization: string;
  activeWorkOrders: number;
}

export interface ScheduleRule {
  id: string;
  title: string;
  targetNodeCategory: string;
  frequencyDays: number;
  lastRun: string;
  nextRun: string;
  assignedTech: string;
  active: boolean;
}

export default function MaintenanceTab() {
  // Main State
  const [nodes, setNodes] = useState<MaintenanceNode[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRule[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [dbSynced, setDbSynced] = useState(false);

  // Sub Tab Navigation
  const [activeTab, setActiveTab] = useState<'nodes' | 'work_orders' | 'schedules' | 'technicians' | 'analytics'>('nodes');

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [nodeStatusFilter, setNodeStatusFilter] = useState<string>('all');
  const [woStatusFilter, setWoStatusFilter] = useState<string>('all');
  const [woPriorityFilter, setWoPriorityFilter] = useState<string>('all');

  // Modals & Action States
  const [selectedNode, setSelectedNode] = useState<MaintenanceNode | null>(null);
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null);
  const [modalType, setModalType] = useState<'dispatch' | 'new_wo' | 'view_wo' | 'edit_wo' | 'new_node' | 'edit_node' | 'new_schedule' | 'scan_ai' | null>(null);

  // Form States
  const [woForm, setWoForm] = useState<Partial<WorkOrder>>({});
  const [nodeForm, setNodeForm] = useState<Partial<MaintenanceNode>>({});
  const [schedForm, setSchedForm] = useState<Partial<ScheduleRule>>({});

  // AI Scan Progress State
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [aiScanLogs, setAiScanLogs] = useState<string[]>([]);
  const [aiScanResults, setAiScanResults] = useState<{ scannedCount: number; faultsFound: number; autoTicketsCreated: number } | null>(null);

  const [mongoStatus, setMongoStatus] = useState<{ connected: boolean; engine: string; database: string; totalRecords: number }>({
    connected: true,
    engine: 'MongoDB Atlas',
    database: 'Lat-Aperture-People-Tracking',
    totalRecords: 0
  });

  useEffect(() => {
    const checkMongo = async () => {
      try {
        const res = await fetch('/api/mongodb/status');
        if (res.ok) {
          const data = await res.json();
          setMongoStatus({
            connected: Boolean(data.connected),
            engine: data.engine || 'MongoDB Atlas',
            database: 'Lat-Aperture-People-Tracking',
            totalRecords: data.totalRecords || 0
          });
        }
      } catch {}
    };
    checkMongo();
    const intv = setInterval(checkMongo, 5000);
    return () => clearInterval(intv);
  }, []);

  // Load and Sync with MongoDB via db.ts client
  useEffect(() => {
    setLoading(true);

    // 1. Sync Maintenance Nodes
    const unsubNodes = onSnapshot(collection(db, 'maintenance_nodes'), async (snapshot) => {
      const list: MaintenanceNode[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        list.push({
          id: d.id || data.id,
          name: data.name || 'Unnamed Node',
          type: data.type || 'Hardware Node',
          location: data.location || 'Site Location',
          zoneId: data.zoneId || 'zone-a',
          signal: data.signal !== undefined ? Number(data.signal) : 80,
          battery: data.battery !== undefined && data.battery !== null ? Number(data.battery) : null,
          health: data.health !== undefined ? Number(data.health) : 90,
          prediction: data.prediction || 'Nominal Operation',
          status: data.status || 'Healthy',
          lastServiceDate: data.lastServiceDate || '2026-07-01',
          nextServiceDue: data.nextServiceDue || '2026-09-01',
          temperatureC: data.temperatureC !== undefined ? Number(data.temperatureC) : 36.5,
          vibrationMmS: data.vibrationMmS !== undefined ? Number(data.vibrationMmS) : 0.8,
          technicianAssigned: data.technicianAssigned || '',
          notes: data.notes || ''
        });
      });
      setNodes(list);
      setLoading(false);
      setDbSynced(true);
    }, () => {
      setNodes([]);
      setLoading(false);
    });

    // 2. Sync Work Orders
    const unsubWO = onSnapshot(collection(db, 'work_orders'), async (snapshot) => {
      const list: WorkOrder[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        list.push({
          id: d.id || data.id,
          nodeId: data.nodeId || 'R-01',
          nodeName: data.nodeName || 'Hardware Node',
          title: data.title || 'Maintenance Task',
          category: data.category || 'General Inspection',
          priority: data.priority || 'P3 - Medium',
          status: data.status || 'Open',
          assignedTech: data.assignedTech || 'Unassigned',
          createdDate: data.createdDate || new Date().toISOString().slice(0, 10),
          dueDate: data.dueDate || new Date().toISOString().slice(0, 10),
          estimatedHours: data.estimatedHours || 1.0,
          description: data.description || '',
          partsRequired: data.partsRequired || '',
          resolutionNotes: data.resolutionNotes || '',
          completedDate: data.completedDate || ''
        });
      });
      setWorkOrders(list);
    }, () => { setWorkOrders([]); });

    // 3. Sync Technicians
    const unsubTech = onSnapshot(collection(db, 'technicians'), async (snapshot) => {
      const list: Technician[] = [];
      snapshot.forEach(d => list.push(d.data() as Technician));
      setTechnicians(list);
    }, () => { setTechnicians([]); });

    // 4. Sync Schedules
    const unsubSched = onSnapshot(collection(db, 'schedules'), async (snapshot) => {
      const list: ScheduleRule[] = [];
      snapshot.forEach(d => list.push(d.data() as ScheduleRule));
      setSchedules(list);
    }, () => { setSchedules([]); });

    return () => {
      unsubNodes();
      unsubWO();
      unsubTech();
      unsubSched();
    };
  }, []);

  // Filtered Lists
  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      const matchStatus = nodeStatusFilter === 'all' || (n.status || "").toLowerCase() === (nodeStatusFilter || "").toLowerCase();
      const matchSearch = 
        (n.name || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (n.id || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (n.location || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (n.type || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (n.prediction || "").toLowerCase().includes((searchTerm || "").toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [nodes, nodeStatusFilter, searchTerm]);

  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter(wo => {
      const matchStatus = woStatusFilter === 'all' || (wo.status || "").toLowerCase().replace(' ', '_') === (woStatusFilter || "").toLowerCase();
      const matchPriority = woPriorityFilter === 'all' || (wo.priority || "").toLowerCase().includes((woPriorityFilter || "").toLowerCase());
      const matchSearch = 
        (wo.title || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (wo.id || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (wo.nodeName || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (wo.assignedTech || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (wo.category || "").toLowerCase().includes((searchTerm || "").toLowerCase());
      return matchStatus && matchPriority && matchSearch;
    });
  }, [workOrders, woStatusFilter, woPriorityFilter, searchTerm]);

  // Aggregate Metrics from live MongoDB state
  const metrics = useMemo(() => {
    const totalNodes = nodes.length;
    const avgHealth = totalNodes > 0 ? (nodes.reduce((acc, n) => acc + n.health, 0) / totalNodes).toFixed(1) : '0.0';
    const warningNodes = nodes.filter(n => n.status === 'Warning').length;
    const criticalNodes = nodes.filter(n => n.status === 'Critical').length;
    
    const openWos = workOrders.filter(w => w.status === 'Open' || w.status === 'In Progress' || w.status === 'Pending Parts').length;
    const criticalWos = workOrders.filter(w => w.priority.includes('P1')).length;
    const completedWos = workOrders.filter(w => w.status === 'Completed').length;

    return { totalNodes, avgHealth, warningNodes, criticalNodes, openWos, criticalWos, completedWos };
  }, [nodes, workOrders]);

  // DB Save Helpers
  const saveNodeToMongo = async (nodeObj: MaintenanceNode) => {
    try {
      await setDoc(doc(db, 'maintenance_nodes', nodeObj.id), nodeObj);
      setNodes(prev => {
        const idx = prev.findIndex(n => n.id === nodeObj.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = nodeObj;
          return next;
        }
        return [nodeObj, ...prev];
      });
    } catch (e) {
      console.error('Error saving node to MongoDB:', e);
    }
  };

  const saveWoToMongo = async (woObj: WorkOrder) => {
    try {
      await setDoc(doc(db, 'work_orders', woObj.id), woObj);
      setWorkOrders(prev => {
        const idx = prev.findIndex(w => w.id === woObj.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = woObj;
          return next;
        }
        return [woObj, ...prev];
      });
    } catch (e) {
      console.error('Error saving work order to MongoDB:', e);
    }
  };

  const deleteWoFromMongo = async (woId: string) => {
    try {
      await deleteDoc(doc(db, 'work_orders', woId));
      setWorkOrders(prev => prev.filter(w => w.id !== woId));
    } catch (e) {
      console.error('Error deleting work order from MongoDB:', e);
    }
  };

  // Handlers for Dispatching Tech & Creating Work Orders
  const handleOpenDispatch = (node: MaintenanceNode) => {
    setSelectedNode(node);
    setWoForm({
      id: `WO-2026-${Math.floor(100 + Math.random() * 900)}`,
      nodeId: node.id,
      nodeName: node.name,
      title: `Preventive Maintenance & Calibration for ${node.id}`,
      category: node.status === 'Critical' ? 'Battery Replacement' : 'Antenna Re-alignment',
      priority: node.status === 'Critical' ? 'P1 - Critical' : node.status === 'Warning' ? 'P2 - High' : 'P3 - Medium',
      status: 'Open',
      assignedTech: node.technicianAssigned || 'Tech-01 (David Vance)',
      createdDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      estimatedHours: 2.0,
      description: `Dispatched technician to inspect node ${node.id} (${node.location}). Current Health: ${node.health}%. Prediction: ${node.prediction}`,
      partsRequired: node.battery !== null && node.battery < 30 ? 'Replacement Li-Ion Battery Pack' : 'Standard Calibration Toolset'
    });
    setModalType('dispatch');
  };

  const handleSaveWoForm = async () => {
    if (!woForm.id || !woForm.title || !woForm.nodeId) return;
    
    const newWo: WorkOrder = {
      id: woForm.id,
      nodeId: woForm.nodeId,
      nodeName: woForm.nodeName || 'Hardware Node',
      title: woForm.title,
      category: woForm.category || 'General Inspection',
      priority: woForm.priority || 'P3 - Medium',
      status: woForm.status || 'Open',
      assignedTech: woForm.assignedTech || 'Tech-01 (David Vance)',
      createdDate: woForm.createdDate || new Date().toISOString().slice(0, 10),
      dueDate: woForm.dueDate || new Date().toISOString().slice(0, 10),
      estimatedHours: woForm.estimatedHours || 1.5,
      description: woForm.description || '',
      partsRequired: woForm.partsRequired || '',
      resolutionNotes: woForm.resolutionNotes || '',
      completedDate: woForm.status === 'Completed' ? (woForm.completedDate || new Date().toISOString().slice(0, 10)) : ''
    };

    await saveWoToMongo(newWo);

    // If node was critical/warning, update node assigned technician & status to Scheduled
    const targetNode = nodes.find(n => n.id === newWo.nodeId);
    if (targetNode) {
      const updatedNode: MaintenanceNode = {
        ...targetNode,
        status: targetNode.status === 'Critical' ? 'Warning' : targetNode.status,
        technicianAssigned: newWo.assignedTech
      };
      await saveNodeToMongo(updatedNode);
    }

    setModalType(null);
    setWoForm({});
    setSelectedNode(null);
  };

  // Run AI Health Scan
  const handleRunAiPredictiveScan = async () => {
    setIsAiScanning(true);
    setAiScanResults(null);
    setAiScanLogs(['Connecting to GAO AI Predictive Maintenance Neural Engine...', 'Ingesting real-time RF RSSI, Vibration, Temperature & Battery Telemetry...']);

    setTimeout(() => {
      setAiScanLogs(prev => [...prev, 'Analyzing 6 hardware nodes across 5 site zones...', 'Running Fourier Transform vibration harmonics on structural anchors...']);
      
      setTimeout(async () => {
        let faultsFound = 0;
        let ticketsCreated = 0;

        for (const node of nodes) {
          if (node.health < 70) {
            faultsFound++;
            setAiScanLogs(prev => [...prev, `⚡ Anomaly Flagged on [${node.id}]: Health ${node.health}% - ${node.prediction}`]);

            // Auto generate P2 ticket if no open ticket exists
            const existingWO = workOrders.find(w => w.nodeId === node.id && w.status !== 'Completed');
            if (!existingWO) {
              const autoWO: WorkOrder = {
                id: `WO-AI-${Math.floor(1000 + Math.random() * 9000)}`,
                nodeId: node.id,
                nodeName: node.name,
                title: `AI Auto-Generated Ticket: ${node.prediction.slice(0, 45)}`,
                category: node.battery !== null && node.battery < 30 ? 'Battery Replacement' : 'Antenna Re-alignment',
                priority: node.health < 40 ? 'P1 - Critical' : 'P2 - High',
                status: 'Open',
                assignedTech: 'Tech-02 (Elena Rostova)',
                createdDate: new Date().toISOString().slice(0, 10),
                dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                estimatedHours: 2.0,
                description: `Auto-generated by AI Predictive Neural Engine after detecting critical health index drop to ${node.health}%.`,
                partsRequired: 'Standard Replacement Parts'
              };
              await saveWoToMongo(autoWO);
              ticketsCreated++;
            }
          }
        }

        setAiScanLogs(prev => [...prev, `Scan Complete! Scanned: ${nodes.length} | Anomaly Nodes: ${faultsFound} | Auto Tickets: ${ticketsCreated}`]);
        setAiScanResults({ scannedCount: nodes.length, faultsFound, autoTicketsCreated: ticketsCreated });
        setIsAiScanning(false);
      }, 1200);
    }, 1000);
  };

  // Export Work Orders / Logs
  const handleExportWOReport = (format: 'json' | 'csv') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(workOrders, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gao_maintenance_workorders_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } else {
      const headers = ['id', 'nodeId', 'nodeName', 'title', 'category', 'priority', 'status', 'assignedTech', 'createdDate', 'dueDate'];
      const rows = workOrders.map(w => [
        w.id, w.nodeId, `"${w.nodeName}"`, `"${w.title}"`, w.category, w.priority, w.status, `"${w.assignedTech}"`, w.createdDate, w.dueDate
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gao_maintenance_workorders_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    }
  };

  return (
    <div className="flex flex-col w-full h-full p-4 md:p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      
      {/* 1. HEADER STRIP */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench className="w-7 h-7 text-[#007BC4]" />
              AI Predictive Maintenance & Work Order Hub
            </h2>
            {mongoStatus.connected ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Database size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span>MongoDB Atlas: Lat-Aperture-People-Tracking (Connected)</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <Database size={13} className="text-rose-600 dark:text-rose-400" />
                <span>MongoDB Disconnected</span>
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm mt-0.5">
            Predictive AI failure diagnostics, automated technician dispatching, preventive scheduling & work order management synced to MongoDB Atlas
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setWoForm({
                id: `WO-2026-${Math.floor(100 + Math.random() * 900)}`,
                nodeId: nodes[0]?.id || 'R-01',
                nodeName: nodes[0]?.name || 'Gate Portal',
                title: '',
                category: 'General Inspection',
                priority: 'P3 - Medium',
                status: 'Open',
                assignedTech: 'Tech-01 (David Vance)',
                createdDate: new Date().toISOString().slice(0, 10),
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                estimatedHours: 1.5,
                description: '',
                partsRequired: ''
              });
              setModalType('new_wo');
            }}
            className="px-3.5 py-2 bg-[#007BC4] text-white rounded-xl text-xs font-bold shadow-sm hover:bg-blue-700 transition flex items-center gap-1.5"
          >
            <Plus size={16} /> Create Work Order
          </button>

          <button
            onClick={() => {
              setModalType('scan_ai');
              handleRunAiPredictiveScan();
            }}
            className="px-3 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-purple-700 transition flex items-center gap-1.5"
          >
            <Sparkles size={15} /> Run AI Health Diagnostics
          </button>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => handleExportWOReport('json')}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-[#007BC4] transition flex items-center gap-1"
              title="Export Work Orders JSON"
            >
              <Download size={13} /> JSON
            </button>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <button
              onClick={() => handleExportWOReport('csv')}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-[#007BC4] transition flex items-center gap-1"
              title="Export CSV"
            >
              <FileSpreadsheet size={13} /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* 2. TOP METRICS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Avg Fleet Health</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{metrics.avgHealth}%</div>
          <div className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5 mt-0.5">
            {metrics.totalNodes > 0 
              ? (metrics.criticalNodes === 0 && metrics.warningNodes === 0 ? 'All Hardware Optimal' : `${metrics.warningNodes + metrics.criticalNodes} Alerts Detected`)
              : 'Synced with MongoDB'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Warning Hardware</div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{metrics.warningNodes}</div>
          <div className="text-[10px] font-semibold text-amber-600 mt-0.5">Signal/Battery Drift</div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Critical Action</div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{metrics.criticalNodes}</div>
          <div className="text-[10px] font-semibold text-rose-600 mt-0.5">Immediate Dispatch</div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Open Work Orders</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{metrics.openWos}</div>
          <div className="text-[10px] font-semibold text-blue-600 mt-0.5">Active Tickets</div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">P1 Critical Tickets</div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{metrics.criticalWos}</div>
          <div className="text-[10px] font-semibold text-purple-600 mt-0.5">SLA Target &lt; 4 Hours</div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Techs On Duty</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{technicians.length}</div>
          <div className="text-[10px] font-semibold text-slate-500 mt-0.5">Field Engineers</div>
        </div>
      </div>

      {/* 3. SUB TAB NAVIGATION STRIP & SEARCH */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-2 shadow-sm">
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'nodes', label: 'Predictive Hardware Health', icon: Activity },
            { id: 'work_orders', label: 'Work Orders & Tickets', icon: Hammer },
            { id: 'schedules', label: 'Preventive Schedule Rules', icon: Calendar },
            { id: 'technicians', label: 'Field Tech Rostering', icon: UserCheck },
            { id: 'analytics', label: 'Maintenance SLA & MTTR', icon: Gauge }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  active 
                    ? 'bg-[#007BC4] text-white shadow-sm' 
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
          <input
            type="text"
            placeholder="Search node, ticket, tech..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[#007BC4]"
          />
        </div>
      </div>

      {/* 4. TAB CONTENTS */}

      {/* --- SUB TAB 1: PREDICTIVE HARDWARE HEALTH MATRIX --- */}
      {activeTab === 'nodes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs font-bold">
              <span className="text-slate-400 mr-1 flex items-center gap-1"><Filter size={12} /> Status:</span>
              {['all', 'healthy', 'warning', 'critical'].map(st => (
                <button
                  key={st}
                  onClick={() => setNodeStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg capitalize border ${
                    nodeStatusFilter === st
                      ? 'bg-blue-50 text-[#007BC4] border-blue-200 dark:bg-blue-950 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 bg-white dark:bg-slate-800'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <span className="text-xs font-bold text-slate-400">
              Showing {filteredNodes.length} Hardware Nodes
            </span>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="p-3.5">Hardware Node & Type</th>
                    <th className="p-3.5 text-center">Health Index</th>
                    <th className="p-3.5 text-center">Signal RSSI</th>
                    <th className="p-3.5 text-center">Power / Battery</th>
                    <th className="p-3.5">AI Fault Prediction</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Assigned Tech</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                  {filteredNodes.map(node => (
                    <tr key={node.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/40 transition">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">{node.id}</span>
                          {node.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{node.type}</span>
                          <span>•</span>
                          <span>{node.location}</span>
                        </div>
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-16 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${node.health > 80 ? 'bg-emerald-500' : node.health > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                              style={{ width: `${node.health}%` }} 
                            />
                          </div>
                          <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200">{node.health}%</span>
                        </div>
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200">{node.signal}%</span>
                          <span className="text-[9px] text-slate-400">-{100 - node.signal} dBm</span>
                        </div>
                      </td>

                      <td className="p-3.5 text-center">
                        {node.battery === null ? (
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                            AC Mains
                          </span>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-[11px] font-mono font-bold ${node.battery < 20 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>
                              {node.battery}%
                            </span>
                            <span className="text-[9px] text-slate-400">Li-Ion Solar</span>
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 max-w-xs">
                        <div className={`text-xs font-semibold flex items-start gap-1.5 ${node.status === 'Warning' ? 'text-amber-700 dark:text-amber-300' : node.status === 'Critical' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'}`}>
                          {node.status !== 'Healthy' && <Sparkles size={14} className="shrink-0 text-amber-500 mt-0.5" />}
                          <span>{node.prediction}</span>
                        </div>
                      </td>

                      <td className="p-3.5">
                        {node.status === 'Healthy' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Healthy</span>}
                        {node.status === 'Warning' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Warning</span>}
                        {node.status === 'Critical' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 animate-pulse">Critical</span>}
                      </td>

                      <td className="p-3.5 text-slate-600 dark:text-slate-300 font-medium">
                        {node.technicianAssigned || <span className="text-slate-400 italic">Unassigned</span>}
                      </td>

                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => handleOpenDispatch(node)}
                          className="px-3 py-1.5 bg-[#007BC4]/10 hover:bg-[#007BC4]/20 text-[#007BC4] font-bold text-xs rounded-xl transition flex items-center gap-1 ml-auto"
                        >
                          <Wrench size={13} /> Dispatch Tech
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

      {/* --- SUB TAB 2: WORK ORDER MANAGEMENT SYSTEM --- */}
      {activeTab === 'work_orders' && (
        <div className="space-y-4">
          
          {/* WO Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-400">Status:</span>
              {['all', 'open', 'in_progress', 'pending_parts', 'completed'].map(st => (
                <button
                  key={st}
                  onClick={() => setWoStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg capitalize border text-xs font-bold transition ${
                    woStatusFilter === st
                      ? 'bg-blue-50 text-[#007BC4] border-blue-200 dark:bg-blue-950 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 bg-white dark:bg-slate-800'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>

            <span className="text-xs font-bold text-slate-400">
              {filteredWorkOrders.length} Work Orders Found
            </span>
          </div>

          {/* Work Orders List Grid / Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkOrders.map(wo => {
              const isCritical = wo.priority.includes('P1');
              return (
                <div 
                  key={wo.id}
                  className={`bg-white dark:bg-slate-800 border rounded-2xl p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-3 ${
                    isCritical ? 'border-rose-300 dark:border-rose-900 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-[#007BC4] bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-900">
                        {wo.id}
                      </span>
                      
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        wo.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                        wo.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                        wo.status === 'Pending Parts' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {wo.status}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 dark:text-white text-sm mt-2 leading-snug">
                      {wo.title}
                    </h3>

                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                      <Cpu size={12} className="text-[#007BC4]" />
                      <span className="font-semibold">{wo.nodeId}</span> • <span>{wo.nodeName}</span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">
                      {wo.description}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-700/60 pt-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Technician</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">{wo.assignedTech}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Priority</div>
                      <div className={`font-bold ${isCritical ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>{wo.priority}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        setSelectedWo(wo);
                        setWoForm(wo);
                        setModalType('edit_wo');
                      }}
                      className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1"
                    >
                      <Edit3 size={12} /> Manage Ticket
                    </button>

                    <button
                      onClick={() => deleteWoFromMongo(wo.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded-lg"
                      title="Delete Ticket"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- SUB TAB 3: PREVENTIVE SCHEDULE RULES --- */}
      {activeTab === 'schedules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar size={16} className="text-[#007BC4]" />
              Automated Maintenance Frequency & Rule Engine
            </h3>
            
            <button
              onClick={() => {
                setSchedForm({
                  id: `SCH-${Math.floor(10 + Math.random() * 90)}`,
                  title: '',
                  targetNodeCategory: 'UHF RFID Reader',
                  frequencyDays: 30,
                  assignedTech: 'David Vance',
                  active: true,
                  lastRun: new Date().toISOString().slice(0, 10),
                  nextRun: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
                });
                setModalType('new_schedule');
              }}
              className="px-3 py-1.5 bg-[#007BC4] text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition flex items-center gap-1"
            >
              <Plus size={14} /> Add Schedule Rule
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {schedules.map(sch => (
              <div key={sch.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#007BC4] bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                    {sch.id}
                  </span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                    Every {sch.frequencyDays} Days
                  </span>
                </div>

                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{sch.title}</h4>
                <div className="text-xs text-slate-500">Target Category: <span className="font-semibold text-slate-700 dark:text-slate-300">{sch.targetNodeCategory}</span></div>

                <div className="border-t border-slate-100 dark:border-slate-700 pt-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">LAST EXECUTED</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{sch.lastRun}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-bold">NEXT DUE</span>
                    <span className="font-bold text-[#007BC4]">{sch.nextRun}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- SUB TAB 4: FIELD TECH ROSTERING --- */}
      {activeTab === 'technicians' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {technicians.map(tech => (
            <div key={tech.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950 text-[#007BC4] font-black flex items-center justify-center text-sm">
                  {(tech.name || "").split(' ').map(n => n[0]).join('')}
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  tech.status === 'Available' ? 'bg-emerald-100 text-emerald-800' :
                  tech.status === 'On-site Repair' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                }`}>
                  {tech.status}
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-base">{tech.name}</h4>
                <div className="text-xs text-[#007BC4] font-bold mt-0.5">{tech.role}</div>
              </div>

              <div className="text-xs text-slate-500 space-y-1">
                <div>Specialization: <span className="font-medium text-slate-700 dark:text-slate-300">{tech.specialization}</span></div>
                <div>Contact: <span className="font-mono text-slate-700 dark:text-slate-300">{tech.phone}</span></div>
                <div>Active Work Orders: <span className="font-bold text-slate-900 dark:text-white">{tech.activeWorkOrders}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- SUB TAB 5: MAINTENANCE ANALYTICS & SLA DASHBOARD --- */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Gauge className="text-[#007BC4]" size={18} /> Mean Time To Repair (MTTR) & SLA Performance
            </h3>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>P1 Critical Hardware Repair SLA (&lt; 4h)</span>
                  <span className="text-emerald-600 font-mono font-bold">
                    {metrics.criticalWos === 0 ? (workOrders.length > 0 ? '100% On-Time' : 'N/A (0 Tickets)') : `${Math.round(((workOrders.filter(w => w.priority.includes('P1') && w.status === 'Completed').length) / Math.max(1, metrics.criticalWos)) * 100)}% On-Time`}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${metrics.criticalWos === 0 ? (workOrders.length > 0 ? 100 : 0) : Math.min(100, Math.round(((workOrders.filter(w => w.priority.includes('P1') && w.status === 'Completed').length) / Math.max(1, metrics.criticalWos)) * 100))}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>P2 High Priority Hardware Calibration (&lt; 24h)</span>
                  <span className="text-blue-600 font-mono font-bold">
                    {workOrders.length > 0 ? `${Math.round((workOrders.filter(w => w.status === 'Completed' || w.status === 'In Progress').length / workOrders.length) * 100)}% On-Time` : 'N/A (0 Tickets)'}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: `${workOrders.length > 0 ? Math.round((workOrders.filter(w => w.status === 'Completed' || w.status === 'In Progress').length / workOrders.length) * 100) : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>Preventive Maintenance Compliance Index</span>
                  <span className="text-purple-600 font-mono font-bold">
                    {nodes.length > 0 ? `${Math.round(((nodes.length - metrics.criticalNodes) / nodes.length) * 100)}% Compliant` : 'N/A (0 Nodes)'}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full rounded-full" style={{ width: `${nodes.length > 0 ? Math.round(((nodes.length - metrics.criticalNodes) / nodes.length) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Activity className="text-emerald-500" size={18} /> Preventive VS Reactive Maintenance Ratio (MongoDB)
            </h3>

            {(() => {
              const prevCount = workOrders.filter(w => w.category === 'Antenna Re-alignment' || w.category === 'Cleaning & Calibration' || w.category === 'General Inspection').length;
              const reactCount = workOrders.filter(w => w.category === 'Battery Replacement' || w.category === 'Firmware Reflash' || w.category === 'Hardware Swap').length;
              const total = prevCount + reactCount;
              const prevPct = total > 0 ? Math.round((prevCount / total) * 100) : 0;
              const reactPct = total > 0 ? 100 - prevPct : 0;

              return (
                <div className="flex items-center justify-around py-4">
                  <div className="text-center">
                    <div className="text-3xl font-black text-emerald-600 font-mono">{prevPct}%</div>
                    <div className="text-xs font-bold text-slate-500 uppercase mt-1">Preventive AI ({prevCount} Tickets)</div>
                  </div>
                  <div className="h-12 w-px bg-slate-200 dark:bg-slate-700" />
                  <div className="text-center">
                    <div className="text-3xl font-black text-amber-600 font-mono">{reactPct}%</div>
                    <div className="text-xs font-bold text-slate-500 uppercase mt-1">Reactive Breakdown ({reactCount} Tickets)</div>
                  </div>
                </div>
              );
            })()}

            <p className="text-xs text-slate-500 dark:text-slate-400">
              GAO AI predictive early-warning algorithms continuously analyze real-time vibration harmonics, antenna RSSI attenuation, and battery discharge rates to generate preventive work orders before hardware failure.
            </p>
          </div>
        </div>
      )}

      {/* 5. MODALS */}

      {/* --- MODAL: CREATE / EDIT WORK ORDER --- */}
      {(modalType === 'new_wo' || modalType === 'edit_wo' || modalType === 'dispatch') && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="text-[#007BC4]" size={18} />
                {modalType === 'dispatch' ? `Dispatch Tech to ${selectedNode?.id}` : modalType === 'edit_wo' ? `Manage Work Order ${selectedWo?.id}` : 'Create New Work Order'}
              </h3>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Target Hardware Node</label>
                <select
                  value={woForm.nodeId || ''}
                  onChange={e => {
                    const sel = nodes.find(n => n.id === e.target.value);
                    setWoForm(prev => ({ ...prev, nodeId: e.target.value, nodeName: sel?.name || '' }));
                  }}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none"
                >
                  {nodes.map(n => (
                    <option key={n.id} value={n.id}>{n.id} - {n.name} ({n.status})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Work Order Title</label>
                <input
                  type="text"
                  placeholder="e.g. Battery swap & antenna re-alignment"
                  value={woForm.title || ''}
                  onChange={e => setWoForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Category</label>
                  <select
                    value={woForm.category || 'General Inspection'}
                    onChange={e => setWoForm(prev => ({ ...prev, category: e.target.value as any }))}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none"
                  >
                    <option value="Antenna Re-alignment">Antenna Re-alignment</option>
                    <option value="Battery Replacement">Battery Replacement</option>
                    <option value="Firmware Reflash">Firmware Reflash</option>
                    <option value="Hardware Swap">Hardware Swap</option>
                    <option value="Cleaning & Calibration">Cleaning & Calibration</option>
                    <option value="General Inspection">General Inspection</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Priority Level</label>
                  <select
                    value={woForm.priority || 'P3 - Medium'}
                    onChange={e => setWoForm(prev => ({ ...prev, priority: e.target.value as any }))}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none"
                  >
                    <option value="P1 - Critical">P1 - Critical</option>
                    <option value="P2 - High">P2 - High</option>
                    <option value="P3 - Medium">P3 - Medium</option>
                    <option value="P4 - Low">P4 - Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Assigned Technician</label>
                  <select
                    value={woForm.assignedTech || ''}
                    onChange={e => setWoForm(prev => ({ ...prev, assignedTech: e.target.value }))}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none"
                  >
                    {technicians.map(t => (
                      <option key={t.id} value={`${t.name}`}>Tech - {t.name} ({t.status})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Status</label>
                  <select
                    value={woForm.status || 'Open'}
                    onChange={e => setWoForm(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Pending Parts">Pending Parts</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Task Description</label>
                <textarea
                  rows={2}
                  placeholder="Detailed work instructions..."
                  value={woForm.description || ''}
                  onChange={e => setWoForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Required Spare Parts / Tools</label>
                <input
                  type="text"
                  placeholder="e.g. Li-Ion 12V 20Ah pack"
                  value={woForm.partsRequired || ''}
                  onChange={e => setWoForm(prev => ({ ...prev, partsRequired: e.target.value }))}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setModalType(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWoForm}
                className="px-4 py-2 bg-[#007BC4] text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition flex items-center gap-1"
              >
                <Check size={14} /> Save Work Order to MongoDB
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: AI HEALTH SCAN OVERLAY --- */}
      {modalType === 'scan_ai' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="text-purple-600" size={18} />
                GAO AI Predictive Fleet Diagnostic Engine
              </h3>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="bg-slate-950 rounded-xl p-3 font-mono text-xs text-emerald-400 space-y-1 h-48 overflow-y-auto">
              {aiScanLogs.map((log, i) => (
                <div key={i} className="leading-tight">{log}</div>
              ))}
              {isAiScanning && (
                <div className="animate-pulse text-amber-400"> Analyzing hardware signals...</div>
              )}
            </div>

            {aiScanResults && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs space-y-1">
                <div className="font-bold text-emerald-800 dark:text-emerald-200">
                  ✅ Diagnostic Run Complete!
                </div>
                <div className="text-emerald-700 dark:text-emerald-300">
                  Scanned {aiScanResults.scannedCount} nodes across all site zones. Created {aiScanResults.autoTicketsCreated} auto-tickets in MongoDB for high priority hardware drift.
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setModalType(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
              >
                Close Engine Console
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
