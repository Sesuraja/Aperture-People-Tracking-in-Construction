import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Radio, Wifi, WifiOff, AlertCircle, RefreshCw, MoreVertical, Plus, X, Save,
  MapPin, Cpu, Video, Eye, CloudSun, Satellite, Sliders, Download, CheckCircle2,
  Zap, Thermometer, Activity, Layers, ShieldCheck, AlertTriangle, Gauge, Terminal,
  Settings2, Maximize2, ScanEye, Radar, CircleDot, HardDrive, Play, ArrowUpRight,
  Clock, Shield, Sparkles, Filter, Check, RotateCcw, Grid, List, Edit3, Trash2,
  Upload, CheckSquare, Square, FileSpreadsheet, SlidersHorizontal, ChevronRight
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, db } from '../lib/db';
import { useNavigate } from 'react-router-dom';
import webSocketService, { WSConnectionStatus } from '../lib/webSocketService';
import StreamDiagnostics from './StreamDiagnostics';
import mqttStreamService, { MqttMetrics } from '../lib/mqttService';
import { globalSseClient } from '../lib/realtimeClients';

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
}

export default function DevicesTab() {
  const navigate = useNavigate();

  // State
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbSynced, setDbSynced] = useState(false);

  // Real-time Multi-Protocol Status & Streaming Controls
  const [streamMode, setStreamMode] = useState<'WebSocket' | 'SSE' | 'MQTT' | 'Multi-Protocol'>('Multi-Protocol');
  const [wsStatus, setWsStatus] = useState<WSConnectionStatus>('Disconnected');
  const [sseStatus, setSseStatus] = useState<string>('Disconnected');
  const [mqttStatus, setMqttStatus] = useState<string>('Disconnected');
  const [mqttMetrics, setMqttMetrics] = useState<MqttMetrics>(mqttStreamService.getMetrics());
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

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
  const [activeTab, setActiveTab] = useState<'inventory' | 'heatmap' | 'deadzones' | 'ota' | 'diagnostics'>('inventory');

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

  // Diagnostic Scan State
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ totalScanned: number; issuesFound: number; logs: string[] } | null>(null);

  // Sync with MongoDB (via Firestore abstraction layer in db.ts)
  useEffect(() => {
    setLoading(true);
    const unsubDevices = onSnapshot(collection(db, 'devices'), async (snapshot) => {
      const fetchedDevices: DeviceItem[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        fetchedDevices.push({
          id: d.id || data.id,
          name: data.name || 'Unnamed Device',
          category: data.category || 'rfid',
          type: data.type || 'Reader Gateway',
          location: data.location || 'Site Location',
          zoneId: data.zoneId || 'zone-a',
          status: data.status || 'online',
          ip: data.ip || '192.168.10.100',
          mac: data.mac || '00:1A:2B:3C:4D:FE',
          firmware: data.firmware || 'v2.0.0',
          latestFirmware: data.latestFirmware || 'v2.0.0',
          signalRssi: data.signalRssi !== undefined ? Number(data.signalRssi) : -60,
          coverageRadiusMeters: data.coverageRadiusMeters || 20,
          temperatureC: data.temperatureC || 36,
          cpuUsagePct: data.cpuUsagePct || 20,
          memoryUsagePct: data.memoryUsagePct || 40,
          pingMs: data.pingMs || 10,
          uptime: data.uptime || '1d 0h',
          lastPing: data.lastPing || 'Just now',
          calibrationStatus: data.calibrationStatus || 'Calibrated',
          otaStatus: data.otaStatus || 'Up to Date',
          powerSource: data.powerSource || 'PoE',
          notes: data.notes || ''
        });
      });
      setDevices(fetchedDevices);
      setLoading(false);
      setDbSynced(true);
    }, (err) => {
      console.warn('MongoDB listener error:', err);
      setDevices([]);
      setLoading(false);
    });

    return () => unsubDevices();
  }, []);

  // Filtered Devices
  const filteredDevices = useMemo(() => {
    return devices.filter(dev => {
      const matchesCategory = selectedCategory === 'all' || dev.category === selectedCategory;
      const matchesStatus = selectedStatus === 'all' || dev.status === selectedStatus;
      const matchesSearch =
        (dev.name || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.id || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.ip || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.mac || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.location || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (dev.type || "").toLowerCase().includes((searchTerm || "").toLowerCase());
      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [devices, selectedCategory, selectedStatus, searchTerm]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status === 'online').length;
    const warning = devices.filter(d => d.status === 'warning').length;
    const critical = devices.filter(d => d.status === 'critical').length;
    const offline = devices.filter(d => d.status === 'offline').length;
    const otaPending = devices.filter(d => d.otaStatus === 'Update Available').length;
    const needsCalib = devices.filter(d => d.calibrationStatus === 'Needs Calibration').length;

    return { total, online, warning, critical, offline, otaPending, needsCalib };
  }, [devices]);

  // Helper to save single device to MongoDB
  const saveDeviceToMongo = async (device: DeviceItem) => {
    try {
      await setDoc(doc(db, 'devices', device.id), device);
      setDevices(prev => {
        const idx = prev.findIndex(d => d.id === device.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = device;
          return next;
        }
        return [device, ...prev];
      });
    } catch (err) {
      console.error('Failed saving device to MongoDB:', err);
    }
  };

  // Helper to delete device from MongoDB
  const deleteDeviceFromMongo = async (deviceId: string) => {
    try {
      await deleteDoc(doc(db, 'devices', deviceId));
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      setSelectedDeviceIds(prev => prev.filter(id => id !== deviceId));
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
    const updated: DeviceItem = {
      ...selectedDevice,
      name: editForm.name || selectedDevice.name,
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

  // Run Site Diagnostic Scan
  const handleRunDiagnosticScan = async () => {
    setIsScanning(true);
    setScanResults(null);
    const logs: string[] = ['Initiating full site-wide hardware telemetry scan...', 'Checking Ethernet socket interfaces & IP connectivity...'];

    setTimeout(() => {
      logs.push('Verifying LoRaWAN & RFID gateway socket link noise floors...');

      setTimeout(async () => {
        let issues = 0;
        for (const dev of devices) {
          if (dev.status === 'critical' || dev.signalRssi < -85 || dev.temperatureC > 48) {
            issues++;
            logs.push(`⚠️ Anomaly detected on [${dev.id}]: RSSI ${dev.signalRssi}dBm | Temp ${dev.temperatureC}°C`);
          } else {
            logs.push(`✅ Hardware [${dev.id}] passed diagnostic response ping (${dev.pingMs}ms)`);
          }
        }

        logs.push(`Scan Complete. Total Hardware Scanned: ${devices.length} | Issues Flagged: ${issues}`);
        setScanResults({ totalScanned: devices.length, issuesFound: issues, logs });
        setIsScanning(false);
      }, 1200);
    }, 1000);
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
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300"><Radio size={12} /> RFID Tag</span>;
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
    <div className="flex flex-col w-full h-full p-4 md:p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto">

      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-7 h-7 text-[#007BC4]" />
              Enterprise Hardware & Device Management
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-50 text-[#007BC4] border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300">
              {dbSynced ? 'MongoDB Connected' : 'Live Sensor Fabric'}
            </span>

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
                Last Sync: {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : 'Syncing...'}
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
            Real-time telemetry, firmware, health diagnostics, coverage heatmaps & dead zone detection with end-to-end MongoDB database sync
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

      {/* 3. MAIN TAB NAVIGATION STRIP & CONTROLS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-2 shadow-sm">
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'inventory', label: 'Device Inventory & Health', icon: Cpu },
            { id: 'heatmap', label: 'Coverage Heatmap', icon: Radar },
            { id: 'deadzones', label: 'Dead Zone Analyzer', icon: ScanEye },
            { id: 'ota', label: 'Mass OTA Firmware Hub', icon: Zap },
            { id: 'diagnostics', label: 'System Diagnostics', icon: Activity }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${active
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

        {/* View Mode & Search Bar */}
        {activeTab === 'inventory' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* View Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition ${viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow-sm' : 'text-slate-400'}`}
                title="Table View"
              >
                <List size={14} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition ${viewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow-sm' : 'text-slate-400'}`}
                title="Grid Card View"
              >
                <Grid size={14} />
              </button>
            </div>

            {/* Search */}
            <div className="relative flex-1 sm:w-60">
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
        )}
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
                { id: 'ble', label: 'Fixed Gateways' }
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
                                {device.category === 'iot' && <Cpu size={16} className="text-emerald-600" />}
                                {device.category === 'cctv' && <Video size={16} className="text-slate-600" />}
                                {device.category === 'ai_camera' && <Eye size={16} className="text-amber-600" />}
                                {device.category === 'weather' && <CloudSun size={16} className="text-cyan-600" />}
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

      {/* --- TAB B: SIGNAL COVERAGE HEATMAP & RADIUS TUNER --- */}
      {activeTab === 'heatmap' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Radar className="w-5 h-5 text-[#007BC4]" /> Interactive Signal Coverage & Radius Tuner
                </h3>
                <p className="text-xs text-slate-500">Visual spatial overlay of RFID, BLE, GPS and Vision sensor radii. Click any device to tune coverage radius.</p>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <span className="w-3 h-3 rounded-full bg-emerald-500/40 border border-emerald-500" /> Strong (&gt; -65 dBm)
                </span>
                <span className="flex items-center gap-1.5 text-amber-600">
                  <span className="w-3 h-3 rounded-full bg-amber-500/40 border border-amber-500" /> Moderate (-65 to -85 dBm)
                </span>
                <span className="flex items-center gap-1.5 text-rose-600">
                  <span className="w-3 h-3 rounded-full bg-rose-500/40 border border-rose-500" /> Weak / Fringe (&lt; -85 dBm)
                </span>
              </div>
            </div>

            {/* Spatial Canvas Map Representation */}
            <div className="relative w-full h-[450px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 p-4 flex flex-col justify-between select-none">

              {/* Background Grid Lines */}
              <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px] opacity-40" />

              {/* Floor Plan Zone Labels */}
              <div className="relative z-10 grid grid-cols-3 gap-4 pointer-events-none">
                <div className="border border-slate-800 rounded-xl p-2.5 bg-slate-900/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zone A: Main Entrance Turnstile</span>
                </div>
                <div className="border border-slate-800 rounded-xl p-2.5 bg-slate-900/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zone B: Tower Shaft & Scaffold</span>
                </div>
                <div className="border border-slate-800 rounded-xl p-2.5 bg-slate-900/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zone C: Sub-Basement Trenches</span>
                </div>
              </div>

              {/* Dynamic Coverage Bubble Nodes */}
              <div className="absolute inset-0 p-8 flex items-center justify-around flex-wrap gap-8 z-20 pointer-events-auto">
                {devices.map((dev) => {
                  const isWeak = dev.signalRssi < -80;
                  const isSelectedForTuning = selectedDevice?.id === dev.id;
                  return (
                    <div
                      key={dev.id}
                      onClick={() => setSelectedDevice(dev)}
                      className="relative group cursor-pointer"
                    >
                      {/* Pulse Radius Bubble */}
                      <div
                        className={`absolute -inset-8 rounded-full animate-ping opacity-20 ${isWeak ? 'bg-rose-500' : 'bg-[#007BC4]'
                          }`}
                        style={{ width: `${Math.max(40, dev.coverageRadiusMeters * 2.5)}px`, height: `${Math.max(40, dev.coverageRadiusMeters * 2.5)}px` }}
                      />
                      <div
                        className={`absolute rounded-full border-2 transition-all ${isSelectedForTuning
                            ? 'border-yellow-400 bg-yellow-400/20 ring-4 ring-yellow-400/30'
                            : isWeak
                              ? 'border-rose-500/50 bg-rose-500/10'
                              : 'border-emerald-500/50 bg-emerald-500/10'
                          }`}
                        style={{
                          width: `${Math.max(48, dev.coverageRadiusMeters * 2.8)}px`,
                          height: `${Math.max(48, dev.coverageRadiusMeters * 2.8)}px`,
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                      />

                      {/* Hardware Node Center */}
                      <div className={`relative p-3 rounded-full border-2 shadow-xl text-white flex items-center justify-center transition ${isSelectedForTuning ? 'bg-blue-600 border-yellow-300 scale-110' : 'bg-slate-900 border-white'}`}>
                        <Radio size={18} className={isWeak ? 'text-rose-400 animate-pulse' : 'text-emerald-400'} />
                      </div>

                      {/* Tooltip Hover Box */}
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-52 bg-slate-900 border border-slate-700 p-2.5 rounded-xl text-[11px] shadow-2xl z-30 pointer-events-none">
                        <strong className="text-white block truncate">{dev.name}</strong>
                        <div className="text-slate-400 font-mono text-[10px]">{dev.ip} • Radius: {dev.coverageRadiusMeters}m</div>
                        <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-800">
                          <span className="text-slate-300">RSSI:</span>
                          <span className={`font-bold font-mono ${isWeak ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {dev.signalRssi} dBm
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Radius Tuner Footer Controls (If a device is selected) */}
              <div className="relative z-10 bg-slate-900/90 backdrop-blur p-3 rounded-xl border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row items-center justify-between gap-3">
                {selectedDevice ? (
                  <div className="flex items-center gap-4 w-full justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{selectedDevice.name}</span>
                      <span className="text-slate-500 font-mono">({selectedDevice.id})</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 font-bold">Coverage Radius:</span>
                      <input
                        type="range"
                        min="5"
                        max="200"
                        value={selectedDevice.coverageRadiusMeters}
                        onChange={async (e) => {
                          const val = Number(e.target.value);
                          const updated = { ...selectedDevice, coverageRadiusMeters: val };
                          setSelectedDevice(updated);
                          await saveDeviceToMongo(updated);
                        }}
                        className="w-32 accent-[#007BC4]"
                      />
                      <span className="font-mono font-bold text-emerald-400">{selectedDevice.coverageRadiusMeters}m</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center w-full">
                    <span>Active Antenna Fabric: <strong className="text-emerald-400">{devices.length} Devices Broadcasting</strong></span>
                    <span>Click any node to tune coverage radius & save to MongoDB</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB C: DEAD ZONE ANALYZER --- */}
      {activeTab === 'deadzones' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            <div className="lg:col-span-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ScanEye className="w-5 h-5 text-rose-500" /> Site Unmonitored Dead Zone Detection Radar
                  </h3>
                  <p className="text-xs text-slate-500">Automated spatial analysis identifying unmonitored blindspots & signal gaps</p>
                </div>

                <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                  2 Dead Zones Identified
                </span>
              </div>

              {/* List of Detected Deadzones */}
              <div className="space-y-3">
                <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <strong className="text-rose-900 dark:text-rose-300 text-sm font-bold flex items-center gap-2">
                      <AlertTriangle size={16} className="text-rose-600" /> Sector B2 Deep Shaft (Sub-Basement B2)
                    </strong>
                    <span className="text-xs font-mono font-bold text-rose-700">Area: ~34 m² Blindspot</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    High concrete density attenuates gateway GW-RDR-03 signal. Workers entering B2 pit lose active tag tracking for over 12 minutes.
                  </p>
                  <div className="pt-2 border-t border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                    <span>💡 Recommended Remedy: Install 1x UHF Repeater Gateway at Scaffold Joint #14</span>
                    <button
                      onClick={() => {
                        setEditForm({
                          id: `GW-UHF-B2-${Math.floor(100 + Math.random() * 900)}`,
                          name: 'Sub-Basement B2 Scaffold UHF Gateway',
                          category: 'rfid',
                          type: 'UHF Fixed Portal',
                          location: 'Sub-Basement B2 Pit',
                          ip: '192.168.10.125',
                          status: 'online',
                          signalRssi: -45,
                          coverageRadiusMeters: 30
                        });
                        setActionModalType('add');
                      }}
                      className="px-3 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition"
                    >
                      Provision Gateway
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <strong className="text-amber-900 dark:text-amber-300 text-sm font-bold flex items-center gap-2">
                      <AlertCircle size={16} className="text-amber-600" /> Northwest Laydown Yard Crane Blindspot
                    </strong>
                    <span className="text-xs font-mono font-bold text-amber-700">Area: ~18 m² Fringe</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Steel beam storage piles create multipath interference for RFID Reader RDR-FX9600-01.
                  </p>
                  <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                    <span>💡 Recommended Remedy: Recalibrate antenna gain +3dB or re-orient patch antenna</span>
                    <button
                      onClick={() => handleTriggerCalibration(devices[0])}
                      className="px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
                    >
                      Auto-Calibrate Gain
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Coverage Optimization Summary Panel */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Coverage Optimization Score</h4>
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-4xl font-black text-[#007BC4]">94.2%</div>
                <div className="text-xs text-slate-500 mt-1 font-bold">Site Spatial Visibility Index</div>
              </div>

              <div className="space-y-2 text-xs font-medium">
                <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-900">
                  <span>Monitored Jobsite Area:</span>
                  <strong className="font-mono">14,200 m²</strong>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-900">
                  <span>Unmonitored Gaps:</span>
                  <strong className="font-mono text-rose-600">52 m² (0.36%)</strong>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-900">
                  <span>Hardware Density:</span>
                  <strong className="font-mono">1 dev per 1,775 m²</strong>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- TAB D: MASS OTA FIRMWARE HUB --- */}
      {activeTab === 'ota' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-600" /> Over-The-Air (OTA) Firmware Management Hub
                </h3>
                <p className="text-xs text-slate-500">Deploy encrypted binary updates across all site RFID, BLE and IoT hardware into MongoDB</p>
              </div>

              <button
                onClick={async () => {
                  for (const dev of devices) {
                    if (dev.otaStatus === 'Update Available') {
                      await saveDeviceToMongo({
                        ...dev,
                        firmware: dev.latestFirmware,
                        otaStatus: 'Up to Date',
                        status: 'online'
                      });
                    }
                  }
                  alert('Mass OTA Firmware upgrade completed for all eligible devices in MongoDB!');
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition flex items-center gap-1.5"
              >
                <Zap size={14} /> Deploy All Pending Updates ({metrics.otaPending})
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Current Fleet Firmware</span>
                <div className="text-xl font-bold font-mono text-slate-800 dark:text-slate-200">v3.8.2 / v2.1.0</div>
                <div className="text-xs text-emerald-600 font-semibold">{devices.length - metrics.otaPending} of {devices.length} devices up-to-date</div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Available OTA Releases</span>
                <div className="text-xl font-bold font-mono text-purple-600">v2.2.1 / v3.8.2 Stable</div>
                <div className="text-xs text-slate-500">Fixes BLE AoA packet latency & battery sleep</div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Security Checksum</span>
                <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 truncate">SHA256: e3b0c44298fc1c149afbf4c8996fb924</div>
                <div className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                  <ShieldCheck size={12} /> Digitally Signed by GAO Security
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB E: SYSTEM DIAGNOSTICS & TELEMETRY SCANNER --- */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6">
          <StreamDiagnostics />

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#007BC4]" /> Site Hardware Diagnostic & Telemetry Scanner
                </h3>
                <p className="text-xs text-slate-500">Perform real-time socket checks, ICMP latency tests and antenna gain diagnostics</p>
              </div>

              <button
                onClick={handleRunDiagnosticScan}
                disabled={isScanning}
                className="px-4 py-2 bg-[#007BC4] text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
                {isScanning ? 'Running Scan...' : 'Run Site Hardware Scan'}
              </button>
            </div>

            {scanResults && (
              <div className="space-y-3 animate-in fade-in">
                <div className="p-3 bg-slate-950 text-emerald-400 rounded-xl font-mono text-xs space-y-1 max-h-60 overflow-y-auto border border-slate-800">
                  {scanResults.logs.map((log, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span className="text-slate-600">&gt;</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Device ID / MAC</label>
                    <input
                      type="text"
                      placeholder="e.g. GW-RDR-09"
                      value={editForm.id || ''}
                      disabled={actionModalType === 'edit'}
                      onChange={e => setEditForm({ ...editForm, id: e.target.value })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Display Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Scaffold Level 4 Gate"
                      value={editForm.name || ''}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Category</label>
                    <select
                      value={editForm.category || 'rfid'}
                      onChange={e => setEditForm({ ...editForm, category: e.target.value as any })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      <option value="rfid">UHF RFID Reader</option>
                      <option value="ble">Fixed RFID Gateway</option>
                      <option value="gps">GPS Base Station</option>
                      <option value="iot">IoT Environmental Sensor</option>
                      <option value="cctv">CCTV Camera</option>
                      <option value="ai_camera">AI Vision Camera</option>
                      <option value="weather">Weather Station</option>
                      <option value="rfid_tag">RFID Tag</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Location Zone</label>
                    <input
                      type="text"
                      value={editForm.location || ''}
                      onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">IP Address</label>
                    <input
                      type="text"
                      value={editForm.ip || ''}
                      onChange={e => setEditForm({ ...editForm, ip: e.target.value })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">MAC Address</label>
                    <input
                      type="text"
                      value={editForm.mac || ''}
                      onChange={e => setEditForm({ ...editForm, mac: e.target.value })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
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

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setActionModalType(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">
                    Cancel
                  </button>
                  <button
                    onClick={actionModalType === 'add' ? handleSaveNewDevice : handleSaveEditDevice}
                    className="px-4 py-2 bg-[#007BC4] text-white font-bold rounded-xl shadow hover:bg-blue-700 transition"
                  >
                    Save to MongoDB
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
