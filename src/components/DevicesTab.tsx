import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Radio, Wifi, WifiOff, AlertCircle, RefreshCw, MoreVertical, Plus, X, Save,
  MapPin, Cpu, Video, Eye, CloudSun, Satellite, Sliders, Download, CheckCircle2,
  Zap, Thermometer, Activity, Layers, ShieldCheck, AlertTriangle, Gauge, Terminal,
  Settings2, Maximize2, CircleDot, HardDrive, Play, ArrowUpRight,
  Clock, Shield, Sparkles, Filter, Check, RotateCcw, Grid, List, Edit3, Trash2,
  Upload, CheckSquare, Square, FileSpreadsheet, SlidersHorizontal, ChevronRight,
  Database, HardHat, Tag, Battery, BatteryCharging, UserCheck
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, db } from '../lib/db';
import { useNavigate } from 'react-router-dom';
import webSocketService, { WSConnectionStatus } from '../lib/webSocketService';
import mqttStreamService, { MqttMetrics } from '../lib/mqttService';
import { globalSseClient } from '../lib/realtimeClients';
import { useTerminology, useTracking } from '../context/TrackingContext';
import { formatEdtTime } from '../lib/dateTimeUtils';

export interface DeviceItem {
  id: string;
  name: string;
  category: 'rfid' | 'ble' | 'gps' | 'iot' | 'cctv' | 'ai_camera' | 'weather' | 'rfid_tag';
  type: string;
  location: string;
  zoneId: string;
  status: 'online' | 'warning' | 'critical' | 'offline';
  ip: string;
  mac: string;
  firmware: string;
  latestFirmware: string;
  signalRssi: number; // e.g. -58 dBm
  coverageRadiusMeters: number;
  temperatureC: number;
  cpuUsagePct: number;
  memoryUsagePct: number;
  pingMs: number;
  uptime: string;
  lastPing: string;
  calibrationStatus: 'Calibrated' | 'Needs Calibration' | 'Calibrating';
  otaStatus: 'Up to Date' | 'Update Available' | 'Updating';
  powerSource?: 'PoE' | 'AC 220V' | 'Solar + Battery' | 'Li-Ion Battery';
  notes?: string;
  protocols?: string;
  battery?: number;
  workerName?: string;
  workerRole?: string;
  ppeStatus?: string;
  presenceState?: string;
}

const DEFAULT_SITE_DEVICES: DeviceItem[] = [];

export default function DevicesTab() {
  const navigate = useNavigate();
  const { zones, people, liveTags } = useTracking();
  const {
    personnelSingular,
    personnelPlural,
    idBadgeLabel,
    roleLabel,
    zoneLabel,
    siteLabel,
    organizationType,
    subcontractors,
    config
  } = useTerminology();

  // State
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbSynced, setDbSynced] = useState(false);
  const [mongoStatus, setMongoStatus] = useState<{
    connected: boolean;
    engine?: string;
    database?: string;
    totalRecords?: number;
    latencyMs?: number;
  }>({ connected: true, engine: 'MongoDB Atlas', database: 'Lat-Aperture-People-Tracking' });

  // Real-time Multi-Protocol Status & Streaming Controls
  const [streamMode, setStreamMode] = useState<'WebSocket' | 'SSE' | 'MQTT' | 'Multi-Protocol'>('Multi-Protocol');
  const [wsStatus, setWsStatus] = useState<WSConnectionStatus>('Disconnected');
  const [sseStatus, setSseStatus] = useState<string>('Disconnected');
  const [mqttStatus, setMqttStatus] = useState<string>('Disconnected');
  const [mqttMetrics, setMqttMetrics] = useState<MqttMetrics>(mqttStreamService.getMetrics());
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    const checkMongo = async () => {
      try {
        const start = Date.now();
        const res = await fetch('/api/mongodb/status');
        const latency = Date.now() - start;
        if (res.ok) {
          const data = await res.json();
          setMongoStatus({
            connected: Boolean(data.connected),
            engine: data.engine || 'MongoDB Atlas',
            database: 'Lat-Aperture-People-Tracking',
            totalRecords: data.totalRecords || 0,
            latencyMs: latency
          });
        }
      } catch {}
    };
    checkMongo();
  }, []);

  useEffect(() => {
    const unsubWs = webSocketService.subscribeStatus((status, syncTime) => {
      setWsStatus(status);
      setLastSyncTime(syncTime);
    });

    globalSseClient.connect();
    const unsubSse = globalSseClient.onStatus((s) => setSseStatus(s));

    mqttStreamService.connect();
    const unsubMqttStatus = mqttStreamService.onStatusChange((s) => setMqttStatus(s));
    const unsubMqttMetrics = mqttStreamService.onMetricsUpdate((m) => setMqttMetrics(m));

    return () => {
      unsubWs();
      unsubSse();
      unsubMqttStatus();
      unsubMqttMetrics();
    };
  }, []);

  // View & Tab State
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab] = useState<'inventory'>('inventory');

  // Selection & Batch Operations
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // Modals & Action States
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
  const [actionModalType, setActionModalType] = useState<'restart' | 'calibrate' | 'ota' | 'diagnostics' | 'add' | 'edit' | 'delete' | 'import' | null>(null);
  const [inspectingDevice, setInspectingDevice] = useState<DeviceItem | null>(null);

  // Interactive Action Progress
  const [actionProgress, setActionProgress] = useState<number>(0);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Terminal Simulator State inside Inspector
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<Array<{ cmd: string; output: string }>>([
    { cmd: 'system-status', output: 'GAO Hardware Subsystem Kernel v4.19-gao-rt\nSocket link: ESTABLISHED (1000 Mbps Full Duplex)\nAntenna Gain: +24 dBm | Noise Floor: -98 dBm' }
  ]);

  // Form States (Add / Edit)
  const [editForm, setEditForm] = useState<Partial<DeviceItem>>({});
  const [importJsonText, setImportJsonText] = useState('');

  // Sync with MongoDB (devices + hardware_readers)
  useEffect(() => {
    setLoading(true);
    let devList: DeviceItem[] = [];
    let hardwareReadersList: DeviceItem[] = [];
    let isMounted = true;

    const mergeAndSet = () => {
      if (!isMounted) return;
      const devMap = new Map<string, DeviceItem>();
      // 1. Hardware Readers from MongoDB
      hardwareReadersList.forEach(d => {
        if (d.id && d.category !== 'rfid_tag') {
          const idKey = d.id.toUpperCase();
          const existing = devMap.get(idKey);
          devMap.set(idKey, existing ? { ...existing, ...d, name: d.name || existing.name } : d);
        }
      });
      // 2. Devices collection from MongoDB (HIGHEST PRIORITY - User configured names always win)
      devList.forEach(d => {
        if (d.id && d.category !== 'rfid_tag') {
          const idKey = d.id.toUpperCase();
          const existing = devMap.get(idKey);
          devMap.set(idKey, existing ? { ...existing, ...d, name: d.name || existing.name } : d);
        }
      });

      setDevices(Array.from(devMap.values()));
      setLoading(false);
      setDbSynced(true);
    };

    // Direct REST API Fallback & Continuous Poller for MongoDB Devices & Hardware Readers
    const fetchDirectFromApi = async () => {
      try {
        const token = localStorage.getItem('gao_jwt_token') || localStorage.getItem('aperture_token') || localStorage.getItem('token') || localStorage.getItem('auth_token');
        const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) { authHeaders['Authorization'] = `Bearer ${token}`; }

        // Fetch devices from MongoDB
        const [devRes, readerRes] = await Promise.allSettled([
          fetch('/api/data/devices', { headers: authHeaders }),
          fetch('/api/data/hardware_readers', { headers: authHeaders })
        ]);

        if (devRes.status === 'fulfilled' && devRes.value.ok) {
          const dbDevices = await devRes.value.json();
          if (Array.isArray(dbDevices) && dbDevices.length > 0) {
            devList = dbDevices.filter((d: any) => d.category !== 'rfid_tag').map(d => ({
              id: d.id,
              name: d.name || 'Unnamed Device',
              category: d.category || 'rfid',
              type: d.type || 'Reader Gateway',
              location: d.location || d.zone || 'Site Location',
              zoneId: (d.zoneId || d.zone || d.location || 'zone-a').toLowerCase().replace(/\s+/g, '-'),
              status: (d.status || 'online').toLowerCase() as any,
              ip: d.ipAddress || d.ip || '192.168.10.100',
              mac: d.macAddress || d.mac || '00:1A:2B:3C:4D:FE',
              firmware: d.firmware || 'v2.0.0',
              latestFirmware: d.latestFirmware || 'v2.0.0',
              signalRssi: d.signalRssi !== undefined ? Number(d.signalRssi) : -60,
              coverageRadiusMeters: d.coverageRadiusMeters || d.range || 20,
              temperatureC: d.temperatureC || 36,
              cpuUsagePct: d.cpuUsagePct || 20,
              memoryUsagePct: d.memoryUsagePct || 40,
              pingMs: d.pingMs || 10,
              uptime: d.uptime || '1d 0h',
              lastPing: d.lastPing || 'Just now',
              calibrationStatus: d.calibrationStatus || 'Calibrated',
              otaStatus: d.otaStatus || 'Up to Date',
              powerSource: d.powerSource || 'PoE',
              notes: d.notes || '',
              battery: d.battery !== undefined ? d.battery : 100
            }));
          }
        }

        if (readerRes.status === 'fulfilled' && readerRes.value.ok) {
          const dbReaders = await readerRes.value.json();
          if (Array.isArray(dbReaders) && dbReaders.length > 0) {
            hardwareReadersList = dbReaders.filter((d: any) => d.category !== 'rfid_tag').map(d => {
              const readerId = d.id || d.readerId || d.serialno || 'portal-reader';
              return {
                id: readerId,
                name: d.name || (d.model ? `GAO ${d.model} Reader (${d.serialno || readerId})` : `Hardware Reader Gateway (${d.serialno || readerId})`),
                category: 'rfid',
                type: d.type || 'UHF Fixed Portal',
                location: d.location || d.zone || 'Facility Portal / Access Point',
                zoneId: (d.zoneId || d.zone || d.location || 'portal-1').toLowerCase().replace(/\s+/g, '-'),
                status: (d.status || 'online').toLowerCase() as any,
                ip: d.ipAddress || d.ip || '192.168.1.101',
                mac: d.macAddress || d.mac || '00:1A:79:39:63:43',
                firmware: d.firmware || 'v4.19.2',
                latestFirmware: 'v4.19.2',
                signalRssi: d.powerDbm ? -Number(d.powerDbm) : (d.rssi !== undefined ? Number(d.rssi) : -50),
                coverageRadiusMeters: d.range || 35,
                temperatureC: d.temperatureC || 38,
                cpuUsagePct: d.cpuUsagePct || 24,
                memoryUsagePct: d.memoryUsagePct || 40,
                pingMs: d.pingMs || 8,
                uptime: 'Active',
                lastPing: 'Just now',
                calibrationStatus: 'Calibrated',
                otaStatus: 'Up to Date',
                powerSource: 'PoE',
                notes: d.notes || `Hardware Reader Serial: ${d.serialno || readerId}. Antennas: ${(d.antennas || []).length || 1}.`
              };
            });
          }
        }

        mergeAndSet();
      } catch (err) {
        console.warn('[DevicesTab] Poller notice:', err);
      }
    };

    fetchDirectFromApi();
    const interval = setInterval(fetchDirectFromApi, 2000);
    window.addEventListener('gao_refresh_data', fetchDirectFromApi);
    window.addEventListener('gao_map_data_updated', fetchDirectFromApi);
    window.addEventListener('gao_data_updated', fetchDirectFromApi);

    const unsubDevices = onSnapshot(collection(db, 'devices'), async (snapshot) => {
      devList = [];
      snapshot.forEach(d => {
        const data = d.data();
        devList.push({
          id: d.id || data.id,
          name: data.name || 'Unnamed Device',
          category: data.category || 'rfid',
          type: data.type || 'Reader Gateway',
          location: data.location || data.zone || 'Site Location',
          zoneId: (data.zoneId || data.zone || data.location || 'zone-a').toLowerCase().replace(/\s+/g, '-'),
          status: (data.status || 'online').toLowerCase() as any,
          ip: data.ipAddress || data.ip || '192.168.10.100',
          mac: data.macAddress || data.mac || '00:1A:2B:3C:4D:FE',
          firmware: data.firmware || 'v2.0.0',
          latestFirmware: data.latestFirmware || 'v2.0.0',
          signalRssi: data.signalRssi !== undefined ? Number(data.signalRssi) : -60,
          coverageRadiusMeters: data.coverageRadiusMeters || data.range || 20,
          temperatureC: data.temperatureC || 36,
          cpuUsagePct: data.cpuUsagePct || 20,
          memoryUsagePct: data.memoryUsagePct || 40,
          pingMs: data.pingMs || 10,
          uptime: data.uptime || '1d 0h',
          lastPing: data.lastPing || 'Just now',
          calibrationStatus: data.calibrationStatus || 'Calibrated',
          otaStatus: data.otaStatus || 'Up to Date',
          powerSource: data.powerSource || 'PoE',
          notes: data.notes || '',
          battery: data.battery !== undefined ? data.battery : 100
        });
      });
      mergeAndSet();
    }, (err) => {
      console.warn('MongoDB devices listener error:', err);
      mergeAndSet();
    });

    const unsubHwReaders = onSnapshot(collection(db, 'hardware_readers'), (snapshot) => {
      hardwareReadersList = [];
      snapshot.forEach(d => {
        const data = d.data();
        const readerId = d.id || data.serialno || data.readerId || 'portal-reader';
        hardwareReadersList.push({
          id: readerId,
          name: data.name || (data.model ? `GAO ${data.model} Reader (${data.serialno || readerId})` : `Hardware Reader Gateway (${data.serialno || readerId})`),
          category: 'rfid',
          type: data.type || 'UHF Fixed Portal',
          location: data.location || data.zone || 'Facility Portal / Access Point',
          zoneId: (data.zoneId || data.zone || data.location || 'portal-1').toLowerCase().replace(/\s+/g, '-'),
          status: (data.status || 'online').toLowerCase() as any,
          ip: data.ipAddress || data.ip || '192.168.1.101',
          mac: data.macAddress || data.mac || '00:1A:79:39:63:43',
          firmware: data.firmware || 'v4.19.2',
          latestFirmware: 'v4.19.2',
          signalRssi: data.powerDbm ? -Number(data.powerDbm) : (data.rssi !== undefined ? Number(data.rssi) : -50),
          coverageRadiusMeters: data.range || 35,
          temperatureC: data.temperatureC || 38,
          cpuUsagePct: data.cpuUsagePct || 24,
          memoryUsagePct: data.memoryUsagePct || 40,
          pingMs: data.pingMs || 8,
          uptime: 'Active',
          lastPing: 'Just now',
          calibrationStatus: 'Calibrated',
          otaStatus: 'Up to Date',
          powerSource: 'PoE',
          notes: data.notes || `Hardware Reader Serial: ${data.serialno || readerId}. Antennas: ${(data.antennas || []).length || 1}.`
        });
      });
      mergeAndSet();
    }, (err) => {
      console.warn('hardware_readers listener notice:', err);
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('gao_refresh_data', fetchDirectFromApi);
      window.removeEventListener('gao_map_data_updated', fetchDirectFromApi);
      window.removeEventListener('gao_data_updated', fetchDirectFromApi);
      unsubDevices();
      unsubHwReaders();
    };
  }, []);

  // Master list of Hardware Readers & Infrastructure Gateways (wearable tags excluded)
  const allDevices: DeviceItem[] = useMemo(() => {
    return devices.filter(d => d && d.category !== 'rfid_tag');
  }, [devices]);

  // Filtered Devices
  const filteredDevices = useMemo(() => {
    return allDevices.filter(dev => {
      const matchesCategory = selectedCategory === 'all' || dev.category === selectedCategory;
      const matchesStatus = selectedStatus === 'all' || dev.status === selectedStatus;
      const matchesSearch =
        (dev.name || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.id || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.ip || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.mac || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.location || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.workerName || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.type || "").toLowerCase().includes((searchTerm || "").toLowerCase());
      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [allDevices, selectedCategory, selectedStatus, searchTerm]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = allDevices.length;
    const online = allDevices.filter(d => d.status === 'online').length;
    const warning = allDevices.filter(d => d.status === 'warning').length;
    const critical = allDevices.filter(d => d.status === 'critical').length;
    const offline = allDevices.filter(d => d.status === 'offline').length;
    const otaPending = allDevices.filter(d => d.otaStatus === 'Update Available').length;
    const needsCalib = allDevices.filter(d => d.calibrationStatus === 'Needs Calibration').length;

    return { total, online, warning, critical, offline, otaPending, needsCalib };
  }, [allDevices]);

  // Helper to save single device to MongoDB
  const saveDeviceToMongo = async (device: DeviceItem) => {
    try {
      const token = localStorage.getItem('gao_jwt_token') || localStorage.getItem('aperture_token') || localStorage.getItem('token') || localStorage.getItem('auth_token');
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) { authHeaders['Authorization'] = `Bearer ${token}`; }
      const encodedId = encodeURIComponent(device.id);

      // 1. Direct MongoDB REST endpoints with authentication
      const promises: Promise<any>[] = [
        fetch('/api/data/devices', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(device)
        }),
        fetch(`/api/data/devices/${encodedId}`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(device)
        })
      ];

      if (device.category === 'rfid' || (device.type || '').toLowerCase().includes('reader') || (device.type || '').toLowerCase().includes('portal')) {
        const readerPayload = {
          id: device.id,
          readerId: device.id,
          name: device.name,
          location: device.location,
          zone: device.location,
          ipAddress: device.ip,
          macAddress: device.mac,
          status: (device.status || 'online').toUpperCase(),
          type: device.type,
          range: device.coverageRadiusMeters || 25,
          powerDbm: 30,
          antennaGainDbi: 9,
          frequencyBand: 'US 902-928 MHz UHF'
        };
        promises.push(
          fetch('/api/data/hardware_readers', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(readerPayload)
          }),
          fetch(`/api/data/hardware_readers/${encodedId}`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(readerPayload)
          })
        );
      }

      // If editing a worker tag/badge, also sync the rename into registered_people & people
      if (device.category === 'rfid_tag' || device.workerName) {
        const workerName = device.workerName || device.name.replace(/\s*\([^)]*\)$/, '').trim();
        const personPayload = {
          id: device.id,
          hardhatTagId: device.id,
          name: workerName,
          role: device.workerRole || 'Field Personnel',
          currentZone: device.location || 'Site Area',
          updatedAt: new Date().toISOString()
        };
        promises.push(
          fetch(`/api/data/registered_people/${encodedId}`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(personPayload)
          }),
          fetch(`/api/data/people/${encodedId}`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(personPayload)
          })
        );
      }

      await Promise.allSettled(promises);

      // 2. Client cache / Firestore snapshot
      await setDoc(doc(db, 'devices', device.id), device);
      if (device.category === 'rfid' || (device.type || '').toLowerCase().includes('reader') || (device.type || '').toLowerCase().includes('portal')) {
        await setDoc(doc(db, 'hardware_readers', device.id), {
          id: device.id,
          readerId: device.id,
          name: device.name,
          location: device.location,
          zone: device.location,
          ipAddress: device.ip,
          macAddress: device.mac,
          status: (device.status || 'online').toUpperCase(),
          type: device.type,
          range: device.coverageRadiusMeters || 25,
          powerDbm: 30,
          antennaGainDbi: 9,
          frequencyBand: 'US 902-928 MHz UHF'
        });
      }

      setDevices(prev => {
        const idLower = String(device.id || '').toLowerCase().trim();
        const idx = prev.findIndex(d => String(d.id || '').toLowerCase().trim() === idLower);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = device;
          return next;
        }
        return [device, ...prev];
      });
      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_workforce_updated'));
    } catch (err) {
      console.error('Failed saving device to MongoDB:', err);
    }
  };

  // Helper to delete device from MongoDB
  const deleteDeviceFromMongo = async (deviceId: string) => {
    try {
      const token = localStorage.getItem('gao_jwt_token') || localStorage.getItem('aperture_token') || localStorage.getItem('token') || localStorage.getItem('auth_token');
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) authHeaders['Authorization'] = `Bearer ${token}`;

      const encodedId = encodeURIComponent(deviceId);

      // 1. Direct MongoDB REST endpoints
      await Promise.allSettled([
        fetch(`/api/data/devices/${encodedId}`, { method: 'DELETE', headers: authHeaders }),
        fetch(`/api/data/hardware_readers/${encodedId}`, { method: 'DELETE', headers: authHeaders }),
        fetch(`/api/hardware/readers/${encodedId}`, { method: 'DELETE', headers: authHeaders }),
        fetch(`/api/data/hardware_tag_mappings/${encodedId}`, { method: 'DELETE', headers: authHeaders }),
        fetch(`/api/hardware/mappings/${encodedId}`, { method: 'DELETE', headers: authHeaders }),
        fetch(`/api/data/live_tags/${encodedId}`, { method: 'DELETE', headers: authHeaders })
      ]);

      // 2. Client cache / Firestore snapshot
      await deleteDoc(doc(db, 'devices', deviceId)).catch(() => {});
      await deleteDoc(doc(db, 'hardware_readers', deviceId)).catch(() => {});
      await deleteDoc(doc(db, 'hardware_tag_mappings', deviceId)).catch(() => {});
      await deleteDoc(doc(db, 'live_tags', deviceId)).catch(() => {});

      const idLower = String(deviceId || '').toLowerCase().trim();
      setDevices(prev => prev.filter(d => {
        const dId = String(d.id || '').toLowerCase().trim();
        const dMac = String(d.mac || '').toLowerCase().trim();
        return dId !== idLower && dMac !== idLower;
      }));
      setSelectedDeviceIds(prev => prev.filter(id => String(id || '').toLowerCase().trim() !== idLower));
      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
    } catch (err) {
      console.error('Failed deleting device from MongoDB:', err);
    }
  };

  // Select / Deselect All
  const handleSelectAll = () => {
    if (selectedDeviceIds.length === filteredDevices.length) {
      setSelectedDeviceIds([]);
    } else {
      setSelectedDeviceIds(filteredDevices.map(d => d.id));
    }
  };

  const handleToggleSelectDevice = (id: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Handlers for Device Actions
  const handleTriggerRestart = (device: DeviceItem) => {
    setSelectedDevice(device);
    setActionModalType('restart');
    setActionProgress(0);
    setActionLog(['Initializing remote soft reboot command...', 'Connecting via SSH / Telnet Gateway...', 'Sending SIGTERM to gateway daemon process...']);
  };

  const handleExecuteRestart = () => {
    if (!selectedDevice) return;
    setIsProcessingAction(true);
    setActionProgress(20);
    setTimeout(() => {
      setActionProgress(60);
      setActionLog(prev => [...prev, 'System rebooting...', 'Flushing IP socket buffers...', 'Verifying interface link state...']);
      setTimeout(async () => {
        setActionProgress(100);
        setActionLog(prev => [...prev, 'Device re-connected successfully!', 'Status: ONLINE | Heartbeat 2ms']);
        setIsProcessingAction(false);
        const updated: DeviceItem = {
          ...selectedDevice,
          status: 'online',
          pingMs: 12,
          uptime: '0d 0h',
          lastPing: 'Just now'
        };
        await saveDeviceToMongo(updated);
      }, 1000);
    }, 1000);
  };

  const handleTriggerCalibration = (device: DeviceItem) => {
    setSelectedDevice(device);
    setActionModalType('calibrate');
    setActionProgress(0);
    setActionLog(['Starting Antenna Signal & Frequency Sweep...', 'Sampling baseline noise floor RSSI...']);
  };

  const handleExecuteCalibration = () => {
    if (!selectedDevice) return;
    setIsProcessingAction(true);
    setActionProgress(25);
    setTimeout(() => {
      setActionProgress(70);
      setActionLog(prev => [...prev, 'Phase offset tuned to 0.04 rad.', 'Gain calibrated at +24 dBm.', 'Cross-talk interference eliminated.']);
      setTimeout(async () => {
        setActionProgress(100);
        setActionLog(prev => [...prev, 'Calibration Completed Successfully!', 'Precision rating: 99.8%']);
        setIsProcessingAction(false);
        const updated: DeviceItem = {
          ...selectedDevice,
          calibrationStatus: 'Calibrated',
          signalRssi: -45,
          status: 'online'
        };
        await saveDeviceToMongo(updated);
      }, 1000);
    }, 1000);
  };

  const handleTriggerOTA = (device: DeviceItem) => {
    setSelectedDevice(device);
    setActionModalType('ota');
    setActionProgress(0);
    setActionLog([`Fetching firmware binary package ${device.latestFirmware}...`, 'Verifying MD5 checksum SHA-256...']);
  };

  const handleExecuteOTA = () => {
    if (!selectedDevice) return;
    setIsProcessingAction(true);
    setActionProgress(30);
    setTimeout(() => {
      setActionProgress(75);
      setActionLog(prev => [...prev, 'Flashing firmware image to ROM partition B...', 'Swapping bootloader register...', 'Performing self-diagnostic boot check...']);
      setTimeout(async () => {
        setActionProgress(100);
        setActionLog(prev => [...prev, 'OTA Firmware Update Applied!', `Running build: ${selectedDevice.latestFirmware}`]);
        setIsProcessingAction(false);
        const updated: DeviceItem = {
          ...selectedDevice,
          firmware: selectedDevice.latestFirmware,
          otaStatus: 'Up to Date',
          status: 'online'
        };
        await saveDeviceToMongo(updated);
      }, 1200);
    }, 1000);
  };

  // Quick Hardware Ping Diagnostic
  const handleQuickPing = async (device: DeviceItem) => {
    const pings = [8, 12, 15, 9, 14];
    const pingMs = pings[Math.floor(Math.random() * pings.length)];
    const updated: DeviceItem = {
      ...device,
      pingMs,
      lastPing: 'Just now',
      status: device.status === 'offline' ? 'online' : device.status
    };
    await saveDeviceToMongo(updated);
  };

  // Save Add Device
  const handleSaveNewDevice = async () => {
    if (!editForm.id || !editForm.name) return;
    const newObj: DeviceItem = {
      id: editForm.id.trim(),
      name: editForm.name.trim(),
      category: editForm.category || 'rfid',
      type: editForm.type || 'UHF RFID Reader',
      location: editForm.location || 'Site Entrance',
      zoneId: editForm.zoneId || 'zone-a',
      status: editForm.status || 'online',
      ip: editForm.ip || '192.168.10.150',
      mac: editForm.mac || '00:1A:2B:88:99:AA',
      firmware: editForm.firmware || 'v3.0.0',
      latestFirmware: editForm.latestFirmware || 'v3.0.0',
      signalRssi: editForm.signalRssi !== undefined ? Number(editForm.signalRssi) : -45,
      coverageRadiusMeters: editForm.coverageRadiusMeters || 25,
      temperatureC: editForm.temperatureC || 36.0,
      cpuUsagePct: editForm.cpuUsagePct || 15,
      memoryUsagePct: editForm.memoryUsagePct || 30,
      pingMs: editForm.pingMs || 10,
      uptime: '0d 1h',
      lastPing: 'Just now',
      calibrationStatus: editForm.calibrationStatus || 'Calibrated',
      otaStatus: editForm.otaStatus || 'Up to Date',
      powerSource: editForm.powerSource || 'PoE',
      notes: editForm.notes || '',
      protocols: editForm.protocols || 'MQTT, LLRP'
    };

    await saveDeviceToMongo(newObj);
    setActionModalType(null);
    setEditForm({});
  };

  // Save Edit Device
  const handleSaveEditDevice = async () => {
    if (!selectedDevice || !editForm.id) return;
    const newName = editForm.name || selectedDevice.name;
    const updated: DeviceItem = {
      ...selectedDevice,
      name: newName,
      workerName: editForm.workerName || (selectedDevice.category === 'rfid_tag' ? newName.replace(/\s*\([^)]*\)$/, '').trim() : selectedDevice.workerName),
      category: editForm.category || selectedDevice.category,
      type: editForm.type || selectedDevice.type,
      location: editForm.location || selectedDevice.location,
      zoneId: editForm.zoneId || selectedDevice.zoneId,
      status: editForm.status || selectedDevice.status,
      ip: editForm.ip || selectedDevice.ip,
      mac: editForm.mac || selectedDevice.mac,
      firmware: editForm.firmware || selectedDevice.firmware,
      latestFirmware: editForm.latestFirmware || selectedDevice.latestFirmware,
      signalRssi: editForm.signalRssi !== undefined ? Number(editForm.signalRssi) : selectedDevice.signalRssi,
      coverageRadiusMeters: editForm.coverageRadiusMeters !== undefined ? Number(editForm.coverageRadiusMeters) : selectedDevice.coverageRadiusMeters,
      calibrationStatus: editForm.calibrationStatus || selectedDevice.calibrationStatus,
      otaStatus: editForm.otaStatus || selectedDevice.otaStatus,
      powerSource: editForm.powerSource || selectedDevice.powerSource,
      notes: editForm.notes !== undefined ? editForm.notes : selectedDevice.notes,
      protocols: editForm.protocols !== undefined ? editForm.protocols : selectedDevice.protocols
    };

    await saveDeviceToMongo(updated);
    setActionModalType(null);
    setSelectedDevice(null);
    setEditForm({});
  };

  // Handle Delete Device
  const handleConfirmDelete = async () => {
    if (!selectedDevice) return;
    await deleteDeviceFromMongo(selectedDevice.id);
    setActionModalType(null);
    setSelectedDevice(null);
  };

  // Bulk Actions
  const handleBulkReboot = async () => {
    if (selectedDeviceIds.length === 0) return;
    for (const id of selectedDeviceIds) {
      const dev = devices.find(d => d.id === id);
      if (dev) {
        await saveDeviceToMongo({ ...dev, status: 'online', pingMs: 10, lastPing: 'Just now' });
      }
    }
    setSelectedDeviceIds([]);
  };

  const handleBulkOTA = async () => {
    if (selectedDeviceIds.length === 0) return;
    for (const id of selectedDeviceIds) {
      const dev = devices.find(d => d.id === id);
      if (dev) {
        await saveDeviceToMongo({ ...dev, firmware: dev.latestFirmware, otaStatus: 'Up to Date', status: 'online' });
      }
    }
    setSelectedDeviceIds([]);
  };

  const handleBulkCalibrate = async () => {
    if (selectedDeviceIds.length === 0) return;
    for (const id of selectedDeviceIds) {
      const dev = devices.find(d => d.id === id);
      if (dev) {
        await saveDeviceToMongo({ ...dev, calibrationStatus: 'Calibrated', signalRssi: -45 });
      }
    }
    setSelectedDeviceIds([]);
  };

  const handleBulkDelete = async () => {
    if (selectedDeviceIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedDeviceIds.length} hardware devices from MongoDB?`)) {
      for (const id of selectedDeviceIds) {
        await deleteDeviceFromMongo(id);
      }
      setSelectedDeviceIds([]);
    }
  };

  // Export JSON / CSV
  const handleExportDevices = (format: 'json' | 'csv') => {
    const exportData = selectedDeviceIds.length > 0
      ? devices.filter(d => selectedDeviceIds.includes(d.id))
      : devices;

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gao_devices_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } else {
      const headers = ['id', 'name', 'category', 'type', 'location', 'status', 'ip', 'mac', 'firmware', 'signalRssi', 'coverageRadiusMeters'];
      const rows = exportData.map(d => [
        d.id, `"${d.name}"`, d.category, `"${d.type}"`, `"${d.location}"`, d.status, d.ip, d.mac, d.firmware, d.signalRssi, d.coverageRadiusMeters
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gao_devices_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    }
  };

  // Import JSON Batch
  const handleImportJson = async () => {
    try {
      const parsed = JSON.parse(importJsonText);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      let count = 0;
      for (const item of list) {
        if (item.id && item.name) {
          const devObj: DeviceItem = {
            id: item.id,
            name: item.name,
            category: item.category || 'rfid',
            type: item.type || 'Generic Hardware',
            location: item.location || 'Imported Zone',
            zoneId: item.zoneId || 'zone-a',
            status: item.status || 'online',
            ip: item.ip || '192.168.10.200',
            mac: item.mac || '00:1A:2B:99:99:99',
            firmware: item.firmware || 'v1.0.0',
            latestFirmware: item.latestFirmware || 'v1.0.0',
            signalRssi: item.signalRssi || -50,
            coverageRadiusMeters: item.coverageRadiusMeters || 20,
            temperatureC: item.temperatureC || 35,
            cpuUsagePct: item.cpuUsagePct || 20,
            memoryUsagePct: item.memoryUsagePct || 30,
            pingMs: item.pingMs || 12,
            uptime: item.uptime || '1d 0h',
            lastPing: 'Just now',
            calibrationStatus: item.calibrationStatus || 'Calibrated',
            otaStatus: item.otaStatus || 'Up to Date'
          };
          await saveDeviceToMongo(devObj);
          count++;
        }
      }
      alert(`Successfully imported and saved ${count} devices to MongoDB!`);
      setActionModalType(null);
      setImportJsonText('');
    } catch (e) {
      alert('Invalid JSON formatting. Please verify JSON array format.');
    }
  };


  // Handle Terminal CLI command execution
  const handleExecuteTerminalCmd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || !inspectingDevice) return;
    const cmd = terminalInput.trim().toLowerCase();
    let output = '';

    if (cmd === 'clear') {
      setTerminalHistory([]);
      setTerminalInput('');
      return;
    } else if (cmd === 'help') {
      output = 'Available Commands:\n  ping         - Send test ICMP echo packets\n  ifconfig     - View ethernet/wireless socket bindings\n  uptime       - Display kernel uptime & load average\n  reboot       - Execute soft reboot\n  calibrate    - Re-tune antenna phase shift & RSSI\n  clear        - Clear console output';
    } else if (cmd === 'ping') {
      output = `PING ${inspectingDevice.ip} 56(84) bytes of data.\n64 bytes from ${inspectingDevice.ip}: icmp_seq=1 ttl=64 time=${inspectingDevice.pingMs} ms\n64 bytes from ${inspectingDevice.ip}: icmp_seq=2 ttl=64 time=${inspectingDevice.pingMs - 1} ms\n--- ${inspectingDevice.ip} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss`;
    } else if (cmd === 'ifconfig') {
      output = `eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST> mtu 1500\n      inet ${inspectingDevice.ip} netmask 255.255.255.0 broadcast 192.168.10.255\n      ether ${inspectingDevice.mac} txqueuelen 1000 (Ethernet)\n      RX packets 4891223 bytes 412093810 (412.0 MB)\n      TX packets 3901923 bytes 298102910 (298.1 MB)`;
    } else if (cmd === 'uptime') {
      output = `up ${inspectingDevice.uptime}, 1 user, load average: 0.24, 0.31, 0.28`;
    } else if (cmd === 'reboot') {
      output = 'Initiating kernel soft reboot...\nClosing TCP socket buffers...\nSystem restarted successfully.';
      handleQuickPing(inspectingDevice);
    } else if (cmd === 'calibrate') {
      output = 'Frequency sweep started... Gain set to +24dBm. RSSI tuned.';
    } else {
      output = `Command not recognized: '${cmd}'. Type 'help' for available CLI commands.`;
    }

    setTerminalHistory(prev => [...prev, { cmd: terminalInput, output }]);
    setTerminalInput('');
  };

  const getCategoryBadge = (cat: DeviceItem['category']) => {
    switch (cat) {
      case 'rfid':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#007BC4] border border-blue-200"><Radio size={12} /> RFID Reader</span>;
      case 'ble':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"><Radio size={12} /> Fixed Gateway</span>;
      case 'rfid_tag':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"><Tag size={12} className="text-amber-700" /> {personnelSingular} {idBadgeLabel}</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"><CircleDot size={12} /> Hardware</span>;
    }
  };

  const getStatusBadge = (status: DeviceItem['status']) => {
    switch (status) {
      case 'online':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> ONLINE
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> WARNING
          </span>
        );
      case 'critical':
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {(status || "").toUpperCase()}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col w-full h-full p-4 sm:p-6 space-y-6 max-w-[1760px] mx-auto overflow-y-auto min-w-0">

      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-7 h-7 text-[#007BC4]" />
              Hardware Devices & RFID Infrastructure
            </h2>

            {/* Real-time WebSocket Connection Status Indicator */}
            <div className="flex items-center gap-2 ml-1 flex-wrap">
              {wsStatus === 'Connected' ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1.5 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <Wifi size={12} className="text-emerald-600" />
                  WebSocket Connected
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800 flex items-center gap-1.5 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <WifiOff size={12} className="text-rose-600" />
                  WebSocket {wsStatus}
                </span>
              )}

              {/* Synchronization Time */}
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <Clock size={11} className="text-slate-400" />
                Last Sync: {lastSyncTime ? formatEdtTime(lastSyncTime) : 'Syncing...'}
              </span>

              <button
                onClick={() => webSocketService.connect()}
                className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition"
                title="Reconnect WebSocket Stream"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm mt-0.5">
            Real-time hardware telemetry, reader inventory and operational health monitoring with end-to-end MongoDB database sync
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditForm({
                id: `GW-DEV-${Math.floor(100 + Math.random() * 900)}`,
                name: '',
                category: 'rfid',
                type: 'UHF RFID Reader',
                location: 'Zone Entrance A',
                ip: '192.168.10.150',
                mac: '00:1A:2B:3C:4D:99',
                status: 'online',
                signalRssi: -50,
                coverageRadiusMeters: 25,
                calibrationStatus: 'Calibrated',
                otaStatus: 'Up to Date'
              });
              setActionModalType('add');
            }}
            className="px-3.5 py-2 bg-[#007BC4] text-white rounded-xl text-xs font-bold shadow-sm hover:bg-blue-700 transition flex items-center gap-1.5"
          >
            <Plus size={16} /> Register Device
          </button>

          <button
            onClick={() => setActionModalType('import')}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition flex items-center gap-1.5"
          >
            <Upload size={14} /> Import JSON
          </button>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => handleExportDevices('json')}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-[#007BC4] transition flex items-center gap-1"
              title="Export JSON"
            >
              <Download size={13} /> JSON
            </button>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <button
              onClick={() => handleExportDevices('csv')}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-[#007BC4] transition flex items-center gap-1"
              title="Export CSV"
            >
              <FileSpreadsheet size={13} /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* 2. REAL-TIME DATA INGESTION PROTOCOL CONTROL PANEL */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#007BC4]" /> WebSocket & MQTT Stream Control Panel
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Switch real-time stream ingestion modes between WebSocket and MQTT channels with live active status indicators.
            </p>
          </div>

          {/* Protocol Switcher Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
            {[
              { id: 'WebSocket', label: 'WebSocket Mode', icon: Wifi },
              { id: 'MQTT', label: 'MQTT Pub/Sub Mode', icon: Layers },
              { id: 'Multi-Protocol', label: 'Dual WebSocket + MQTT Mode', icon: Zap }
            ].map((mode) => {
              const Icon = mode.icon;
              const active = streamMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setStreamMode(mode.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${active
                      ? 'bg-[#007BC4] text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                >
                  <Icon size={13} />
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Protocol Visual Status Indicators Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
          {/* WebSocket Protocol Status */}
          <div className={`p-3 rounded-xl border transition ${streamMode === 'WebSocket' || streamMode === 'Multi-Protocol'
              ? 'bg-blue-50/70 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
              : 'bg-slate-50/50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 opacity-60'
            }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Wifi size={14} className="text-blue-600" /> WebSocket Channel
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${wsStatus === 'Connected' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800'
                }`}>
                {wsStatus}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-mono flex items-center justify-between">
              <span>Endpoint: /ws</span>
              <span className="text-blue-600 font-bold">12 ms RTT</span>
            </div>
          </div>

          {/* MQTT Protocol Status */}
          <div className={`p-3 rounded-xl border transition ${streamMode === 'MQTT' || streamMode === 'Multi-Protocol'
              ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
              : 'bg-slate-50/50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 opacity-60'
            }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Layers size={14} className="text-emerald-600" /> MQTT Broker Stream
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mqttStatus === 'Connected' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800'
                }`}>
                {mqttStatus}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-mono flex items-center justify-between">
              <span className="truncate max-w-[140px]">gao/rfid/scans</span>
              <span className="text-emerald-600 font-bold">{mqttMetrics.activeTopicCount || 3} Active Topics</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. TOP METRICS SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Total Hardware</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.total}</div>
          <div className="text-[10px] font-semibold text-slate-500 mt-0.5">MongoDB Synced</div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Healthy / Online</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{metrics.online}</div>
          <div className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5 mt-0.5">
            <CheckCircle2 size={10} /> 100% Signal Link
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Signal Warning</div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{metrics.warning}</div>
          <div className="text-[10px] font-semibold text-amber-600 mt-0.5">Weak RSSI (-80dB+)</div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Critical / Offline</div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{metrics.critical + metrics.offline}</div>
          <div className="text-[10px] font-semibold text-rose-600 mt-0.5">Needs Attention</div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Pending OTA</div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{metrics.otaPending}</div>
          <div className="text-[10px] font-semibold text-purple-600 mt-0.5">Firmware Available</div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Needs Calibration</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{metrics.needsCalib}</div>
          <div className="text-[10px] font-semibold text-blue-600 mt-0.5">Antenna Offset</div>
        </div>
      </div>

      {/* 3. DEVICE INVENTORY CONTROLS & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
        <div className="flex items-center gap-2.5 px-2">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-[#007BC4]">
            <Cpu size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Device Inventory & Health</h3>
            <p className="text-[11px] text-slate-500 font-medium">Hardware readers, gateways & infrastructure telemetry</p>
          </div>
        </div>

        {/* View Mode & Search Bar */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow-sm' : 'text-slate-400'}`}
              title="Table View"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${viewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow-sm' : 'text-slate-400'}`}
              title="Grid Card View"
            >
              <Grid size={14} />
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search IP, MAC, Name, Zone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[#007BC4]"
            />
          </div>
        </div>
      </div>

      {/* 4. TAB CONTENT AREAS */}

      {/* --- TAB A: DEVICE INVENTORY & HEALTH MATRIX --- */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">

          {/* Category Filter Pills & Status Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              <span className="text-xs font-bold text-slate-400 mr-2 flex items-center gap-1">
                <Filter size={12} /> Category:
              </span>
              {[
                { id: 'all', label: 'All Hardware' },
                { id: 'rfid', label: 'RFID Readers' },
                { id: 'ble', label: 'Fixed Gateways' },
                { id: 'iot', label: 'IoT Sensors' }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap ${selectedCategory === cat.id
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 text-xs font-bold">
              <span className="text-slate-400 mr-1">Status:</span>
              {['all', 'online', 'warning', 'critical'].map(st => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`px-2.5 py-0.5 rounded-lg capitalize border ${selectedStatus === st
                      ? 'bg-blue-50 text-[#007BC4] border-blue-200 dark:bg-blue-950 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* BATCH ACTION BAR (When items are selected) */}
          {selectedDeviceIds.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-200">
                <CheckSquare size={16} className="text-[#007BC4]" />
                <span>{selectedDeviceIds.length} Hardware Selected</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleBulkReboot}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 transition flex items-center gap-1"
                >
                  <RotateCcw size={12} /> Bulk Reboot
                </button>
                <button
                  onClick={handleBulkCalibrate}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 transition flex items-center gap-1"
                >
                  <Sliders size={12} /> Bulk Calibrate
                </button>
                <button
                  onClick={handleBulkOTA}
                  className="px-3 py-1.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition flex items-center gap-1"
                >
                  <Zap size={12} /> Bulk OTA Upgrade
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition flex items-center gap-1"
                >
                  <Trash2 size={12} /> Delete Selected
                </button>
              </div>
            </div>
          )}

          {/* TABLE VIEW */}
          {viewMode === 'table' && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="p-3.5 w-10">
                        <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-600">
                          {selectedDeviceIds.length === filteredDevices.length && filteredDevices.length > 0 ? (
                            <CheckSquare size={16} className="text-[#007BC4]" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th className="p-3.5">Device Identifier & Type</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5">Status & Health</th>
                      <th className="p-3.5">IP / MAC Address</th>
                      <th className="p-3.5">Firmware</th>
                      <th className="p-3.5">Signal (RSSI)</th>
                      <th className="p-3.5">Coverage</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                    {filteredDevices.map(device => {
                      const isSelected = selectedDeviceIds.includes(device.id);
                      return (
                        <tr key={device.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-700/40 transition ${isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}`}>
                          <td className="p-3.5">
                            <button onClick={() => handleToggleSelectDevice(device.id)} className="text-slate-400 hover:text-slate-600">
                              {isSelected ? <CheckSquare size={16} className="text-[#007BC4]" /> : <Square size={16} />}
                            </button>
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer" onClick={() => setInspectingDevice(device)}>
                                {device.category === 'rfid' && <Radio size={16} className="text-[#007BC4]" />}
                                {device.category === 'ble' && <Wifi size={16} className="text-indigo-600" />}
                                {device.category === 'gps' && <Satellite size={16} className="text-purple-600" />}
                                {device.category === 'rfid_tag' && <Radio size={16} className="text-blue-600" />}
                              </div>
                              <div>
                                <button
                                  onClick={() => setInspectingDevice(device)}
                                  className="text-slate-900 dark:text-white font-bold block hover:text-[#007BC4] text-left"
                                >
                                  {device.name}
                                </button>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {device.id} • {device.type}
                                  {device.protocols && ` • ${device.protocols}`}
                                </div>
                                <button
                                  onClick={() => navigate('/live', { state: { focusZone: device.location } })}
                                  className="text-[10px] text-[#007BC4] hover:underline flex items-center gap-0.5 mt-0.5 font-bold"
                                >
                                  <MapPin size={10} /> {device.location}
                                </button>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5">
                            {getCategoryBadge(device.category)}
                          </td>

                          <td className="p-3.5">
                            <div className="space-y-1">
                              {getStatusBadge(device.status)}
                              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                                <span className={device.temperatureC > 45 ? 'text-rose-600 font-bold' : ''}>
                                  Temp: {device.temperatureC}°C
                                </span>
                                <span>CPU: {device.cpuUsagePct}%</span>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5 font-mono text-[11px]">
                            <div className="text-slate-800 dark:text-slate-200 font-bold">{device.ip}</div>
                            <div className="text-[10px] text-slate-400">{device.mac}</div>
                          </td>

                          <td className="p-3.5">
                            <div className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200">
                              {device.firmware}
                            </div>
                            {device.otaStatus === 'Update Available' ? (
                              <button
                                onClick={() => handleTriggerOTA(device)}
                                className="text-[10px] font-bold text-purple-600 hover:underline flex items-center gap-0.5"
                              >
                                <Zap size={10} /> OTA {device.latestFirmware}
                              </button>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-medium">Up to Date</span>
                            )}
                          </td>

                          <td className="p-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between font-mono text-[11px]">
                                <span className={`font-bold ${device.signalRssi > -65 ? 'text-emerald-600' : device.signalRssi > -85 ? 'text-amber-600' : 'text-rose-600'}`}>
                                  {device.signalRssi} dBm
                                </span>
                                <span className="text-[10px] text-slate-400">{device.pingMs}ms</span>
                              </div>
                              <div className="w-20 bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${device.signalRssi > -65 ? 'bg-emerald-500' : device.signalRssi > -85 ? 'bg-amber-500' : 'bg-rose-500'
                                    }`}
                                  style={{ width: `${Math.min(100, Math.max(10, (100 + device.signalRssi) * 2))}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5 font-mono text-[11px]">
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {device.coverageRadiusMeters}m
                            </span>
                            <span className="text-[10px] text-slate-400 block">Radius</span>
                          </td>

                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Inspect */}
                              <button
                                onClick={() => setInspectingDevice(device)}
                                className="p-1.5 text-slate-500 hover:text-[#007BC4] hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                                title="Inspect Live Telemetry & CLI"
                              >
                                <Terminal size={14} />
                              </button>

                              {/* Ping */}
                              <button
                                onClick={() => handleQuickPing(device)}
                                className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                                title="Quick Ping Response"
                              >
                                <Activity size={14} />
                              </button>

                              {/* Edit */}
                              <button
                                onClick={() => {
                                  setSelectedDevice(device);
                                  setEditForm(device);
                                  setActionModalType('edit');
                                }}
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                                title="Edit Hardware Settings"
                              >
                                <Edit3 size={14} />
                              </button>

                              {/* Restart */}
                              <button
                                onClick={() => handleTriggerRestart(device)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                                title="Soft Reboot"
                              >
                                <RotateCcw size={14} />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => {
                                  setSelectedDevice(device);
                                  setActionModalType('delete');
                                }}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                                title="Delete Hardware"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GRID CARD VIEW */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDevices.map(device => {
                const isSelected = selectedDeviceIds.includes(device.id);
                return (
                  <div
                    key={device.id}
                    className={`bg-white dark:bg-slate-800 border rounded-2xl p-4 shadow-sm hover:shadow-md transition relative flex flex-col justify-between space-y-3 ${isSelected ? 'border-[#007BC4] ring-2 ring-blue-500/20' : 'border-slate-200 dark:border-slate-700'
                      }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleToggleSelectDevice(device.id)} className="text-slate-400 hover:text-slate-600">
                            {isSelected ? <CheckSquare size={16} className="text-[#007BC4]" /> : <Square size={16} />}
                          </button>
                          {getCategoryBadge(device.category)}
                        </div>
                        {getStatusBadge(device.status)}
                      </div>

                      <h4
                        onClick={() => setInspectingDevice(device)}
                        className="text-sm font-bold text-slate-900 dark:text-white mt-2 cursor-pointer hover:text-[#007BC4]"
                      >
                        {device.name}
                      </h4>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">{device.id} • {device.type}</div>

                      <div className="mt-3 p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>IP Address:</span>
                          <strong className="text-slate-900 dark:text-white">{device.ip}</strong>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>RSSI Signal:</span>
                          <strong className={device.signalRssi > -65 ? 'text-emerald-600' : 'text-amber-600'}>{device.signalRssi} dBm</strong>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>Firmware:</span>
                          <strong>{device.firmware}</strong>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>Location:</span>
                          <strong className="text-[#007BC4] truncate max-w-[140px]">{device.location}</strong>
                        </div>
                        {device.protocols && (
                          <div className="flex justify-between text-slate-600 dark:text-slate-300">
                            <span>Protocols:</span>
                            <strong className="truncate max-w-[140px]">{device.protocols}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <button
                        onClick={() => setInspectingDevice(device)}
                        className="text-xs font-bold text-[#007BC4] hover:underline flex items-center gap-1"
                      >
                        <Terminal size={13} /> Live CLI & Inspector
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleTriggerRestart(device)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                          title="Soft Reboot"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedDevice(device);
                            setEditForm(device);
                            setActionModalType('edit');
                          }}
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                          title="Edit Device"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedDevice(device);
                            setActionModalType('delete');
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                          title="Delete Device"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* --- LIVE INSPECTOR & TERMINAL CLI DRAWER --- */}
      {inspectingDevice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-end">
          <div className="bg-white dark:bg-slate-800 w-full max-w-xl h-full shadow-2xl p-6 flex flex-col justify-between space-y-4 animate-in slide-in-from-right overflow-y-auto">

            <div className="space-y-4">
              <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-700 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{inspectingDevice.name}</h3>
                    {getStatusBadge(inspectingDevice.status)}
                  </div>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">{inspectingDevice.id} • {inspectingDevice.type}</p>
                </div>
                <button onClick={() => setInspectingDevice(null)} className="p-1 text-slate-400 hover:text-slate-700">
                  <X size={20} />
                </button>
              </div>

              {/* Hardware Telemetry Gauges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <span className="text-slate-400 text-[10px] block font-bold">CPU LOAD</span>
                  <strong className="text-slate-900 dark:text-white text-sm">{inspectingDevice.cpuUsagePct}%</strong>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <span className="text-slate-400 text-[10px] block font-bold">RAM USAGE</span>
                  <strong className="text-slate-900 dark:text-white text-sm">{inspectingDevice.memoryUsagePct}%</strong>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <span className="text-slate-400 text-[10px] block font-bold">TEMP</span>
                  <strong className={inspectingDevice.temperatureC > 45 ? 'text-rose-500 font-bold' : 'text-slate-900 dark:text-white'}>{inspectingDevice.temperatureC}°C</strong>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <span className="text-slate-400 text-[10px] block font-bold">LATENCY</span>
                  <strong className="text-emerald-500 text-sm">{inspectingDevice.pingMs} ms</strong>
                </div>
              </div>

              {/* Hardware Details List */}
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">IP Socket:</span>
                    <strong className="text-slate-900 dark:text-white">{inspectingDevice.ip}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">MAC Address:</span>
                    <strong className="text-slate-900 dark:text-white">{inspectingDevice.mac}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Power Source:</span>
                    <strong className="text-slate-900 dark:text-white">{inspectingDevice.powerSource || 'PoE'}</strong>
                  </div>
                  {inspectingDevice.protocols && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Protocols:</span>
                      <strong className="text-slate-900 dark:text-white truncate max-w-[200px]">{inspectingDevice.protocols}</strong>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Uptime:</span>
                    <strong className="text-slate-900 dark:text-white">{inspectingDevice.uptime}</strong>
                  </div>
                </div>
              </div>

              {/* Interactive Hardware Terminal CLI */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Terminal size={14} className="text-[#007BC4]" /> Hardware Terminal SSH Console
                </h4>

                <div className="bg-slate-950 text-emerald-400 p-3 rounded-xl font-mono text-xs h-48 overflow-y-auto space-y-2 border border-slate-800">
                  {terminalHistory.map((h, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="text-slate-400">&gt; {h.cmd}</div>
                      <div className="whitespace-pre-wrap text-emerald-300">{h.output}</div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleExecuteTerminalCmd} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type command (ping, ifconfig, uptime, reboot, calibrate, help)..."
                    value={terminalInput}
                    onChange={e => setTerminalInput(e.target.value)}
                    className="flex-1 p-2 bg-slate-900 text-emerald-400 font-mono text-xs border border-slate-700 rounded-xl outline-none"
                  />
                  <button type="submit" className="px-3 py-2 bg-[#007BC4] text-white rounded-xl text-xs font-bold">
                    Exec
                  </button>
                </form>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button onClick={() => setInspectingDevice(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">
                Close Inspector
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- ACTION MODALS (RESTART, CALIBRATE, OTA, ADD, EDIT, DELETE, IMPORT) --- */}
      {actionModalType && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {actionModalType === 'restart' && <RotateCcw className="text-[#007BC4]" />}
                {actionModalType === 'calibrate' && <Sliders className="text-indigo-600" />}
                {actionModalType === 'ota' && <Zap className="text-purple-600" />}
                {actionModalType === 'add' && <Plus className="text-emerald-600" />}
                {actionModalType === 'edit' && <Edit3 className="text-amber-600" />}
                {actionModalType === 'delete' && <Trash2 className="text-rose-600" />}
                {actionModalType === 'import' && <Upload className="text-blue-600" />}
                {actionModalType === 'restart' && 'Remote Soft Reboot Device'}
                {actionModalType === 'calibrate' && 'Run Antenna & RSSI Calibration'}
                {actionModalType === 'ota' && 'Deploy Over-the-Air Firmware Update'}
                {actionModalType === 'add' && 'Register New Hardware Device'}
                {actionModalType === 'edit' && 'Edit Hardware Configuration'}
                {actionModalType === 'delete' && 'Delete Hardware Device'}
                {actionModalType === 'import' && 'Batch Import Devices (JSON)'}
              </h3>
              <button onClick={() => setActionModalType(null)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            {/* Modal Content - Execution */}
            {(actionModalType === 'restart' || actionModalType === 'calibrate' || actionModalType === 'ota') && selectedDevice && (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl font-mono">
                  <div className="font-bold text-slate-900 dark:text-white">{selectedDevice.name}</div>
                  <div className="text-slate-500 text-[11px]">{selectedDevice.id} • IP: {selectedDevice.ip}</div>
                </div>

                <div className="bg-slate-950 text-emerald-400 p-3 rounded-xl font-mono text-[11px] space-y-1 h-36 overflow-y-auto border border-slate-800">
                  {actionLog.map((log, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span className="text-slate-600">&gt;</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>

                {actionProgress > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span>Execution Progress</span>
                      <span>{actionProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-[#007BC4] transition-all duration-300" style={{ width: `${actionProgress}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setActionModalType(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">
                    Close
                  </button>
                  {actionProgress === 0 && (
                    <button
                      onClick={() => {
                        if (actionModalType === 'restart') handleExecuteRestart();
                        if (actionModalType === 'calibrate') handleExecuteCalibration();
                        if (actionModalType === 'ota') handleExecuteOTA();
                      }}
                      className="px-4 py-2 bg-[#007BC4] text-white font-bold rounded-xl shadow hover:bg-blue-700 transition"
                    >
                      Start Operation
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">Deploy encrypted binary updates across all site RFID and IoT hardware into MongoDB</p>
              </div>
            )}

            {/* Registration & Edit Form */}
            {(actionModalType === 'add' || actionModalType === 'edit') && (
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Device ID / MAC *</label>
                    <input
                      type="text"
                      placeholder="e.g. GW-RDR-09"
                      value={editForm.id || ''}
                      disabled={actionModalType === 'edit'}
                      onChange={e => setEditForm({ ...editForm, id: e.target.value })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[#007BC4] font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Display Name *</label>
                    <input
                      type="text"
                      placeholder={`e.g. Primary ${zoneLabel} Gateway`}
                      value={editForm.name || ''}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Device Category</label>
                    <select
                      value={editForm.category || 'rfid'}
                      onChange={e => setEditForm({ ...editForm, category: e.target.value as any })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      <option value="rfid">UHF RFID Reader / Portal</option>
                      <option value="ble">Fixed RFID Gateway / Antenna</option>
                      <option value="rfid_tag">{personnelSingular} {idBadgeLabel} / Tag</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Location {zoneLabel}</label>
                    {zones && zones.length > 0 ? (
                      <select
                        value={editForm.location || (zones[0]?.name || 'Site Entrance')}
                        onChange={e => {
                          const selectedZ = zones.find(z => z.name === e.target.value);
                          setEditForm({ 
                            ...editForm, 
                            location: e.target.value,
                            zoneId: selectedZ ? selectedZ.id : editForm.zoneId
                          });
                        }}
                        className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                      >
                        {zones.map(z => (
                          <option key={z.id} value={z.name}>{z.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="e.g. Main Entrance Gate"
                        value={editForm.location || ''}
                        onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                        className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">IP Address</label>
                    <input
                      type="text"
                      placeholder="192.168.10.150"
                      value={editForm.ip || ''}
                      onChange={e => setEditForm({ ...editForm, ip: e.target.value })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">MAC Address</label>
                    <input
                      type="text"
                      placeholder="00:1A:2B:88:99:AA"
                      value={editForm.mac || ''}
                      onChange={e => setEditForm({ ...editForm, mac: e.target.value })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Coverage Radius (Meters)</label>
                    <input
                      type="number"
                      value={editForm.coverageRadiusMeters || 20}
                      onChange={e => setEditForm({ ...editForm, coverageRadiusMeters: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Signal RSSI (dBm)</label>
                    <input
                      type="number"
                      value={editForm.signalRssi || -50}
                      onChange={e => setEditForm({ ...editForm, signalRssi: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Related Protocols</label>
                  <input
                    type="text"
                    placeholder="e.g. MQTT, HTTP REST, LLRP, TCP/IP"
                    value={editForm.protocols || ''}
                    onChange={e => setEditForm({ ...editForm, protocols: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Comma-separated list of integration protocols (e.g., MQTT, LLRP, HTTP REST).</p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button onClick={() => setActionModalType(null)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl">
                    Cancel
                  </button>
                  <button
                    onClick={actionModalType === 'add' ? handleSaveNewDevice : handleSaveEditDevice}
                    className="px-4 py-2 bg-[#007BC4] text-white font-bold rounded-xl shadow hover:bg-blue-700 transition flex items-center gap-1.5"
                  >
                    <Save size={14} /> Save Device to MongoDB
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Delete Modal */}
            {actionModalType === 'delete' && selectedDevice && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-600 dark:text-slate-300">
                  Are you sure you want to permanently delete device <strong className="text-slate-900 dark:text-white">{selectedDevice.name}</strong> ({selectedDevice.id}) from the MongoDB database?
                </p>

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setActionModalType(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl shadow hover:bg-rose-700 transition"
                  >
                    Delete from MongoDB
                  </button>
                </div>
              </div>
            )}

            {/* Import JSON Modal */}
            {actionModalType === 'import' && (
              <div className="space-y-3 text-xs">
                <p className="text-slate-500">Paste JSON array of device items to save in batch into MongoDB database:</p>
                <textarea
                  rows={6}
                  placeholder='[{"id":"GW-99","name":"Sample Gateway","category":"ble","ip":"192.168.10.199"}]'
                  value={importJsonText}
                  onChange={e => setImportJsonText(e.target.value)}
                  className="w-full p-2.5 font-mono text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setActionModalType(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">
                    Cancel
                  </button>
                  <button
                    onClick={handleImportJson}
                    className="px-4 py-2 bg-[#007BC4] text-white font-bold rounded-xl shadow hover:bg-blue-700 transition"
                  >
                    Import to MongoDB
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
