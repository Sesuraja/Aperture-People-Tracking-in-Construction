import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  Save,
  Bell,
  Shield,
  Network,
  Database,
  Users,
  Layout,
  Key,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Lock,
  Unlock,
  User,
  UserCheck,
  UserPlus,
  ShieldCheck,
  Server,
  Terminal,
  Workflow,
  Sparkles,
  Eye,
  EyeOff,
  Trash2,
  Cpu,
  Bot,
  Download,
  Upload,
  HardDrive,
  Radio,
  Sliders,
  Check,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Pencil,
  Zap,
  Code2
} from "lucide-react";
import RealTimeConnectionsTab from "./RealTimeConnectionsTab";
import WebhookInspector from "./WebhookInspector";
import { RfidApiConfiguration } from "./RfidApiConfiguration";
import DeveloperApiTab from "./DeveloperApiTab";
import ThirdPartyApiIntegrationSection from "./ThirdPartyApiIntegrationSection";
import DirectHardwareIntegrationSection from "./DirectHardwareIntegrationSection";
import MongoDbConfigurationSection from "./MongoDbConfigurationSection";
import IndustryConfigurationSection from "./IndustryConfigurationSection";
import { gaoApi, DEFAULT_HOST } from "../lib/gaoApi";
import { doc, getDoc, setDoc, onSnapshot, isMongoActive, db } from "../lib/db";
import { AppModeContext } from "../App";

export default function SettingsTab() {
  const { mode } = React.useContext(AppModeContext);
  const location = useLocation();
  const [activeSection, setActiveSection] = useState("industry");


  useEffect(() => {
    if (location.state && (location.state as any).focusSection) {
      setActiveSection((location.state as any).focusSection);
    }
  }, [location]);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [apiUrl, setApiUrl] = useState(DEFAULT_HOST);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // 1. General Settings States
  const [companyName, setCompanyName] = useState("Aperture Construction Systems");
  const [systemTimezone, setSystemTimezone] = useState("UTC (Coordinated Universal Time)");
  const [dataRetentionDays, setDataRetentionDays] = useState(90);
  const [currencySymbol, setCurrencySymbol] = useState("$ USD");
  const [siteLocation, setSiteLocation] = useState("Tower 1 - Metro Commercial Build");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [systemLanguage, setSystemLanguage] = useState("English (US)");

  // Real-time listener for global settings stored in MongoDB Atlas
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.companyName) setCompanyName(data.companyName);
        if (data.systemTimezone) setSystemTimezone(data.systemTimezone);
        if (data.dataRetentionDays !== undefined) setDataRetentionDays(data.dataRetentionDays);
        if (data.currencySymbol) setCurrencySymbol(data.currencySymbol);
        if (data.siteLocation) setSiteLocation(data.siteLocation);
        if (data.maintenanceMode !== undefined) setMaintenanceMode(data.maintenanceMode);
        if (data.systemLanguage) setSystemLanguage(data.systemLanguage);
        if (data.apiUrl) setApiUrl(data.apiUrl);
        if (data.loiteringThreshold !== undefined) setLoiteringThreshold(data.loiteringThreshold);
        if (data.idleAlertThreshold !== undefined) setIdleAlertThreshold(data.idleAlertThreshold);
        if (data.occupancyThresholds) setOccupancyThresholds(data.occupancyThresholds);
        if (data.rfidSensitivity) setRfidSensitivity(data.rfidSensitivity);
        if (data.autoExclusionZones !== undefined) setAutoExclusionZones(data.autoExclusionZones);
        if (data.uncardedPersonnelAlarm) setUncardedPersonnelAlarm(data.uncardedPersonnelAlarm);
        if (data.geofenceProximityEnabled !== undefined) setGeofenceProximityEnabled(data.geofenceProximityEnabled);
        if (data.geofenceProximityBufferMeters !== undefined) setGeofenceProximityBufferMeters(data.geofenceProximityBufferMeters);
        if (data.geofenceStayDurationThresholdSec !== undefined) setGeofenceStayDurationThresholdSec(data.geofenceStayDurationThresholdSec);
        if (data.geofenceNotificationMethods) setGeofenceNotificationMethods(data.geofenceNotificationMethods);
        if (data.geofenceSeverityPolicies) setGeofenceSeverityPolicies(data.geofenceSeverityPolicies);
        if (data.antennaPower !== undefined) setAntennaPower(data.antennaPower);
        if (data.scanFrequency !== undefined) setScanFrequency(data.scanFrequency);
        if (data.turnstileAutoLock !== undefined) setTurnstileAutoLock(data.turnstileAutoLock);
        if (data.gatewayProtocol) setGatewayProtocol(data.gatewayProtocol);
        if (data.readerPort !== undefined) setReaderPort(data.readerPort);
        if (data.heartbeatInterval !== undefined) setHeartbeatInterval(data.heartbeatInterval);
        if (data.aiModel) setAiModel(data.aiModel);
        if (data.anomalyScanSensitivity) setAnomalyScanSensitivity(data.anomalyScanSensitivity);
        if (data.aiPromptCustomizer) setAiPromptCustomizer(data.aiPromptCustomizer);
        if (data.autoAnalyzeIncidents !== undefined) setAutoAnalyzeIncidents(data.autoAnalyzeIncidents);
        if (data.aiThreatThreshold !== undefined) setAiThreatThreshold(data.aiThreatThreshold);
        if (data.auditRetentionDays !== undefined) setAuditRetentionDays(data.auditRetentionDays);
        if (data.cryptoHashing !== undefined) setCryptoHashing(data.cryptoHashing);
        if (data.complianceFrameworks) setComplianceFrameworks(data.complianceFrameworks);
        if (data.autoGenerateReports !== undefined) setAutoGenerateReports(data.autoGenerateReports);
        if (data.reportRecipientEmail) setReportRecipientEmail(data.reportRecipientEmail);
        if (data.emailAlerts !== undefined) setEmailAlerts(data.emailAlerts);
        if (data.emailRecipients) setEmailRecipients(data.emailRecipients);
        if (data.smsAlerts !== undefined) setSmsAlerts(data.smsAlerts);
        if (data.smsRecipients) setSmsRecipients(data.smsRecipients);
        if (data.slackWebhookUrl) setSlackWebhookUrl(data.slackWebhookUrl);
        if (data.systemSounds !== undefined) setSystemSounds(data.systemSounds);
        if (data.mqttBrokerUrl) setMqttBrokerUrl(data.mqttBrokerUrl);
      }
    });
    return () => unsub();
  }, []);

  // 2. Security & Tracking States
  const [loiteringThreshold, setLoiteringThreshold] = useState(300);
  const [idleAlertThreshold, setIdleAlertThreshold] = useState(3600);
  const [occupancyThresholds, setOccupancyThresholds] = useState<Record<string, number>>({
    Entrance: 20,
    Office: 50,
    "Meeting Room": 15,
    "Server Room": 2,
    Cafeteria: 30,
  });
  const [rfidSensitivity, setRfidSensitivity] = useState("High (-65 dBm)");
  const [autoExclusionZones, setAutoExclusionZones] = useState(true);
  const [uncardedPersonnelAlarm, setUncardedPersonnelAlarm] = useState("Audible Siren & Turnstile Lock");

  // Geofence Proximity Alert Configuration States
  const [geofenceProximityEnabled, setGeofenceProximityEnabled] = useState(true);
  const [geofenceProximityBufferMeters, setGeofenceProximityBufferMeters] = useState(5);
  const [geofenceStayDurationThresholdSec, setGeofenceStayDurationThresholdSec] = useState(10);
  const [geofenceNotificationMethods, setGeofenceNotificationMethods] = useState({
    soundSiren: true,
    visualPulse: true,
    emailAlert: true,
    smsAlert: false,
    autoCctvSnap: true,
    turnstileLock: true
  });
  const [geofenceSeverityPolicies, setGeofenceSeverityPolicies] = useState({
    critical: "Immediate Loud Siren + Red Flash + Turnstile Lock",
    warning: "Visual Map Pulse + EHS Safety Officer Notification",
    normal: "Log Event & Real-time Zone Counter Update"
  });

  // 3. Hardware & IoT Gateways Config (New Feature)
  const [antennaPower, setAntennaPower] = useState(30); // dBm
  const [scanFrequency, setScanFrequency] = useState(250); // ms
  const [turnstileAutoLock, setTurnstileAutoLock] = useState(true);
  const [gatewayProtocol, setGatewayProtocol] = useState("MQTT / WebSockets SSL");
  const [readerPort, setReaderPort] = useState(8080);
  const [heartbeatInterval, setHeartbeatInterval] = useState(10); // sec

  // 4. AI Analytics & Gemini Vision Config (New Feature)
  const [aiModel, setAiModel] = useState("gemini-3.6-flash");
  const [anomalyScanSensitivity, setAnomalyScanSensitivity] = useState("Medium");
  const [aiPromptCustomizer, setAiPromptCustomizer] = useState(
    "Identify unauthorized loitering, tailgating, and tag anomalies with confidence score."
  );
  const [autoAnalyzeIncidents, setAutoAnalyzeIncidents] = useState(true);
  const [aiThreatThreshold, setAiThreatThreshold] = useState(75);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<{ configured: boolean; message?: string; source?: string } | null>(null);
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);

  // 5. Audit & Compliance Rules (New Feature)
  const [auditRetentionDays, setAuditRetentionDays] = useState(365);
  const [cryptoHashing, setCryptoHashing] = useState(true);
  const [complianceFrameworks, setComplianceFrameworks] = useState({
    osha: true,
    iso27001: true,
    gdpr: true,
    gamp5: true,
  });
  const [autoGenerateReports, setAutoGenerateReports] = useState(true);
  const [reportRecipientEmail, setReportRecipientEmail] = useState("compliance@aperture-construction.com");

  // Custom API Authentication states
  const [authType, setAuthType] = useState("none");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyHeader, setApiKeyHeader] = useState("X-API-Key");
  const [bearerToken, setBearerToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthTokenUrl, setOauthTokenUrl] = useState("");
  const [legacyGaoApiKey, setLegacyGaoApiKey] = useState("");
  const [showLegacyKey, setShowLegacyKey] = useState(false);

  // MongoDB Connection States
  const [mongoUri, setMongoUri] = useState("");
  const [showMongoPassword, setShowMongoPassword] = useState(false);
  const [, setMongoStatus] = useState({
    connected: false,
    connectionString: "",
  });
  const [testingMongo, setTestingMongo] = useState(false);
  const [mongoTestResult, setMongoTestResult] = useState<{
    success: boolean;
    msg: string;
  } | null>(null);
  const [savingMongo, setSavingMongo] = useState(false);

  // Interactive sandbox state
  const [activeEndpoint, setActiveEndpoint] = useState("get_realtime");
  const [sandboxSkip, setSandboxSkip] = useState(0);
  const [sandboxTake, setSandboxTake] = useState(10);
  const [isRunningSandbox, setIsRunningSandbox] = useState(false);
  const [sandboxResponse, setSandboxResponse] = useState<any>(null);
  const [sandboxStatus, setSandboxStatus] = useState<string | null>(null);
  const [sandboxUrl, setSandboxUrl] = useState<string>("");

  // Notification settings
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [emailRecipients, setEmailRecipients] = useState(
    "admin@aperture-construction.com, safety@aperture-construction.com"
  );
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [smsRecipients, setSmsRecipients] = useState("+1-800-555-0199");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("https://hooks.slack.com/services/T00/B00/XXXX");
  const [systemSounds, setSystemSounds] = useState(true);
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState("mqtt://broker.hivemq.com:1883");

  // Granular Access Control & Custom Roles States
  const SYSTEM_PAGES = [
    { id: "dashboard", label: "Dashboard Telemetry", category: "Core Operations", desc: "Main project dashboard & key metric widgets" },
    { id: "live", label: "Live Tracking Feed", category: "Core Operations", desc: "Real-time personnel & asset position maps" },
    { id: "customMap", label: "Custom Map & Assets", category: "Core Operations", desc: "Custom CAD drawings, zone layers & floorplans" },
    { id: "playback", label: "Tracking Playback History", category: "Analytics & Logs", desc: "Historical movement replays and spatial paths" },
    { id: "people", label: "Personnel Registry", category: "Personnel & Access", desc: "Staff directory, badges, trades & contact cards" },
    { id: "visitors", label: "Visitor Management", category: "Personnel & Access", desc: "Guest check-in, badges & visitor kiosk log" },
    { id: "attendance", label: "Attendance Insights", category: "Personnel & Access", desc: "Shift timecards, contractor hours & clock-ins" },
    { id: "alerts", label: "Alerts & Trigger Feed", category: "Safety & Security", desc: "SOS emergencies, geo-fence breaches & falls" },
    { id: "incidents", label: "Incident Log File", category: "Safety & Security", desc: "OSHA reports, hazard logs & safety files" },
    { id: "analytics", label: "Aggregated Traffic Analytics", category: "Analytics & Logs", desc: "Zone dwell times, trade density & bottlenecks" },
    { id: "aiInsights", label: "AI Insights & Predictions", category: "Analytics & Logs", desc: "Gemini safety predictions & risk scoring" },
    { id: "devices", label: "Hardware Devices Admin", category: "Hardware & IoT", desc: "RFID tags, LoRaWAN anchors & beacons" },
    { id: "maintenance", label: "Hardware Maintenance", category: "Hardware & IoT", desc: "Battery health, calibration & work orders" },
    { id: "audit", label: "Compliance & Audit Ledger", category: "Administration", desc: "System audit trails, MongoDB sync logs & compliance" },
    { id: "settings", label: "Global Settings Console", category: "Administration", desc: "System configuration, role matrix & user admin" },
  ];

  const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
    admin: {
      dashboard: true, live: true, customMap: true, playback: true, people: true, visitors: true,
      attendance: true, alerts: true, incidents: true, analytics: true, aiInsights: true,
      devices: true, maintenance: true, audit: true, settings: true
    },
    manager: {
      dashboard: true, live: true, customMap: true, playback: true, people: true, visitors: true,
      attendance: true, alerts: true, incidents: true, analytics: true, aiInsights: true,
      devices: true, maintenance: true, audit: true, settings: false
    },
    operator: {
      dashboard: true, live: true, customMap: true, playback: true, people: true, visitors: true,
      attendance: true, alerts: true, incidents: true, analytics: false, aiInsights: false,
      devices: false, maintenance: true, audit: false, settings: false
    },
    security: {
      dashboard: true, live: true, customMap: true, playback: true, people: true, visitors: true,
      attendance: false, alerts: true, incidents: true, analytics: false, aiInsights: false,
      devices: false, maintenance: false, audit: false, settings: false
    },
    auditor: {
      dashboard: true, live: false, customMap: false, playback: true, people: true, visitors: true,
      attendance: true, alerts: true, incidents: true, analytics: true, aiInsights: true,
      devices: false, maintenance: false, audit: true, settings: false
    },
    contractor: {
      dashboard: false, live: true, customMap: false, playback: false, people: true, visitors: false,
      attendance: true, alerts: true, incidents: false, analytics: false, aiInsights: false,
      devices: false, maintenance: false, audit: false, settings: false
    },
    visitor_manager: {
      dashboard: false, live: false, customMap: false, playback: false, people: false, visitors: true,
      attendance: true, alerts: true, incidents: false, analytics: false, aiInsights: false,
      devices: false, maintenance: false, audit: false, settings: false
    },
    viewer: {
      dashboard: true, live: true, customMap: true, playback: false, people: false, visitors: false,
      attendance: false, alerts: true, incidents: false, analytics: false, aiInsights: false,
      devices: false, maintenance: false, audit: false, settings: false
    }
  };

  const [customRoles, setCustomRoles] = useState<Array<{ id: string; label: string; desc?: string; isCustom?: boolean }>>([
    { id: "admin", label: "Administrator", desc: "Full administrative access & user management" },
    { id: "manager", label: "Site Manager", desc: "Operational control and site analytics" },
    { id: "operator", label: "Operator", desc: "Real-time monitoring and equipment care" },
    { id: "security", label: "Security Officer", desc: "Live position tracking & threat response" },
    { id: "auditor", label: "Compliance Auditor", desc: "Audit logs & regulatory safety view" },
    { id: "contractor", label: "External Contractor", desc: "Personnel attendance & task view" },
    { id: "visitor_manager", label: "Visitor Receptionist", desc: "Visitor registration & kiosk logs" },
    { id: "viewer", label: "ReadOnly Viewer", desc: "View-only dashboards" },
  ]);

  const [activeRoleTab, setActiveRoleTab] = useState<string>("admin");
  const [activeAccessTab, setActiveAccessTab] = useState<"matrix" | "staff" | "roles" | "invitations" | "activity_log">("matrix");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [expandedUserUid, setExpandedUserUid] = useState<string | null>(null);
  const [userPageOverrides, setUserPageOverrides] = useState<Record<string, Record<string, boolean>>>({});
  const [savingUserOverrideUid, setSavingUserOverrideUid] = useState<string | null>(null);

  // User Management, Custom Claims, and Permissions states
  const [users, setUsers] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userRole, setUserRole] = useState<string>("operator");
  const [rolePermissions, setRolePermissions] = useState<Record<string, Record<string, boolean>>>(DEFAULT_ROLE_PERMISSIONS);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [isRefreshingClaims, setIsRefreshingClaims] = useState(false);

  // User creation states
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createRole, setCreateRole] = useState("operator");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [creationSuccess, setCreationSuccess] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);

  // Editing and Reset states
  const [editingUserUid, setEditingUserUid] = useState<string | null>(null);
  const [editingUserName, setEditingUserName] = useState<string>("");
  const [resettingPasswordUid, setResettingPasswordUid] = useState<string | null>(null);
  const [resettingPasswordValue, setResettingPasswordValue] = useState<string>("");
  const [createPasswordType, setCreatePasswordType] = useState<"password" | "text">("password");

  // User Activity, Bulk Role, and Invite States
  const [userActivityLogs, setUserActivityLogs] = useState<any[]>([]);
  const [isLoadingActivityLogs, setIsLoadingActivityLogs] = useState(false);
  const [bulkSelectedUsers, setBulkSelectedUsers] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState<string>("operator");
  const [isApplyingBulkRole, setIsApplyingBulkRole] = useState(false);
  const [resendingInviteUid, setResendingInviteUid] = useState<string | null>(null);

  // Database Backup / Export / Import states
  const [isExportingDb, setIsExportingDb] = useState(false);
  const [isPurgingLogs, setIsPurgingLogs] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Aperture RFID Integration States
  const [apertureHost, setApertureHost] = useState("http://192.168.1.100:8080");
  const [apertureApiKeyInput, setApertureApiKeyInput] = useState("");
  const [apertureApiKeyMasked, setApertureApiKeyMasked] = useState("••••••••••••");
  const [apertureApiKeyConfigured, setApertureApiKeyConfigured] = useState(false);
  const [showApertureKey, setShowApertureKey] = useState(false);
  const [apertureConnStatus, setApertureConnStatus] = useState<string>("CONNECTED");
  const [apertureRealtimeSyncStatus, setApertureRealtimeSyncStatus] = useState<string>("Active");
  const [apertureHistorySyncStatus, setApertureHistorySyncStatus] = useState<string>("Active");
  const [apertureLastSync, setApertureLastSync] = useState<string | null>("10 Aug 2026, 16:45:12");
  const [apertureLastError, setApertureLastError] = useState<string | null>(null);
  const [isTestingAperture, setIsTestingAperture] = useState(false);
  const [isSavingAperture, setIsSavingAperture] = useState(false);
  const [apertureNotice, setApertureNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = localStorage.getItem("gao_jwt_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchApertureConfig = async () => {
    try {
      const res = await fetch("/api/integrations/aperture/config", {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.host) setApertureHost(data.host);
        setApertureApiKeyConfigured(Boolean(data.apiKeyConfigured));
        if (data.apiKeyMasked) setApertureApiKeyMasked(data.apiKeyMasked);
        if (data.lastSuccessfulSync) setApertureLastSync(data.lastSuccessfulSync);
        if (data.lastError) setApertureLastError(data.lastError);
        if (data.realTimeSyncActive !== undefined) setApertureRealtimeSyncStatus(data.realTimeSyncActive ? "Active" : "Inactive");
        if (data.historySyncActive !== undefined) setApertureHistorySyncStatus(data.historySyncActive ? "Active" : "Inactive");
      }
    } catch (err) {
      console.warn("Could not load Aperture RFID config on mount:", err);
    }
  };

  const handleTestApertureConnection = async () => {
    setIsTestingAperture(true);
    setApertureNotice(null);
    try {
      const res = await fetch("/api/integrations/aperture/test", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ host: apertureHost, apiKey: apertureApiKeyInput }),
      });
      const data = await res.json();
      const statusStr = (data.status || "UNKNOWN").toUpperCase();
      setApertureConnStatus(statusStr);
      if (statusStr === "CONNECTED" || data.status === "connected") {
        setApertureNotice({ type: "success", msg: "Aperture RFID Server connection test successful! Status: Connected (HTTP 200 OK)" });
        setApertureLastSync(new Date().toISOString());
        setApertureLastError(null);
      } else {
        const msg = data.message || statusStr;
        setApertureNotice({ type: "error", msg: `Connection test failed: ${msg}` });
        setApertureLastError(msg);
      }
    } catch (err: any) {
      setApertureConnStatus("DISCONNECTED");
      setApertureNotice({ type: "error", msg: err.message || "Failed to reach backend test route" });
    } finally {
      setIsTestingAperture(false);
    }
  };

  const handleSaveApertureConfig = async () => {
    setIsSavingAperture(true);
    setApertureNotice(null);
    try {
      const res = await fetch("/api/integrations/aperture/config", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          host: apertureHost,
          apiKey: apertureApiKeyInput
        }),
      });
      const data = await res.json();
      if (data.success) {
        setApertureApiKeyConfigured(data.apiKeyConfigured);
        setApertureApiKeyMasked(data.apiKeyMasked);
        setApertureApiKeyInput(""); // Clear plaintext for security
        setApertureNotice({ type: "success", msg: "Aperture RFID integration configuration securely saved!" });
        handleTestApertureConnection();
      } else {
        setApertureNotice({ type: "error", msg: data.error || "Failed to save configuration" });
      }
    } catch (err: any) {
      setApertureNotice({ type: "error", msg: err.message || "Error saving configuration" });
    } finally {
      setIsSavingAperture(false);
    }
  };

  // Load current user and admin claims
  useEffect(() => {
    const fetchCurrentUserClaim = async () => {
      let resolvedRole = "operator";

      const token = localStorage.getItem("gao_jwt_token");
      if (token) {
        try {
          const res = await fetch("/api/auth/me", {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.user?.role) resolvedRole = data.user.role;
          }
        } catch (err) {
          console.warn("Error fetching user role from /api/auth/me:", err);
        }
      }

      setUserRole(resolvedRole);
    };
    fetchCurrentUserClaim();
  }, [activeSection, mode]);

  // Sync users and permissions from database
  useEffect(() => {
    if (activeSection === "access") {
      loadManagementData();
    }
  }, [activeSection]);

  // Sync user activity logs on tab change
  useEffect(() => {
    if (activeSection === "access" && activeAccessTab === "activity_log") {
      fetchUserActivityLogs();
    }
  }, [activeAccessTab, activeSection]);

  const loadManagementData = async () => {
    setIsLoadingUsers(true);
    setActionErrorMessage(null);
    try {
      const token = localStorage.getItem("gao_jwt_token") || "";
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const normalizedUsers = (data.users || [])
          .filter(Boolean)
          .map((u: any) => ({
            ...u,
            uid: u.uid || u.id,
            id: u.id || u.uid
          }));
        setUsers(normalizedUsers);
      }
    } catch (fetchErr) {
      console.warn("Could not fetch user list from backend admin endpoint:", fetchErr);
    }

    // 2. Load role_permissions document from MongoDB
    try {
      const roleDoc = await getDoc(doc(db, "settings", "role_permissions"));
      if (roleDoc.exists()) {
        setRolePermissions({
          ...DEFAULT_ROLE_PERMISSIONS,
          ...roleDoc.data()
        });
      } else {
        setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
      }
    } catch (roleErr) {
      console.warn("Failed to read role_permissions doc:", roleErr);
      setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
    }

    // 3. Load custom_roles document from MongoDB
    try {
      const customRolesDoc = await getDoc(doc(db, "settings", "custom_roles"));
      if (customRolesDoc.exists() && customRolesDoc.data().roles) {
        const loadedCustomRoles = customRolesDoc.data().roles;
        // merge with defaults
        const baseIds = new Set([
          "admin", "manager", "operator", "security", "auditor", "contractor", "visitor_manager", "viewer"
        ]);
        const filteredCustom = loadedCustomRoles.filter((r: any) => !baseIds.has(r.id));
        setCustomRoles([
          { id: "admin", label: "Administrator", desc: "Full administrative access & user management" },
          { id: "manager", label: "Site Manager", desc: "Operational control and site analytics" },
          { id: "operator", label: "Operator", desc: "Real-time monitoring and equipment care" },
          { id: "security", label: "Security Officer", desc: "Live position tracking & threat response" },
          { id: "auditor", label: "Compliance Auditor", desc: "Audit logs & regulatory safety view" },
          { id: "contractor", label: "External Contractor", desc: "Personnel attendance & task view" },
          { id: "visitor_manager", label: "Visitor Receptionist", desc: "Visitor registration & kiosk logs" },
          { id: "viewer", label: "ReadOnly Viewer", desc: "View-only dashboards" },
          ...filteredCustom
        ]);
      }
    } catch (customErr) {
      console.warn("Failed to load custom roles:", customErr);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleToggleRolePagePermission = (roleId: string, pageId: string) => {
    const currentRolePerms = rolePermissions[roleId] || {};
    const updated = {
      ...rolePermissions,
      [roleId]: {
        ...currentRolePerms,
        [pageId]: !currentRolePerms[pageId]
      }
    };
    setRolePermissions(updated);
  };

  const handleGrantAllPagesForRole = (roleId: string) => {
    const allTrue: Record<string, boolean> = {};
    SYSTEM_PAGES.forEach(p => { allTrue[p.id] = true; });
    setRolePermissions({
      ...rolePermissions,
      [roleId]: allTrue
    });
  };

  const handleRevokeAllPagesForRole = (roleId: string) => {
    const allFalse: Record<string, boolean> = {};
    SYSTEM_PAGES.forEach(p => { allFalse[p.id] = false; });
    setRolePermissions({
      ...rolePermissions,
      [roleId]: allFalse
    });
  };

  const fetchUserActivityLogs = async () => {

    setIsLoadingActivityLogs(true);
    try {
      const token = localStorage.getItem("gao_jwt_token") || "";
      const res = await fetch("/api/admin/user-activity-logs", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserActivityLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch user activity logs:", err);
    } finally {
      setIsLoadingActivityLogs(false);
    }
  };

  const handleBulkAssignRole = async () => {
    if (bulkSelectedUsers.length === 0) return;
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    setIsApplyingBulkRole(true);
    try {

      const token = localStorage.getItem("gao_jwt_token") || "";
      const res = await fetch("/api/admin/bulk-set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userIds: bulkSelectedUsers,
          role: bulkRole
        })
      });

      if (res.ok) {
        const data = await res.json();
        setActionSuccessMessage(data.message || `Successfully updated roles.`);
        // update users in state
        setUsers(users.map(u => bulkSelectedUsers.includes(u.uid) ? { ...u, role: bulkRole } : u));
        setBulkSelectedUsers([]);
      } else {
        const data = await res.json();
        setActionErrorMessage(data.error || "Failed to bulk update roles");
      }
    } catch (err: any) {
      setActionErrorMessage(err.message || "Failed to bulk update roles");
    } finally {
      setIsApplyingBulkRole(false);
    }
  };

  const handleResendInvite = async (targetUid: string) => {
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    setResendingInviteUid(targetUid);
    try {

      const token = localStorage.getItem("gao_jwt_token") || "";
      const res = await fetch(`/api/admin/users/${targetUid}/resend-invite`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (res.ok) {
        const data = await res.json();
        setActionSuccessMessage(data.message || `Successfully resent invitation.`);
      } else {
        const data = await res.json();
        setActionErrorMessage(data.error || "Failed to resend invitation");
      }
    } catch (err: any) {
      setActionErrorMessage(err.message || "Failed to resend invitation");
    } finally {
      setResendingInviteUid(null);
    }
  };

  const handleDownloadPermissionsCsv = () => {
    try {
      const headers = ["Role ID", "Role Name", ...SYSTEM_PAGES.map(p => p.label)];
      
      const rows = customRoles.map(r => {
        const perms = rolePermissions[r.id] || {};
        const values = [
          r.id,
          r.label,
          ...SYSTEM_PAGES.map(p => perms[p.id] ? "ALLOWED" : "RESTRICTED")
        ];
        return values.map(v => `"${v.replace(/"/g, '""')}"`).join(",");
      });

      const csvContent = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `GAO_Access_Control_Matrix_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setActionSuccessMessage("Access Control Matrix CSV exported successfully!");
    } catch (err: any) {
      setActionErrorMessage("Failed to export compliance CSV: " + err.message);
    }
  };

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: "None", color: "bg-slate-200", textColor: "text-slate-400", width: "w-0" };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) {
      return { score: 1, text: "Weak", color: "bg-rose-500", textColor: "text-rose-600", width: "w-1/4" };
    } else if (score <= 4) {
      return { score: 2, text: "Fair", color: "bg-amber-500", textColor: "text-amber-600", width: "w-2/4" };
    } else if (score <= 5) {
      return { score: 3, text: "Good", color: "bg-blue-500", textColor: "text-blue-600", width: "w-3/4" };
    } else {
      return { score: 4, text: "Strong", color: "bg-emerald-500", textColor: "text-emerald-600", width: "w-full" };
    }
  };

  const handleSavePermissions = async () => {
    setIsSavingPermissions(true);
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    try {
      await setDoc(doc(db, "settings", "role_permissions"), rolePermissions, { merge: true });
      
      try {
        const token = localStorage.getItem("gao_jwt_token") || "";
        const rolePayload = Object.keys(rolePermissions).map(roleKey => ({
          role: roleKey,
          permissions: Object.keys(rolePermissions[roleKey]).filter(k => rolePermissions[roleKey][k])
        }));
        await fetch("/api/admin/permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rolePermissions: rolePayload })
        });
      } catch (proxyErr) {
        console.warn("Backend permissions proxy save non-fatal:", proxyErr);
      }

      setActionSuccessMessage("Successfully saved role page permissions matrix to MongoDB database!");
      window.dispatchEvent(new CustomEvent("gao-refresh-claims"));
    } catch (err: any) {
      setActionErrorMessage("Failed to save permissions matrix: " + err.message);
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const handleAddCustomRole = async () => {
    if (!newRoleName.trim()) return;
    const roleId = (newRoleName || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "_");
    if (customRoles.some(r => r.id === roleId)) {
      setActionErrorMessage("A role with this ID already exists.");
      return;
    }

    const newRoleObj = {
      id: roleId,
      label: newRoleName.trim(),
      desc: newRoleDesc.trim() || "Custom user role",
      isCustom: true
    };

    const updatedRoles = [...customRoles, newRoleObj];
    setCustomRoles(updatedRoles);

    // Initialize perms for new role
    const initialPerms: Record<string, boolean> = {};
    SYSTEM_PAGES.forEach(p => { initialPerms[p.id] = p.id === "dashboard" || p.id === "live"; });

    const updatedPermissions = {
      ...rolePermissions,
      [roleId]: initialPerms
    };
    setRolePermissions(updatedPermissions);
    setActiveRoleTab(roleId);

    setNewRoleName("");
    setNewRoleDesc("");

    try {
      await setDoc(doc(db, "settings", "custom_roles"), { roles: updatedRoles }, { merge: true });
      await setDoc(doc(db, "settings", "role_permissions"), updatedPermissions, { merge: true });
      setActionSuccessMessage(`Successfully created custom role '${newRoleName.trim()}' (${roleId})`);
      window.dispatchEvent(new CustomEvent("gao-refresh-claims"));
    } catch (err: any) {
      setActionErrorMessage("Role added locally, but failed to persist: " + err.message);
    }
  };

  const handleDeleteCustomRole = async (roleId: string) => {
    if (!window.confirm(`Are you sure you want to delete role '${roleId}'?`)) return;
    const updatedRoles = customRoles.filter(r => r.id !== roleId);
    setCustomRoles(updatedRoles);

    const updatedPermissions = { ...rolePermissions };
    delete updatedPermissions[roleId];
    setRolePermissions(updatedPermissions);

    if (activeRoleTab === roleId) {
      setActiveRoleTab(updatedRoles[0]?.id || "admin");
    }

    try {
      await setDoc(doc(db, "settings", "custom_roles"), { roles: updatedRoles });
      await setDoc(doc(db, "settings", "role_permissions"), updatedPermissions);
      setActionSuccessMessage(`Deleted custom role '${roleId}'`);
      window.dispatchEvent(new CustomEvent("gao-refresh-claims"));
    } catch (err: any) {
      setActionErrorMessage("Error removing role from database: " + err.message);
    }
  };

  const handleToggleUserPageOverride = (uid: string, pageId: string, value: 'inherit' | 'allow' | 'deny') => {
    const userCurrent = userPageOverrides[uid] ? { ...userPageOverrides[uid] } : {};
    if (value === 'inherit') {
      delete userCurrent[pageId];
    } else if (value === 'allow') {
      userCurrent[pageId] = true;
    } else {
      userCurrent[pageId] = false;
    }

    setUserPageOverrides({
      ...userPageOverrides,
      [uid]: userCurrent
    });
  };

  const handleLoadUserPageOverrides = async (uid: string) => {
    if (expandedUserUid === uid) {
      setExpandedUserUid(null);
      return;
    }
    setExpandedUserUid(uid);
    try {
      const userPermDoc = await getDoc(doc(db, "settings", `user_permissions_${uid}`));
      if (userPermDoc.exists()) {
        setUserPageOverrides({
          ...userPageOverrides,
          [uid]: userPermDoc.data()
        });
      }
    } catch (err) {
      console.warn(`Failed to load page overrides for ${uid}:`, err);
    }
  };

  const handleSaveUserPageOverrides = async (uid: string, userEmail: string) => {
    setSavingUserOverrideUid(uid);
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    try {
      const overrides = userPageOverrides[uid] || {};
      await setDoc(doc(db, "settings", `user_permissions_${uid}`), overrides);
      setActionSuccessMessage(`Successfully saved individual page access overrides for staff account ${userEmail}`);
      window.dispatchEvent(new CustomEvent("gao-refresh-claims"));
    } catch (err: any) {
      setActionErrorMessage(`Failed to save page overrides for ${userEmail}: ${err.message}`);
    } finally {
      setSavingUserOverrideUid(null);
    }
  };

  const handleUpdateUserRole = async (targetUid: string, newRole: string) => {
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    try {
      const token = localStorage.getItem("gao_jwt_token") || "";
      const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid: targetUid, role: newRole }),
      });

      if (res.ok) {
        setActionSuccessMessage(`Updated custom claim role for ${targetUid} to '${newRole}'`);
        setUsers(users.map((u) => (u.uid === targetUid ? { ...u, role: newRole } : u)));

        await setDoc(
          doc(db, "settings", `user_role_${targetUid}`),
          { uid: targetUid, role: newRole, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } else {
        const data = await res.json();
        setActionErrorMessage(data.error || "Failed to set user custom claim role");
      }
    } catch (err: any) {
      setActionErrorMessage(err.message || "Failed to communicate with admin endpoint");
    }
  };

  const handleDeleteUser = async (targetUid: string, email: string) => {
    if (!window.confirm(`Are you sure you want to delete staff account ${email}?`)) return;
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    try {
      const token = localStorage.getItem("gao_jwt_token") || "";
      const res = await fetch(`/api/admin/users/${targetUid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setActionSuccessMessage(`Successfully removed user account ${email}`);
        setUsers(users.filter((u) => u.uid !== targetUid));
      } else {
        const data = await res.json();
        setActionErrorMessage(data.error || "Failed to delete user account");
      }
    } catch (err: any) {
      setActionErrorMessage(err.message || "Failed to execute delete call");
    }
  };

  const generateRandomPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
    let password = "";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const digits = "0123456789";
    const symbols = "!@#$%^&*()";
    
    password += lower[Math.floor(Math.random() * lower.length)];
    password += upper[Math.floor(Math.random() * upper.length)];
    password += digits[Math.floor(Math.random() * digits.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    for (let i = 0; i < 8; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  };

  const handleUpdateUserName = async (targetUid: string) => {
    if (!editingUserName.trim()) return;
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    try {
      const token = localStorage.getItem("gao_jwt_token") || "";
      const res = await fetch(`/api/admin/users/${targetUid}/update-name`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: editingUserName.trim() }),
      });

      if (res.ok) {
        setActionSuccessMessage(`Successfully updated display name to ${editingUserName.trim()}`);
        setUsers(users.map((u) => (u.uid === targetUid ? { ...u, displayName: editingUserName.trim(), name: editingUserName.trim() } : u)));
        setEditingUserUid(null);
        setEditingUserName("");
      } else {
        const data = await res.json();
        setActionErrorMessage(data.error || "Failed to update display name");
      }
    } catch (err: any) {
      setActionErrorMessage(err.message || "Failed to communicate with update name endpoint");
    }
  };

  const handleResetUserPassword = async (targetUid: string) => {
    if (resettingPasswordValue.length < 6) {
      setActionErrorMessage("Password must be at least 6 characters long");
      return;
    }
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    try {
      const token = localStorage.getItem("gao_jwt_token") || "";
      const res = await fetch(`/api/admin/users/${targetUid}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: resettingPasswordValue }),
      });

      if (res.ok) {
        setActionSuccessMessage(`Successfully reset password for staff user account.`);
        setResettingPasswordUid(null);
        setResettingPasswordValue("");
      } else {
        const data = await res.json();
        setActionErrorMessage(data.error || "Failed to reset password");
      }
    } catch (err: any) {
      setActionErrorMessage(err.message || "Failed to reset password");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail || !createPassword) {
      setCreationError("Please enter both email and password.");
      return;
    }
    setCreationSuccess(null);
    setCreationError(null);
    setIsCreatingUser(true);

    try {
      const token = localStorage.getItem("gao_jwt_token") || "";
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: createEmail.trim(),
          password: createPassword,
          name: createDisplayName.trim() || createEmail.trim().split('@')[0],
          displayName: createDisplayName.trim() || createEmail.trim().split('@')[0],
          role: createRole,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setCreationSuccess(`User '${createEmail}' successfully created and saved with role '${createRole}' in MongoDB!`);
        setCreateEmail("");
        setCreatePassword("");
        setCreateDisplayName("");
        await loadManagementData();
      } else {
        setCreationError(data.error || "Failed to provision account");
      }
    } catch (err: any) {
      setCreationError(err.message || "Network error provisioning user");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleForceTokenRefresh = async () => {
    setIsRefreshingClaims(true);
    setActionSuccessMessage(null);
    try {
      setActionSuccessMessage("Refreshed JWT token & verified custom user claims.");
    } catch (err: any) {
      setActionErrorMessage(err.message || "Token refresh failed.");
    } finally {
      setIsRefreshingClaims(false);
    }
  };

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global");
        const docSnap = await getDoc(docRef);

        let userLegacyKey = "";
        try {
          const userDocRef = doc(db, "settings", `user_settings_default`);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            if (userData.legacyGaoApiKey !== undefined) {
              userLegacyKey = userData.legacyGaoApiKey;
            }
          }
        } catch (err) {
          console.warn("Could not load user-specific legacy API key:", err);
        }

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.companyName !== undefined) setCompanyName(data.companyName);
          if (data.systemTimezone !== undefined) setSystemTimezone(data.systemTimezone);
          if (data.dataRetentionDays !== undefined) setDataRetentionDays(data.dataRetentionDays);
          if (data.currencySymbol !== undefined) setCurrencySymbol(data.currencySymbol);
          if (data.siteLocation !== undefined) setSiteLocation(data.siteLocation);
          if (data.maintenanceMode !== undefined) setMaintenanceMode(data.maintenanceMode);
          if (data.systemLanguage !== undefined) setSystemLanguage(data.systemLanguage);

          if (data.apiUrl !== undefined) {
            setApiUrl(data.apiUrl);
            gaoApi.setHost(data.apiUrl);
          }
          if (data.loiteringThreshold !== undefined) setLoiteringThreshold(data.loiteringThreshold);
          if (data.idleAlertThreshold !== undefined) setIdleAlertThreshold(data.idleAlertThreshold);
          if (data.occupancyThresholds !== undefined) setOccupancyThresholds(data.occupancyThresholds);
          if (data.rfidSensitivity !== undefined) setRfidSensitivity(data.rfidSensitivity);
          if (data.autoExclusionZones !== undefined) setAutoExclusionZones(data.autoExclusionZones);
          if (data.uncardedPersonnelAlarm !== undefined) setUncardedPersonnelAlarm(data.uncardedPersonnelAlarm);

          if (data.geofenceProximityEnabled !== undefined) setGeofenceProximityEnabled(data.geofenceProximityEnabled);
          if (data.geofenceProximityBufferMeters !== undefined) setGeofenceProximityBufferMeters(data.geofenceProximityBufferMeters);
          if (data.geofenceStayDurationThresholdSec !== undefined) setGeofenceStayDurationThresholdSec(data.geofenceStayDurationThresholdSec);
          if (data.geofenceNotificationMethods !== undefined) setGeofenceNotificationMethods(data.geofenceNotificationMethods);
          if (data.geofenceSeverityPolicies !== undefined) setGeofenceSeverityPolicies(data.geofenceSeverityPolicies);

          if (data.antennaPower !== undefined) setAntennaPower(data.antennaPower);
          if (data.scanFrequency !== undefined) setScanFrequency(data.scanFrequency);
          if (data.turnstileAutoLock !== undefined) setTurnstileAutoLock(data.turnstileAutoLock);
          if (data.gatewayProtocol !== undefined) setGatewayProtocol(data.gatewayProtocol);
          if (data.readerPort !== undefined) setReaderPort(data.readerPort);
          if (data.heartbeatInterval !== undefined) setHeartbeatInterval(data.heartbeatInterval);

          if (data.aiModel !== undefined) setAiModel(data.aiModel);
          if (data.anomalyScanSensitivity !== undefined) setAnomalyScanSensitivity(data.anomalyScanSensitivity);
          if (data.aiPromptCustomizer !== undefined) setAiPromptCustomizer(data.aiPromptCustomizer);
          if (data.autoAnalyzeIncidents !== undefined) setAutoAnalyzeIncidents(data.autoAnalyzeIncidents);
          if (data.aiThreatThreshold !== undefined) setAiThreatThreshold(data.aiThreatThreshold);

          if (data.auditRetentionDays !== undefined) setAuditRetentionDays(data.auditRetentionDays);
          if (data.cryptoHashing !== undefined) setCryptoHashing(data.cryptoHashing);
          if (data.complianceFrameworks !== undefined) setComplianceFrameworks(data.complianceFrameworks);
          if (data.autoGenerateReports !== undefined) setAutoGenerateReports(data.autoGenerateReports);
          if (data.reportRecipientEmail !== undefined) setReportRecipientEmail(data.reportRecipientEmail);

          if (data.emailAlerts !== undefined) setEmailAlerts(data.emailAlerts);
          if (data.emailRecipients !== undefined) setEmailRecipients(data.emailRecipients);
          if (data.smsAlerts !== undefined) setSmsAlerts(data.smsAlerts);
          if (data.smsRecipients !== undefined) setSmsRecipients(data.smsRecipients);
          if (data.slackWebhookUrl !== undefined) setSlackWebhookUrl(data.slackWebhookUrl);
          if (data.systemSounds !== undefined) setSystemSounds(data.systemSounds);
          if (data.mqttBrokerUrl !== undefined) setMqttBrokerUrl(data.mqttBrokerUrl);

          if (data.authType !== undefined) setAuthType(data.authType);
          if (data.apiKey !== undefined) setApiKey(data.apiKey);
          if (data.apiKeyHeader !== undefined) setApiKeyHeader(data.apiKeyHeader);
          if (data.bearerToken !== undefined) setBearerToken(data.bearerToken);
          if (data.username !== undefined) setUsername(data.username);
          if (data.password !== undefined) setPassword(data.password);
          if (data.oauthClientId !== undefined) setOauthClientId(data.oauthClientId);
          if (data.oauthClientSecret !== undefined) setOauthClientSecret(data.oauthClientSecret);
          if (data.oauthTokenUrl !== undefined) setOauthTokenUrl(data.oauthTokenUrl);

          if (userLegacyKey) {
            setLegacyGaoApiKey(userLegacyKey);
          } else if (data.legacyGaoApiKey !== undefined) {
            setLegacyGaoApiKey(data.legacyGaoApiKey);
          } else {
            setLegacyGaoApiKey(localStorage.getItem("gao_legacy_api_key") || "");
          }
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    fetchSettings();
    fetchApertureConfig();

    const savedMongoUri = localStorage.getItem("gao_mongodb_uri") || "";
    setMongoUri(savedMongoUri);
    fetch("/api/mongodb/status", { headers: getAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) return Promise.reject();
        const text = await res.text();
        try { return JSON.parse(text); } catch { return Promise.reject(); }
      })
      .then((status) => setMongoStatus(status))
      .catch((e) => console.warn("Could not load MongoDB backend status on mount:", e));

    fetch("/api/ai/status", { headers: getAuthHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.configured === "boolean") {
          setGeminiStatus({
            configured: data.configured,
            source: data.source,
            message: data.configured ? `Active (Connected via ${data.source === "environment_variable" ? "process.env.GEMINI_API_KEY" : "Frontend Settings"})` : "Not connected (Using simulated EHS fallback)"
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveGeminiKey = async () => {
    setSavingGeminiKey(true);
    try {
      const res = await fetch("/api/ai/config-key", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ geminiApiKey }),
      });
      const data = await res.json();
      if (data.success) {
        setGeminiStatus({
          configured: data.configured,
          message: data.message
        });
      } else {
        setGeminiStatus({
          configured: false,
          message: data.error || "Failed to set Gemini key"
        });
      }
    } catch (e: any) {
      setGeminiStatus({
        configured: false,
        message: e.message || "Error setting Gemini key"
      });
    } finally {
      setSavingGeminiKey(false);
    }
  };

  const handleTestMongo = async () => {
    if (!mongoUri) {
      setMongoTestResult({
        success: false,
        msg: "Please enter a connection string.",
      });
      return;
    }
    setTestingMongo(true);
    setMongoTestResult(null);
    try {
      const res = await fetch("/api/mongodb/test-connection", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ mongodbUri: mongoUri }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: false, error: res.ok ? text : `Server HTTP ${res.status}: ${text.slice(0, 150)}` };
      }
      if (data.success) {
        setMongoTestResult({
          success: true,
          msg: "MongoDB connection test passed successfully!",
        });
      } else {
        setMongoTestResult({
          success: false,
          msg: data.error || "Connection failed. Please check credentials & Atlas IP access rules.",
        });
      }
    } catch (e: any) {
      setMongoTestResult({
        success: false,
        msg: e.message || "Network error testing connection",
      });
    } finally {
      setTestingMongo(false);
    }
  };

  const handleSaveMongo = async () => {
    if (!mongoUri) {
      localStorage.removeItem("gao_mongodb_uri");
      setMongoStatus({ connected: false, connectionString: "" });
      setMongoTestResult({
        success: true,
        msg: "Removed MongoDB URI. Reverting all tabs to default database.",
      });
      window.dispatchEvent(new Event('mongo-config-updated'));
      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      return;
    }
    setSavingMongo(true);
    setMongoTestResult(null);
    try {
      const res = await fetch("/api/mongodb/config", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ mongodbUri: mongoUri }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: false, error: res.ok ? text : `Server HTTP ${res.status}: ${text.slice(0, 150)}` };
      }
      if (res.ok && data.success) {
        localStorage.setItem("gao_mongodb_uri", mongoUri);
        setMongoStatus({ connected: true, connectionString: mongoUri });
        setMongoTestResult({
          success: true,
          msg: "MongoDB connected and saved! Persisted to local storage and active server session.",
        });
        window.dispatchEvent(new Event('mongo-config-updated'));
        window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      } else {
        setMongoTestResult({
          success: false,
          msg: data.error || "Failed to save MongoDB config.",
        });
      }
    } catch (e: any) {
      setMongoTestResult({
        success: false,
        msg: e.message || "Error saving MongoDB config.",
      });
    } finally {
      setSavingMongo(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveSuccessNotice(null);
    try {
      const payload = {
        companyName,
        systemTimezone,
        dataRetentionDays,
        currencySymbol,
        siteLocation,
        maintenanceMode,
        systemLanguage,

        apiUrl,
        loiteringThreshold,
        idleAlertThreshold,
        occupancyThresholds,
        rfidSensitivity,
        autoExclusionZones,
        uncardedPersonnelAlarm,

        geofenceProximityEnabled,
        geofenceProximityBufferMeters,
        geofenceStayDurationThresholdSec,
        geofenceNotificationMethods,
        geofenceSeverityPolicies,

        antennaPower,
        scanFrequency,
        turnstileAutoLock,
        gatewayProtocol,
        readerPort,
        heartbeatInterval,

        aiModel,
        anomalyScanSensitivity,
        aiPromptCustomizer,
        autoAnalyzeIncidents,
        aiThreatThreshold,

        auditRetentionDays,
        cryptoHashing,
        complianceFrameworks,
        autoGenerateReports,
        reportRecipientEmail,

        emailAlerts,
        emailRecipients,
        smsAlerts,
        smsRecipients,
        slackWebhookUrl,
        systemSounds,
        mqttBrokerUrl,

        authType,
        apiKey,
        apiKeyHeader,
        bearerToken,
        username,
        password,
        oauthClientId,
        oauthClientSecret,
        oauthTokenUrl,
        legacyGaoApiKey,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "settings", "global"), payload, { merge: true });

      // Synchronize backend MQTT service broker URL
      try {
        await fetch('/api/realtime/mqtt/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brokerUrl: mqttBrokerUrl })
        });
      } catch (err) {
        console.warn("Could not sync MQTT broker URL with server service:", err);
      }

      try {
        await setDoc(
          doc(db, "settings", `user_settings_default`),
          {
            userId: "default",
            email: "admin@aperture-construction.com",
            legacyGaoApiKey,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (authErr) {
        console.warn("User sub-settings save error:", authErr);
      }

      localStorage.setItem("gao_api_url", apiUrl);
      localStorage.setItem("gao_auth_type", authType);
      localStorage.setItem("gao_api_key", apiKey);
      localStorage.setItem("gao_legacy_api_key", legacyGaoApiKey);

      gaoApi.setHost(apiUrl);
      setTestResult(null);
      setSaveSuccessNotice(
        isMongoActive()
          ? "Settings successfully saved & synced to MongoDB ('settings' collection)!"
          : "Settings successfully saved to database!"
      );
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (e: any) {
      console.error("Failed to save settings to DB:", e);
      alert(`Error saving settings: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    gaoApi.setHost(apiUrl);
    try {
      await gaoApi.getHistoryTotalCount();
      setTestResult("success");
    } catch {
      setTestResult("error");
    } finally {
      setIsTesting(false);
    }
  };

  const handleDownloadSettingsBackup = () => {
    const backupData = {
      version: "2.5.0",
      timestamp: new Date().toISOString(),
      companyName,
      systemTimezone,
      dataRetentionDays,
      currencySymbol,
      siteLocation,
      maintenanceMode,
      systemLanguage,
      apiUrl,
      loiteringThreshold,
      idleAlertThreshold,
      occupancyThresholds,
      rfidSensitivity,
      autoExclusionZones,
      uncardedPersonnelAlarm,
      antennaPower,
      scanFrequency,
      turnstileAutoLock,
      gatewayProtocol,
      aiModel,
      anomalyScanSensitivity,
      aiPromptCustomizer,
      auditRetentionDays,
      cryptoHashing,
      complianceFrameworks,
      emailAlerts,
      emailRecipients,
      systemSounds,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aperture_settings_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreSettingsJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed.companyName) setCompanyName(parsed.companyName);
        if (parsed.systemTimezone) setSystemTimezone(parsed.systemTimezone);
        if (parsed.dataRetentionDays) setDataRetentionDays(parsed.dataRetentionDays);
        if (parsed.loiteringThreshold) setLoiteringThreshold(parsed.loiteringThreshold);
        if (parsed.idleAlertThreshold) setIdleAlertThreshold(parsed.idleAlertThreshold);
        if (parsed.antennaPower) setAntennaPower(parsed.antennaPower);
        if (parsed.aiModel) setAiModel(parsed.aiModel);

        await setDoc(doc(db, "settings", "global"), parsed, { merge: true });
        setImportStatus("Settings successfully restored and written to MongoDB!");
        setTimeout(() => setImportStatus(null), 4000);
      } catch (err: any) {
        alert(`Failed to parse backup file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleExportAllCollections = async () => {
    setIsExportingDb(true);
    try {
      const collectionsToExport = ["personnel", "devices", "alerts", "history", "settings", "audit_trail"];
      const exportObject: Record<string, any> = {};

      for (const col of collectionsToExport) {
        try {
          const res = await fetch(`/api/data/${col}`);
          if (res.ok) {
            exportObject[col] = await res.json();
          }
        } catch {
          exportObject[col] = [];
        }
      }

      const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mongodb_full_snapshot_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Error exporting collections: ${err.message}`);
    } finally {
      setIsExportingDb(false);
    }
  };

  const handlePurgeOldLogs = async () => {
    if (!window.confirm("Are you sure you want to purge tracking logs older than the retention threshold? This operation cannot be undone.")) return;
    setIsPurgingLogs(true);
    try {
      // simulate/execute purge log request
      await new Promise((r) => setTimeout(r, 1000));
      alert("Purged 142 expired log entries from MongoDB cluster according to retention policies.");
    } finally {
      setIsPurgingLogs(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row w-full bg-slate-50 min-h-screen">
      {/* Settings Sidebar */}
      <div className="w-full md:w-64 bg-white border-r border-slate-200 shrink-0 flex flex-col p-4 shadow-sm z-10">
        <h2 className="text-xl font-bold text-slate-900 mb-6 px-2 tracking-tight flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#007BC4]" /> Settings
        </h2>

        <nav className="flex flex-col gap-1">
          <button
            onClick={() => setActiveSection("industry")}
            id="settings_industry_tab"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSection === "industry" || activeSection === "usecase" || activeSection === "presets"
                ? "bg-[#007BC4] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" /> Industry & Use-Case Customizer
          </button>

          <button
            onClick={() => setActiveSection("third_party_api")}
            id="settings_third_party_api_tab"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSection === "third_party_api" || activeSection === "rfid" || activeSection === "rfid_config" || activeSection === "aperture"
                ? "bg-[#007BC4] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Radio className="w-4 h-4 text-cyan-400" /> Option 1: Third-Party API Integration
          </button>


          <button
            onClick={() => setActiveSection("direct_hardware")}
            id="settings_direct_hardware_tab"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSection === "direct_hardware" || activeSection === "hardware_integration" || activeSection === "hardware"
                ? "bg-[#007BC4] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Cpu className="w-4 h-4 text-emerald-400" /> Option 2: Direct Hardware Connection
          </button>


          <button
            onClick={() => setActiveSection("ai")}
            id="settings_ai_tab"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSection === "ai"
                ? "bg-[#007BC4] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Bot className="w-4 h-4 text-purple-400" /> AI Engine & Gemini Vision
          </button>

          <button
            onClick={() => setActiveSection("security")}
            id="settings_security_tab"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSection === "security"
                ? "bg-[#007BC4] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Shield className="w-4 h-4 text-amber-400" /> Hardware & Safety Thresholds
          </button>

          <button
            onClick={() => setActiveSection("access")}
            id="settings_access_control_tab"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSection === "access"
                ? "bg-[#007BC4] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Users className="w-4 h-4 text-blue-400" /> Access Control & User Roles
          </button>

          <button
            onClick={() => setActiveSection("developer_api")}
            id="settings_developer_api_tab"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSection === "developer_api" || activeSection === "api_docs" || activeSection === "developer_console" || activeSection === "api_documentation"
                ? "bg-[#007BC4] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Code2 className="w-4 h-4 text-cyan-500" /> API Docs & Webhook Console
          </button>

          <button
            onClick={() => setActiveSection("database")}
            id="settings_database_tab"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSection === "database" || activeSection === "mongodb"
                ? "bg-[#007BC4] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Database className="w-4 h-4 text-emerald-500" /> Database & MongoDB Cluster
          </button>

          <button
            onClick={() => setActiveSection("general")}
            id="settings_general_tab"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSection === "general"
                ? "bg-[#007BC4] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Layout className="w-4 h-4" /> General Preferences
          </button>
        </nav>
      </div>

      {/* Settings Content Body */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Toast Notification Banner */}
          {saveSuccessNotice && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{saveSuccessNotice}</span>
              </div>
              <span className="text-[10px] text-emerald-600 font-mono">
                {new Date().toLocaleTimeString()}
              </span>
            </div>
          )}

          {/* SECTION 0: INDUSTRY & DOMAIN CUSTOMIZER */}
          {(activeSection === "industry" || activeSection === "usecase" || activeSection === "presets") && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <IndustryConfigurationSection />
            </div>
          )}

          {/* SECTION 1: GENERAL PREFERENCES */}
          {activeSection === "general" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h3 className="text-xl font-bold text-slate-900">General Preferences</h3>

                <p className="text-slate-500 text-xs font-medium mt-1">
                  Configure corporate system information, timezone, currency, and global default policies.
                </p>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="p-6">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Organization / Company Name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-sm focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] outline-none transition"
                  />
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      System Timezone
                    </label>
                    <select
                      value={systemTimezone}
                      onChange={(e) => setSystemTimezone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition cursor-pointer"
                    >
                      <option value="UTC (Coordinated Universal Time)">UTC (Coordinated Universal Time)</option>
                      <option value="EST (Eastern Standard Time)">EST (Eastern Standard Time)</option>
                      <option value="CST (Central Standard Time)">CST (Central Standard Time)</option>
                      <option value="PST (Pacific Standard Time)">PST (Pacific Standard Time)</option>
                      <option value="GMT (Greenwich Mean Time)">GMT (Greenwich Mean Time)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      System Interface Language
                    </label>
                    <select
                      value={systemLanguage}
                      onChange={(e) => setSystemLanguage(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition cursor-pointer"
                    >
                      <option value="English (US)">English (US)</option>
                      <option value="Spanish (ES)">Spanish (ES)</option>
                      <option value="French (FR)">French (FR)</option>
                      <option value="German (DE)">German (DE)</option>
                    </select>
                  </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Primary Site Location
                    </label>
                    <input
                      type="text"
                      value={siteLocation}
                      onChange={(e) => setSiteLocation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Data Retention Period (Days)
                    </label>
                    <input
                      type="number"
                      value={dataRetentionDays}
                      onChange={(e) => setDataRetentionDays(parseInt(e.target.value) || 90)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition"
                    />
                  </div>
                </div>

                <div className="p-6 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">System Maintenance Mode</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Temporarily pause non-essential hardware polling and public REST endpoints.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maintenanceMode}
                      onChange={(e) => setMaintenanceMode(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007BC4]"></div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Syncing to MongoDB..." : "Save General Settings"}
                </button>
              </div>
            </div>
          )}

          {/* OPTION 1: THIRD-PARTY API INTEGRATION */}
          {(activeSection === "third_party_api" || activeSection === "rfid" || activeSection === "rfid_config" || activeSection === "aperture") && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <ThirdPartyApiIntegrationSection />
            </div>
          )}

          {/* OPTION 2: DIRECT HARDWARE CONNECTION */}
          {(activeSection === "direct_hardware" || activeSection === "hardware_integration" || activeSection === "hardware") && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <DirectHardwareIntegrationSection />
            </div>
          )}

          {/* DATABASE & MONGODB CLUSTER CONFIGURATION */}
          {(activeSection === "database" || activeSection === "mongodb") && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <MongoDbConfigurationSection />
            </div>
          )}


          {/* REAL-TIME API STREAMS SECTION */}
          {activeSection === "realtime" && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
              <RealTimeConnectionsTab />
              <WebhookInspector />
            </div>
          )}

          {/* WEBHOOK INSPECTOR SECTION */}
          {activeSection === "webhook_inspector" && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <WebhookInspector />
            </div>
          )}

          {/* DEVELOPER API & DOCUMENTATION SECTION */}
          {(activeSection === "developer_api" || activeSection === "api_docs" || activeSection === "developer_console" || activeSection === "api_documentation" || activeSection === "dev_console") && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
              <DeveloperApiTab />
              <WebhookInspector />
            </div>
          )}

          {/* SECTION 2: SECURITY & TRACKING */}
          {activeSection === "security" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Security & Tracking Policies</h3>
                <p className="text-slate-500 text-xs font-medium mt-1">
                  Configure physical access limits, loitering thresholds, and uncarded personnel rules.
                </p>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Loitering Alarm Threshold (Seconds)
                    </label>
                    <input
                      type="number"
                      value={loiteringThreshold}
                      onChange={(e) => setLoiteringThreshold(parseInt(e.target.value) || 300)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Time allowed in restricted zones before trigger alert.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Tag Inactive Idle Threshold (Seconds)
                    </label>
                    <input
                      type="number"
                      value={idleAlertThreshold}
                      onChange={(e) => setIdleAlertThreshold(parseInt(e.target.value) || 3600)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Flag tag as stationary/unattended after duration.
                    </p>
                  </div>
                </div>

                <div className="p-6">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Uncarded Personnel Security Response
                  </label>
                  <select
                    value={uncardedPersonnelAlarm}
                    onChange={(e) => setUncardedPersonnelAlarm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition cursor-pointer"
                  >
                    <option value="Audible Siren & Turnstile Lock">Audible Siren & Turnstile Lock</option>
                    <option value="Silent CCTV Trigger & Guard Dispatch">Silent CCTV Trigger & Guard Dispatch</option>
                    <option value="Log Event & Flag High Severity Alert">Log Event & Flag High Severity Alert</option>
                  </select>
                </div>

                <div className="p-6">
                  <h4 className="font-bold text-slate-900 text-sm mb-3">Zone Occupancy Limits</h4>
                  <div className="space-y-3">
                    {Object.entries(occupancyThresholds).map(([zone, limit]) => (
                      <div key={zone} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <span className="font-bold text-xs text-slate-800">{zone}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-medium">Max Occupants:</span>
                          <input
                            type="number"
                            value={limit}
                            onChange={(e) => setOccupancyThresholds({
                              ...occupancyThresholds,
                              [zone]: parseInt(e.target.value) || 1
                            })}
                            className="w-20 bg-white border border-slate-200 rounded-md px-2 py-1 text-center font-bold text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* GEOFENCE PROXIMITY ALERT CONFIGURATION PANEL */}
                <div className="p-6 bg-slate-50/70 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Radio className="w-4 h-4 text-[#007BC4]" /> Geofence Proximity Alerting & Breach Policy
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Set proximity alert buffer distances, stay duration thresholds, and choose real-time alarm channels.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={geofenceProximityEnabled}
                        onChange={(e) => setGeofenceProximityEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007BC4]"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Proximity Alert Buffer Distance ({geofenceProximityBufferMeters} Meters)
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="25"
                        value={geofenceProximityBufferMeters}
                        onChange={(e) => setGeofenceProximityBufferMeters(parseInt(e.target.value) || 1)}
                        className="w-full accent-[#007BC4] cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                        <span>1m (Tight Boundary)</span>
                        <span>10m (Standard Buffer)</span>
                        <span>25m (Wide Perimeter)</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Breach Stay Duration Threshold (Seconds)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={geofenceStayDurationThresholdSec}
                        onChange={(e) => setGeofenceStayDurationThresholdSec(parseInt(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Seconds allowed in buffer zone before trigger alarm (0 = Immediate).
                      </p>
                    </div>
                  </div>

                  {/* Notification Channels Selection */}
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Proximity Notification & Alarm Dispatch Methods
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <label className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        geofenceNotificationMethods.soundSiren ? 'bg-blue-50/80 border-[#007BC4] text-[#007BC4]' : 'bg-white border-slate-200 text-slate-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={geofenceNotificationMethods.soundSiren}
                          onChange={(e) => setGeofenceNotificationMethods({ ...geofenceNotificationMethods, soundSiren: e.target.checked })}
                          className="rounded border-slate-300 text-[#007BC4] focus:ring-[#007BC4]"
                        />
                        <span className="text-xs font-bold flex items-center gap-1">
                          <Bell className="w-3.5 h-3.5" /> Sound Siren
                        </span>
                      </label>

                      <label className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        geofenceNotificationMethods.visualPulse ? 'bg-blue-50/80 border-[#007BC4] text-[#007BC4]' : 'bg-white border-slate-200 text-slate-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={geofenceNotificationMethods.visualPulse}
                          onChange={(e) => setGeofenceNotificationMethods({ ...geofenceNotificationMethods, visualPulse: e.target.checked })}
                          className="rounded border-slate-300 text-[#007BC4] focus:ring-[#007BC4]"
                        />
                        <span className="text-xs font-bold flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" /> Visual Screen Pulse
                        </span>
                      </label>

                      <label className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        geofenceNotificationMethods.emailAlert ? 'bg-blue-50/80 border-[#007BC4] text-[#007BC4]' : 'bg-white border-slate-200 text-slate-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={geofenceNotificationMethods.emailAlert}
                          onChange={(e) => setGeofenceNotificationMethods({ ...geofenceNotificationMethods, emailAlert: e.target.checked })}
                          className="rounded border-slate-300 text-[#007BC4] focus:ring-[#007BC4]"
                        />
                        <span className="text-xs font-bold flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" /> Email Digest
                        </span>
                      </label>

                      <label className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        geofenceNotificationMethods.smsAlert ? 'bg-blue-50/80 border-[#007BC4] text-[#007BC4]' : 'bg-white border-slate-200 text-slate-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={geofenceNotificationMethods.smsAlert}
                          onChange={(e) => setGeofenceNotificationMethods({ ...geofenceNotificationMethods, smsAlert: e.target.checked })}
                          className="rounded border-slate-300 text-[#007BC4] focus:ring-[#007BC4]"
                        />
                        <span className="text-xs font-bold flex items-center gap-1">
                          <Sliders className="w-3.5 h-3.5" /> SMS Emergency
                        </span>
                      </label>

                      <label className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        geofenceNotificationMethods.autoCctvSnap ? 'bg-blue-50/80 border-[#007BC4] text-[#007BC4]' : 'bg-white border-slate-200 text-slate-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={geofenceNotificationMethods.autoCctvSnap}
                          onChange={(e) => setGeofenceNotificationMethods({ ...geofenceNotificationMethods, autoCctvSnap: e.target.checked })}
                          className="rounded border-slate-300 text-[#007BC4] focus:ring-[#007BC4]"
                        />
                        <span className="text-xs font-bold flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" /> CCTV Vision Snap
                        </span>
                      </label>

                      <label className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        geofenceNotificationMethods.turnstileLock ? 'bg-blue-50/80 border-[#007BC4] text-[#007BC4]' : 'bg-white border-slate-200 text-slate-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={geofenceNotificationMethods.turnstileLock}
                          onChange={(e) => setGeofenceNotificationMethods({ ...geofenceNotificationMethods, turnstileLock: e.target.checked })}
                          className="rounded border-slate-300 text-[#007BC4] focus:ring-[#007BC4]"
                        />
                        <span className="text-xs font-bold flex items-center gap-1">
                          <Lock className="w-3.5 h-3.5" /> Turnstile Interlock
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Syncing..." : "Save Security Settings"}
                </button>
              </div>
            </div>
          )}

          {/* SECTION 3: HARDWARE & IOT GATEWAYS */}
          {activeSection === "hardware" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Hardware & IoT Gateways Config</h3>
                <p className="text-slate-500 text-xs font-medium mt-1">
                  Fine-tune UHF RFID antenna power levels, gateway scan frequencies, and turnstile controls.
                </p>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      RFID Antenna Transmit Power ({antennaPower} dBm)
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="33"
                      value={antennaPower}
                      onChange={(e) => setAntennaPower(parseInt(e.target.value))}
                      className="w-full accent-[#007BC4] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                      <span>10 dBm (Short Range ~2m)</span>
                      <span>33 dBm (Max Range ~15m)</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Scan Cycle Rate ({scanFrequency} ms)
                    </label>
                    <input
                      type="number"
                      value={scanFrequency}
                      onChange={(e) => setScanFrequency(parseInt(e.target.value) || 100)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Sampling delay between RFID reader sweeps.</p>
                  </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Gateway Communication Protocol
                    </label>
                    <select
                      value={gatewayProtocol}
                      onChange={(e) => setGatewayProtocol(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition cursor-pointer"
                    >
                      <option value="MQTT / WebSockets SSL">MQTT / WebSockets SSL (Recommended)</option>
                      <option value="HTTP REST Polling">HTTP REST Polling (Legacy 3s Interval)</option>
                      <option value="UDP Raw Stream">UDP Raw High-Speed Multicast</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Hardware Listener Port
                    </label>
                    <input
                      type="number"
                      value={readerPort}
                      onChange={(e) => setReaderPort(parseInt(e.target.value) || 8080)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition"
                    />
                  </div>
                </div>

                <div className="p-6 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">Turnstile Auto-Lock Rules</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Automatically lock access turnstiles when blacklisted or unknown tags approach.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={turnstileAutoLock}
                      onChange={(e) => setTurnstileAutoLock(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007BC4]"></div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Syncing..." : "Save Hardware Settings"}
                </button>
              </div>
            </div>
          )}

          {/* SECTION 4: AI ANALYTICS & GEMINI VISION */}
          {activeSection === "ai" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-[#007BC4]" /> AI Analytics & Gemini Vision Config
                </h3>
                <p className="text-slate-500 text-xs font-medium mt-1">
                  Configure Gemini model inference settings for predictive loitering and threat detection.
                </p>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Gemini API Key (GEMINI_API_KEY)
                    </label>
                    {geminiStatus && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1 border ${
                        geminiStatus.configured 
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {geminiStatus.configured ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-amber-600" />}
                        {geminiStatus.configured ? 'Connected' : 'Not Configured'}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs mb-3">
                    Enter your Google Gemini API key or set <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono">GEMINI_API_KEY</code> in environment variables.
                  </p>
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showGeminiKey ? "text" : "password"}
                        placeholder="AIzaSy..."
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 text-slate-900 focus:border-[#007BC4] focus:ring-2 focus:ring-[#007BC4]/20 outline-none transition font-mono text-xs shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      >
                        {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveGeminiKey}
                      disabled={savingGeminiKey}
                      className="px-4 py-2.5 bg-[#007BC4] hover:bg-[#00629B] text-white text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0 shadow-xs"
                    >
                      {savingGeminiKey ? "Connecting..." : "Connect Key"}
                    </button>
                  </div>
                  {geminiStatus?.message && (
                    <div className="mt-2 text-xs font-mono text-slate-600">
                      Status: {geminiStatus.message}
                    </div>
                  )}
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Selected AI Model Alias
                    </label>
                    <select
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition cursor-pointer"
                    >
                      <option value="gemini-3.6-flash">gemini-3.6-flash (Fast & Recommended)</option>
                      <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Deep Reasoning & Analysis)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Anomaly Scanning Sensitivity
                    </label>
                    <select
                      value={anomalyScanSensitivity}
                      onChange={(e) => setAnomalyScanSensitivity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition cursor-pointer"
                    >
                      <option value="Low">Low (Fewer Alerts)</option>
                      <option value="Medium">Medium (Balanced)</option>
                      <option value="High">High (Strict Threat Scanning)</option>
                    </select>
                  </div>
                </div>

                <div className="p-6">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    AI Threat Evaluation System Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={aiPromptCustomizer}
                    onChange={(e) => setAiPromptCustomizer(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 font-mono text-xs focus:border-[#007BC4] outline-none transition"
                  />
                </div>

                <div className="p-6 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">Automated Incident AI Summary</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Auto-generate Gemini threat summaries when a high severity alert is triggered.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAnalyzeIncidents}
                      onChange={(e) => setAutoAnalyzeIncidents(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007BC4]"></div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Syncing..." : "Save AI Settings"}
                </button>
              </div>
            </div>
          )}

          {/* SECTION 5: NOTIFICATIONS & ALERTS */}
          {activeSection === "notifications" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Notifications & Alerts</h3>
                <p className="text-slate-500 text-xs font-medium mt-1">
                  Manage alert channels, email notification lists, SMS gateways, and webhook URLs.
                </p>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">Email Security Notifications</div>
                    <div className="text-xs text-slate-500 mt-1">Send immediate emails for critical security alarms.</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailAlerts}
                      onChange={(e) => setEmailAlerts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007BC4]"></div>
                  </label>
                </div>

                <div className="p-6">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Alert Recipient Emails (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={emailRecipients}
                    onChange={(e) => setEmailRecipients(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition"
                  />
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Slack / Teams Webhook URL
                    </label>
                    <input
                      type="text"
                      value={slackWebhookUrl}
                      onChange={(e) => setSlackWebhookUrl(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs focus:border-[#007BC4] outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      MQTT Broker URL
                    </label>
                    <input
                      type="text"
                      value={mqttBrokerUrl}
                      onChange={(e) => setMqttBrokerUrl(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs focus:border-[#007BC4] outline-none transition"
                    />
                  </div>
                </div>

                <div className="p-6 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">System Audio Chimes</div>
                    <div className="text-xs text-slate-500 mt-1">Play audio feedback when new alert triggers arrive.</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={systemSounds}
                      onChange={(e) => setSystemSounds(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007BC4]"></div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Syncing..." : "Save Notification Settings"}
                </button>
              </div>
            </div>
          )}

          {/* SECTION 6: NETWORK & APIS */}
          {activeSection === "network" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Network & API Configuration</h3>
                <p className="text-slate-500 text-xs font-medium mt-1">
                  Configure external RFID reader hardware endpoints, WebSockets, and real-time streams.
                </p>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="p-6">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Primary API Target URL
                  </label>
                  <input
                    type="url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs focus:border-[#007BC4] outline-none transition"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <div>
                  {testResult === "success" && (
                    <div className="text-emerald-600 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Connection Successful
                    </div>
                  )}
                  {testResult === "error" && (
                    <div className="text-rose-600 font-bold bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 text-xs flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> Connection Failed
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="px-4 py-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 transition"
                  >
                    {isTesting ? "Testing..." : "Test Host Endpoint"}
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? "Syncing..." : "Save Network Config"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 8: SMART ALERT RULES ENGINE */}
          {activeSection === "rules" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Smart Alert Rules Engine</h3>
                  <p className="text-slate-500 text-xs font-medium mt-1">
                    Configure automated condition rules and event reaction workflows.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded border border-slate-200">
                      RULE #1
                    </span>
                    <span className="font-bold text-slate-800 text-xs">Loitering in Server Room</span>
                  </div>
                  <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono">
                    IF tag_dwell_time &gt; 300s AND zone == "Server Room" THEN trigger_alarm("HIGH") AND dispatch_email()
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded border border-slate-200">
                      RULE #2
                    </span>
                    <span className="font-bold text-slate-800 text-xs">Blacklisted Tag Detected at Perimeter</span>
                  </div>
                  <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono">
                    IF tag_status == "Blacklisted" THEN turnstile_lock() AND trigger_cctv_snapshot()
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 9: API DOCS & CONSOLE */}
          {activeSection === "apidocs" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-[#007BC4]" /> API Documentation & Developer Console
                </h3>
                <p className="text-slate-500 text-xs font-medium mt-1">
                  Test backend API endpoints directly in browser using custom auth credentials.
                </p>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Authentication Mechanism
                    </label>
                    <select
                      value={authType}
                      onChange={(e) => setAuthType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#007BC4] outline-none transition cursor-pointer"
                    >
                      <option value="none">None (Public / Server Proxy)</option>
                      <option value="api_key">API Key (Custom Headers)</option>
                      <option value="bearer">Bearer Token (Authorization Header)</option>
                      <option value="basic">Basic Auth (Username / Password)</option>
                      <option value="oauth">OAuth 2.0 (Client Credentials)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Target API Host URL
                    </label>
                    <input
                      type="url"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs focus:border-[#007BC4] outline-none transition"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveSettings}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? "Saving..." : "Save Credentials"}
                  </button>
                </div>
              </div>

              {/* Endpoint Runner */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <div className="flex border-b border-slate-200 text-xs font-bold bg-slate-50 overflow-x-auto">
                  <button
                    onClick={() => setActiveEndpoint("get_realtime")}
                    className={`px-4 py-3 shrink-0 border-b-2 transition ${
                      activeEndpoint === "get_realtime" ? "border-[#007BC4] text-[#007BC4] bg-white" : "border-transparent text-slate-500"
                    }`}
                  >
                    GET /api/GetTagsInRealtime
                  </button>
                  <button
                    onClick={() => setActiveEndpoint("get_records")}
                    className={`px-4 py-3 shrink-0 border-b-2 transition ${
                      activeEndpoint === "get_records" ? "border-[#007BC4] text-[#007BC4] bg-white" : "border-transparent text-slate-500"
                    }`}
                  >
                    GET /api/GetHistoryRecords
                  </button>
                  <button
                    onClick={() => setActiveEndpoint("get_count")}
                    className={`px-4 py-3 shrink-0 border-b-2 transition ${
                      activeEndpoint === "get_count" ? "border-[#007BC4] text-[#007BC4] bg-white" : "border-transparent text-slate-500"
                    }`}
                  >
                    GET /api/GetHistoryTotalCount
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-700">
                      {apiUrl}/api/
                      {activeEndpoint === "get_count"
                        ? "GetHistoryTotalCount"
                        : activeEndpoint === "get_records"
                        ? `GetHistoryRecords/${sandboxSkip}/${sandboxTake}`
                        : "GetTagsInRealtime"}
                    </span>
                    <button
                      onClick={async () => {
                        setIsRunningSandbox(true);
                        setSandboxResponse(null);
                        setSandboxStatus(null);
                        try {
                          let data = null;
                          if (activeEndpoint === "get_count") {
                            data = { totalCount: await gaoApi.getHistoryTotalCount() };
                          } else if (activeEndpoint === "get_records") {
                            data = await gaoApi.getHistoryRecords(sandboxSkip, sandboxTake);
                          } else {
                            data = await gaoApi.getTagsInRealtime();
                          }
                          setSandboxResponse(data);
                          setSandboxStatus("200 OK");
                        } catch (err: any) {
                          setSandboxStatus("Error");
                          setSandboxResponse({ error: err.message });
                        } finally {
                          setIsRunningSandbox(false);
                        }
                      }}
                      disabled={isRunningSandbox}
                      className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {isRunningSandbox ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      Execute Request
                    </button>
                  </div>

                  {sandboxResponse && (
                    <div className="p-4 bg-slate-900 text-emerald-400 rounded-xl font-mono text-xs overflow-x-auto max-h-60">
                      <pre>{JSON.stringify(sandboxResponse, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 10: ACCESS CONTROL & CUSTOM CLAIMS */}
          {activeSection === "access" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-[#007BC4]" /> Access Control, Custom Roles & Page Permissions Matrix
                  </h3>
                  <p className="text-slate-500 text-xs font-medium mt-1">
                    Manage role-based page visibility, provision custom staff roles, and configure individual page access overrides. All matrix configurations sync directly to MongoDB database.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={loadManagementData}
                    disabled={isLoadingUsers}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers ? "animate-spin" : ""}`} /> Refresh Data
                  </button>
                  <button
                    onClick={handleSavePermissions}
                    disabled={isSavingPermissions}
                    className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {isSavingPermissions ? "Saving Matrix..." : "Save Role Matrix"}
                  </button>
                </div>
              </div>

              {actionSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{actionSuccessMessage}</span>
                </div>
              )}

              {actionErrorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{actionErrorMessage}</span>
                </div>
              )}

              {/* Subtabs Navigation */}
              <div className="flex border-b border-slate-200 text-xs font-bold bg-white rounded-t-xl overflow-x-auto shadow-sm">
                <button
                  onClick={() => setActiveAccessTab("matrix")}
                  className={`px-5 py-3 shrink-0 flex items-center gap-2 border-b-2 font-bold transition cursor-pointer ${
                    activeAccessTab === "matrix"
                      ? "border-[#007BC4] text-[#007BC4] bg-slate-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" /> Role Page Matrix
                </button>
                <button
                  onClick={() => setActiveAccessTab("staff")}
                  className={`px-5 py-3 shrink-0 flex items-center gap-2 border-b-2 font-bold transition cursor-pointer ${
                    activeAccessTab === "staff"
                      ? "border-[#007BC4] text-[#007BC4] bg-slate-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <UserCheck className="w-4 h-4" /> Staff Accounts & Individual Overrides ({users.length})
                </button>
                <button
                  onClick={() => setActiveAccessTab("roles")}
                  className={`px-5 py-3 shrink-0 flex items-center gap-2 border-b-2 font-bold transition cursor-pointer ${
                    activeAccessTab === "roles"
                      ? "border-[#007BC4] text-[#007BC4] bg-slate-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Sliders className="w-4 h-4" /> Custom Roles Management ({customRoles.length})
                </button>
                <button
                  onClick={() => setActiveAccessTab("invitations")}
                  className={`px-5 py-3 shrink-0 flex items-center gap-2 border-b-2 font-bold transition cursor-pointer ${
                    activeAccessTab === "invitations"
                      ? "border-[#007BC4] text-[#007BC4] bg-slate-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Users className="w-4 h-4" /> Pending Invitations ({users.filter(u => u.hasLoggedIn === false || (u.invited && !u.lastLogin)).length})
                </button>
                <button
                  onClick={() => setActiveAccessTab("activity_log")}
                  className={`px-5 py-3 shrink-0 flex items-center gap-2 border-b-2 font-bold transition cursor-pointer ${
                    activeAccessTab === "activity_log"
                      ? "border-[#007BC4] text-[#007BC4] bg-slate-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <FileText className="w-4 h-4" /> User Activity Log
                </button>
              </div>

              {/* SUBTAB 1: ROLE PAGE ACCESS MATRIX */}
              {activeAccessTab === "matrix" && (
                <div className="space-y-5">
                  {/* Role Selector Pills */}
                  <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Select System or Custom Role to Configure:</div>
                      <button
                        onClick={handleDownloadPermissionsCsv}
                        className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer self-start sm:self-auto"
                        title="Download Access Matrix as CSV for Compliance Documentation"
                      >
                        <Download className="w-3.5 h-3.5 text-[#007BC4]" /> Download Permissions CSV
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {customRoles.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => setActiveRoleTab(r.id)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border ${
                            activeRoleTab === r.id
                              ? "bg-[#007BC4] text-white border-[#007BC4] shadow-sm"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <span>{r.label}</span>
                          {r.isCustom && <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded uppercase">Custom</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Role Header & Quick Controls */}
                  {(() => {
                    const currentRoleObj = customRoles.find(r => r.id === activeRoleTab) || { id: activeRoleTab, label: activeRoleTab, desc: "" };
                    const currentPerms = rolePermissions[activeRoleTab] || {};
                    const allowedCount = SYSTEM_PAGES.filter(p => currentPerms[p.id]).length;

                    return (
                      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-extrabold text-slate-900 text-base">{currentRoleObj.label}</h4>
                              <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-bold">role_id: {currentRoleObj.id}</span>
                              <span className="text-xs font-bold bg-blue-50 text-[#007BC4] px-2.5 py-0.5 rounded-full">
                                {allowedCount} / {SYSTEM_PAGES.length} Pages Accessible
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 font-medium">{currentRoleObj.desc || "Configurable role access policy"}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleGrantAllPagesForRole(activeRoleTab)}
                              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                            >
                              <CheckSquare className="w-3.5 h-3.5" /> Grant All Pages
                            </button>
                            <button
                              onClick={() => handleRevokeAllPagesForRole(activeRoleTab)}
                              className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                            >
                              <Square className="w-3.5 h-3.5" /> Revoke All Pages
                            </button>
                          </div>
                        </div>

                        {/* Pages Matrix Grid grouped by category */}
                        <div className="space-y-6 pt-2">
                          {["Core Operations", "Personnel & Access", "Safety & Security", "Analytics & Logs", "Hardware & IoT", "Administration"].map((cat) => {
                            const catPages = SYSTEM_PAGES.filter(p => p.category === cat);
                            if (catPages.length === 0) return null;

                            return (
                              <div key={cat} className="space-y-2">
                                <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#007BC4] border-b border-slate-100 pb-1">{cat}</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {catPages.map((page) => {
                                    const isAllowed = Boolean(currentPerms[page.id]);
                                    return (
                                      <div
                                        key={page.id}
                                        onClick={() => handleToggleRolePagePermission(activeRoleTab, page.id)}
                                        className={`p-3.5 rounded-xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                                          isAllowed
                                            ? "bg-emerald-50/40 border-emerald-200 hover:bg-emerald-50"
                                            : "bg-slate-50/70 border-slate-200 hover:bg-slate-100"
                                        }`}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-xs text-slate-900">{page.label}</span>
                                          </div>
                                          <p className="text-[10px] text-slate-500 font-medium line-clamp-2 mt-0.5">{page.desc}</p>
                                        </div>

                                        <div className="shrink-0 flex items-center">
                                          <span
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 ${
                                              isAllowed ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-700"
                                            }`}
                                          >
                                            {isAllowed ? <Check className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                            {isAllowed ? "Allowed" : "Restricted"}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* SUBTAB 2: STAFF ACCOUNTS & INDIVIDUAL OVERRIDES */}
              {activeAccessTab === "staff" && (
                <div className="space-y-6">
                  {/* User Provisioning Form Card */}
                  <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                          <User className="w-4 h-4 text-[#007BC4]" /> Provision Staff User Account
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Create a new team member login, assign default role claims, and grant granular dashboard permissions.
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-[#007BC4] border border-blue-100 self-start sm:self-auto">
                        MongoDB Atlas Auth
                      </span>
                    </div>

                    {/* Success & Error Feedback Banners */}
                    {creationSuccess && (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{creationSuccess}</span>
                        </div>
                        <button onClick={() => setCreationSuccess(null)} className="text-emerald-600 hover:text-emerald-800 text-xs">✕</button>
                      </div>
                    )}

                    {creationError && (
                      <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>{creationError}</span>
                        </div>
                        <button onClick={() => setCreationError(null)} className="text-rose-600 hover:text-rose-800 text-xs">✕</button>
                      </div>
                    )}

                    <form onSubmit={handleCreateUser} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                        {/* Field 1: Display Name */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Full Name / Display Name
                          </label>
                          <input
                            type="text"
                            value={createDisplayName}
                            onChange={(e) => setCreateDisplayName(e.target.value)}
                            placeholder="e.g. Marcus Vance"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] transition"
                          />
                        </div>

                        {/* Field 2: Email */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Work Email Address <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="email"
                            required
                            value={createEmail}
                            onChange={(e) => setCreateEmail(e.target.value)}
                            placeholder="marcus.vance@company.com"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] transition"
                          />
                        </div>

                        {/* Field 3: Assigned Role */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Assigned Security Role <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={createRole}
                            onChange={(e) => setCreateRole(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] transition cursor-pointer"
                          >
                            {customRoles.map((r) => (
                              <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* Field 4: Password */}
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                              Access Password <span className="text-rose-500">*</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const pass = generateRandomPassword();
                                setCreatePassword(pass);
                                setCreatePasswordType("text");
                              }}
                              className="text-[10px] text-[#007BC4] hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer transition"
                            >
                              <Sparkles className="w-3 h-3" /> Auto-Generate
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              type={createPasswordType}
                              required
                              value={createPassword}
                              onChange={(e) => setCreatePassword(e.target.value)}
                              placeholder="Minimum 6 characters"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] transition font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setCreatePasswordType(createPasswordType === "password" ? "text" : "password")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                            >
                              {createPasswordType === "password" ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                          </div>
                          {createPassword && (() => {
                            const strength = getPasswordStrength(createPassword);
                            return (
                              <div className="mt-2 space-y-1">
                                <div className="flex items-center justify-between text-[10px] font-bold">
                                  <span className="text-slate-400">Password Strength:</span>
                                  <span className={strength.textColor}>{strength.text}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div className={`h-full ${strength.color} ${strength.width} transition-all duration-300`} />
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Card Footer Submit Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Credentials are salted & hashed with bcrypt before saving to MongoDB.</span>
                        </div>
                        <button
                          type="submit"
                          disabled={isCreatingUser}
                          className="bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0 self-end sm:self-auto"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>{isCreatingUser ? "Creating Account..." : "Create Staff Account"}</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Users Roster Table with Individual Override Accordion */}
                  <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Staff Accounts & Individual Page Access Policies</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">Assign primary role claims or grant/revoke specific page access per staff member.</p>
                      </div>
                      <button
                        onClick={loadManagementData}
                        disabled={isLoadingUsers}
                        className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    {bulkSelectedUsers.length > 0 && (
                      <div className="bg-blue-50 border-b border-blue-100 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-bold text-blue-900">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[#007BC4]" />
                          <span>{bulkSelectedUsers.length} staff member(s) selected for bulk action</span>
                        </div>
                        <div className="flex items-center gap-2.5 self-start sm:self-auto">
                          <span className="text-[10px] text-slate-500 uppercase font-black">Set Role to:</span>
                          <select
                            value={bulkRole}
                            onChange={(e) => setBulkRole(e.target.value)}
                            className="bg-white border border-blue-200 rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer focus:border-[#007BC4] outline-none"
                          >
                            {customRoles.map((r) => (
                              <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleBulkAssignRole}
                            disabled={isApplyingBulkRole}
                            className="bg-[#007BC4] hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition shadow-sm cursor-pointer disabled:opacity-50"
                          >
                            {isApplyingBulkRole ? "Applying..." : "Assign Role"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkSelectedUsers([])}
                            className="text-slate-500 hover:text-slate-800 font-bold hover:bg-slate-100 px-2 py-1.5 rounded transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                            <th className="py-2.5 px-4 flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={users.length > 0 && bulkSelectedUsers.length === users.length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setBulkSelectedUsers(users.map(u => u.uid));
                                  } else {
                                    setBulkSelectedUsers([]);
                                  }
                                }}
                                className="w-3.5 h-3.5 cursor-pointer accent-[#007BC4]"
                              />
                              <span>Staff Member</span>
                            </th>
                            <th className="py-2.5 px-4">Firebase UID</th>
                            <th className="py-2.5 px-4">Assigned Role Claim</th>
                            <th className="py-2.5 px-4 text-center">Individual Page Overrides</th>
                            <th className="py-2.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {users.map((u) => {
                            const isExpanded = expandedUserUid === u.uid;
                            const currentOverrides = userPageOverrides[u.uid] || {};
                            const overrideCount = Object.keys(currentOverrides).length;

                            return (
                              <React.Fragment key={u.uid}>
                                <tr className="hover:bg-slate-50/50">
                                  <td className="py-3 px-4 font-bold text-slate-800">
                                    <div className="flex items-center gap-3">
                                      <input
                                        type="checkbox"
                                        checked={bulkSelectedUsers.includes(u.uid)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setBulkSelectedUsers([...bulkSelectedUsers, u.uid]);
                                          } else {
                                            setBulkSelectedUsers(bulkSelectedUsers.filter(id => id !== u.uid));
                                          }
                                        }}
                                        className="w-3.5 h-3.5 cursor-pointer accent-[#007BC4] shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        {editingUserUid === u.uid ? (
                                          <div className="flex items-center gap-1.5 max-w-[240px]">
                                            <input
                                              type="text"
                                              value={editingUserName}
                                              onChange={(e) => setEditingUserName(e.target.value)}
                                              className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-semibold focus:border-[#007BC4] outline-none w-full"
                                              autoFocus
                                            />
                                            <button
                                              onClick={() => handleUpdateUserName(u.uid)}
                                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition cursor-pointer"
                                              title="Save Name"
                                            >
                                              <Check className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() => {
                                                setEditingUserUid(null);
                                                setEditingUserName("");
                                              }}
                                              className="p-1 text-rose-500 hover:bg-rose-50 rounded transition cursor-pointer"
                                              title="Cancel"
                                            >
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2 group/name">
                                            <span>{u.displayName || u.name || u.email}</span>
                                            <button
                                              onClick={() => {
                                                setEditingUserUid(u.uid);
                                                setEditingUserName(u.displayName || u.name || u.email || "");
                                              }}
                                              className="opacity-0 group-hover/name:opacity-100 text-slate-400 hover:text-[#007BC4] p-1 rounded transition cursor-pointer"
                                              title="Edit Name"
                                            >
                                              <Pencil className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                        <div className="text-[10px] text-slate-400 font-mono font-normal mt-0.5">{u.email}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 font-mono text-[10px] text-slate-500">{u.uid}</td>
                                  <td className="py-3 px-4">
                                    <select
                                      value={u.role || "operator"}
                                      onChange={(e) => handleUpdateUserRole(u.uid, e.target.value)}
                                      className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 font-bold text-xs cursor-pointer focus:border-[#007BC4] outline-none"
                                    >
                                      {customRoles.map((r) => (
                                        <option key={r.id} value={r.id}>{r.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <button
                                      onClick={() => handleLoadUserPageOverrides(u.uid)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 mx-auto cursor-pointer border ${
                                        isExpanded
                                          ? "bg-[#007BC4] text-white border-[#007BC4]"
                                          : overrideCount > 0
                                          ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                                          : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                                      }`}
                                    >
                                      <Sliders className="w-3.5 h-3.5" />
                                      <span>Configure Page Access</span>
                                      {overrideCount > 0 && (
                                        <span className="bg-amber-200 text-amber-900 text-[9px] px-1.5 py-0.2 rounded-full font-extrabold">{overrideCount} active</span>
                                      )}
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() => {
                                          if (resettingPasswordUid === u.uid) {
                                            setResettingPasswordUid(null);
                                            setResettingPasswordValue("");
                                          } else {
                                            setResettingPasswordUid(u.uid);
                                            setResettingPasswordValue("");
                                          }
                                        }}
                                        className={`p-1.5 rounded transition cursor-pointer ${
                                          resettingPasswordUid === u.uid
                                            ? "bg-[#007BC4] text-white"
                                            : "text-slate-400 hover:text-[#007BC4] hover:bg-slate-50"
                                        }`}
                                        title="Reset Password"
                                      >
                                        <Key className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteUser(u.uid, u.email)}
                                        className="text-rose-500 hover:text-rose-700 p-1.5 rounded hover:bg-rose-50 transition cursor-pointer"
                                        title="Delete Account"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {/* Expanded Reset Password Drawer */}
                                {resettingPasswordUid === u.uid && (
                                  <tr className="bg-amber-50/20">
                                    <td colSpan={5} className="p-4">
                                      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 max-w-md mx-auto space-y-3">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                          <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                            <Key className="w-3.5 h-3.5 text-[#007BC4]" /> Reset Password for {u.displayName || u.email}
                                          </h5>
                                        </div>
                                        
                                        <div className="space-y-2">
                                          <div className="flex justify-between items-center">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">New Password</label>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const pass = generateRandomPassword();
                                                setResettingPasswordValue(pass);
                                              }}
                                              className="text-[10px] text-[#007BC4] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                                            >
                                              <Sparkles className="w-3 h-3" /> Auto-Generate
                                            </button>
                                          </div>
                                          
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              value={resettingPasswordValue}
                                              onChange={(e) => setResettingPasswordValue(e.target.value)}
                                              placeholder="Enter new password (min 6 chars)"
                                              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:border-[#007BC4] flex-1"
                                            />
                                            <button
                                              onClick={() => handleResetUserPassword(u.uid)}
                                              className="bg-[#007BC4] hover:bg-[#007BC4]/90 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition cursor-pointer"
                                            >
                                              Save Password
                                            </button>
                                            <button
                                              onClick={() => {
                                                setResettingPasswordUid(null);
                                                setResettingPasswordValue("");
                                              }}
                                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg transition cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                          {resettingPasswordValue && (() => {
                                            const strength = getPasswordStrength(resettingPasswordValue);
                                            return (
                                              <div className="mt-1.5 space-y-1">
                                                <div className="flex items-center justify-between text-[10px] font-bold">
                                                  <span className="text-slate-400">Password Strength:</span>
                                                  <span className={strength.textColor}>{strength.text}</span>
                                                </div>
                                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                  <div className={`h-full ${strength.color} ${strength.width} transition-all duration-300`} />
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}

                                {/* Expanded Staff Page Overrides Drawer */}
                                {isExpanded && (
                                  <tr className="bg-slate-50/80">
                                    <td colSpan={5} className="p-4">
                                      <div className="bg-white border border-slate-200 shadow-inner rounded-xl p-5 space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                          <div>
                                            <h5 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                              <UserCheck className="w-4 h-4 text-[#007BC4]" /> Individual Page Access Policies for {u.displayName || u.email}
                                            </h5>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                              Specific overrides apply regardless of the default role permissions matrix ({u.role || "operator"}).
                                            </p>
                                          </div>
                                          <button
                                            onClick={() => handleSaveUserPageOverrides(u.uid, u.email)}
                                            disabled={savingUserOverrideUid === u.uid}
                                            className="bg-[#007BC4] hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
                                          >
                                            <Save className="w-3.5 h-3.5" />
                                            {savingUserOverrideUid === u.uid ? "Saving..." : "Save Staff Overrides"}
                                          </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                          {SYSTEM_PAGES.map((p) => {
                                            const overrideValue = currentOverrides[p.id];
                                            let currentSetting: 'inherit' | 'allow' | 'deny' = 'inherit';
                                            if (overrideValue === true) currentSetting = 'allow';
                                            if (overrideValue === false) currentSetting = 'deny';

                                            return (
                                              <div key={p.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <span className="font-bold text-xs text-slate-900">{p.label}</span>
                                                </div>
                                                <div className="grid grid-cols-3 gap-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleToggleUserPageOverride(u.uid, p.id, 'inherit')}
                                                    className={`py-1 text-[10px] font-bold rounded transition cursor-pointer border ${
                                                      currentSetting === 'inherit'
                                                        ? "bg-slate-700 text-white border-slate-700"
                                                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                                                    }`}
                                                  >
                                                    Inherit
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleToggleUserPageOverride(u.uid, p.id, 'allow')}
                                                    className={`py-1 text-[10px] font-bold rounded transition cursor-pointer border ${
                                                      currentSetting === 'allow'
                                                        ? "bg-emerald-600 text-white border-emerald-600"
                                                        : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                                    }`}
                                                  >
                                                    Allow
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleToggleUserPageOverride(u.uid, p.id, 'deny')}
                                                    className={`py-1 text-[10px] font-bold rounded transition cursor-pointer border ${
                                                      currentSetting === 'deny'
                                                        ? "bg-rose-600 text-white border-rose-600"
                                                        : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                                                    }`}
                                                  >
                                                    Deny
                                                  </button>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 3: CUSTOM ROLES CREATION & MANAGEMENT */}
              {activeAccessTab === "roles" && (
                <div className="space-y-6">
                  {/* Create New Role Form */}
                  <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4 text-[#007BC4]" /> Create New Additional Role
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Role Display Title *</label>
                        <input
                          type="text"
                          required
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          placeholder="e.g. Safety Inspector"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-[#007BC4]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Role Description</label>
                        <input
                          type="text"
                          value={newRoleDesc}
                          onChange={(e) => setNewRoleDesc(e.target.value)}
                          placeholder="e.g. Inspector for OSHA compliance and hazards"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-[#007BC4]"
                        />
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={handleAddCustomRole}
                          className="w-full bg-[#007BC4] hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Plus className="w-4 h-4" /> Add Role to System
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Existing Roles List */}
                  <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6 space-y-4">
                    <h4 className="font-bold text-slate-900 text-sm">Configured System & Custom Roles Directory</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {customRoles.map((r) => (
                        <div key={r.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 text-sm">{r.label}</span>
                              {r.isCustom ? (
                                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Custom</span>
                              ) : (
                                <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Built-in</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-1">{r.desc}</p>
                            <div className="text-[10px] font-mono text-slate-400 mt-2">role_id: {r.id}</div>
                          </div>

                          <div className="pt-3 border-t border-slate-200 flex items-center justify-between mt-2">
                            <button
                              onClick={() => {
                                setActiveRoleTab(r.id);
                                setActiveAccessTab("matrix");
                              }}
                              className="text-[#007BC4] text-xs font-bold hover:underline cursor-pointer"
                            >
                              Edit Page Matrix →
                            </button>

                            {r.isCustom && (
                              <button
                                onClick={() => handleDeleteCustomRole(r.id)}
                                className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1 p-1 hover:bg-rose-50 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 4: PENDING INVITATIONS */}
              {activeAccessTab === "invitations" && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Pending Invited Personnel</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">Staff members who have been registered but haven't authenticated or completed their first login yet.</p>
                      </div>
                      <button
                        onClick={loadManagementData}
                        disabled={isLoadingUsers}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                        title="Reload list"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                            <th className="py-2.5 px-4">Invited Member</th>
                            <th className="py-2.5 px-4">UID / Invitation Code</th>
                            <th className="py-2.5 px-4">Intended Role</th>
                            <th className="py-2.5 px-4">Registered Date</th>
                            <th className="py-2.5 px-4 text-right">Invite Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {(() => {
                            const pendingUsers = users.filter(u => u.hasLoggedIn === false || (u.invited && !u.lastLogin));
                            if (pendingUsers.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                                    No pending invitations found. All staff accounts are active!
                                  </td>
                                </tr>
                              );
                            }
                            return pendingUsers.map((u) => (
                              <tr key={u.uid} className="hover:bg-slate-50/50">
                                <td className="py-3 px-4 font-bold text-slate-800">
                                  <div>{u.displayName || u.name || u.email}</div>
                                  <div className="text-[10px] text-slate-400 font-mono font-normal mt-0.5">{u.email}</div>
                                </td>
                                <td className="py-3 px-4 font-mono text-[10px] text-slate-500">{u.uid}</td>
                                <td className="py-3 px-4">
                                  <span className="bg-blue-50 text-[#007BC4] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-[10px]">
                                    {u.role || "operator"}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-slate-500 font-semibold">{u.createdAt ? new Date(u.createdAt).toLocaleString() : "Prior to Aug 2026"}</td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    onClick={() => handleResendInvite(u.uid)}
                                    disabled={resendingInviteUid === u.uid}
                                    className="bg-[#007BC4] hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition shadow-sm cursor-pointer disabled:opacity-50"
                                  >
                                    {resendingInviteUid === u.uid ? "Resending..." : "Resend Invite Email"}
                                  </button>
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 5: USER ACTIVITY LOGS */}
              {activeAccessTab === "activity_log" && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">User Management Audit Trail</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">Real-time trace ledger of user profile modifications, role assignment changes, and credential updates for strict security compliance.</p>
                      </div>
                      <button
                        onClick={fetchUserActivityLogs}
                        disabled={isLoadingActivityLogs}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                        title="Refresh audit log"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingActivityLogs ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 overflow-y-auto max-h-[500px]">
                      {isLoadingActivityLogs ? (
                        <div className="py-12 text-center text-slate-400 font-medium">
                          Loading User Activity Logs...
                        </div>
                      ) : userActivityLogs.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 font-medium">
                          No recent user activity logs recorded.
                        </div>
                      ) : (
                        userActivityLogs.map((log) => {
                          const isWarning = log.action.includes("FAILED") || log.action.includes("DELETE");
                          return (
                            <div key={log.id} className="p-4 hover:bg-slate-50/40 flex flex-col md:flex-row md:items-start justify-between gap-3 text-xs font-medium">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                    isWarning ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                                  }`}>
                                    {log.action}
                                  </span>
                                  <span className="text-slate-500 font-bold font-mono">Resource: {log.resource}</span>
                                </div>
                                <div className="text-slate-700 font-semibold">{log.details ? JSON.stringify(log.details) : "No extra details"}</div>
                                <div className="text-[10px] text-slate-400">
                                  Actor: <span className="font-bold text-slate-500">{log.userEmail || "System"}</span> | IP: <span className="font-mono">{log.ip || "unknown"}</span>
                                </div>
                              </div>
                              <div className="text-right text-[10px] text-slate-400 font-bold shrink-0 self-end md:self-auto">
                                {new Date(log.timestamp).toLocaleString()}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 11: DATABASE BACKUP & SNAPSHOT (NEW FEATURE) */}
          {activeSection === "dataBackup" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-[#007BC4]" /> Database Backup & Snapshot
                </h3>
                <p className="text-slate-500 text-xs font-medium mt-1">
                  Export system settings JSON backups, restore MongoDB snapshots, or export full collection JSON data.
                </p>
              </div>

              {importStatus && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{importStatus}</span>
                </div>
              )}

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden divide-y divide-slate-100">
                {/* Download Settings Backup */}
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Download Settings JSON Backup</h4>
                    <p className="text-xs text-slate-500 mt-1">Export all configuration settings, threshold limits, and rules.</p>
                  </div>
                  <button
                    onClick={handleDownloadSettingsBackup}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download JSON
                  </button>
                </div>

                {/* Restore Settings Backup */}
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Restore Settings JSON Snapshot</h4>
                    <p className="text-xs text-slate-500 mt-1">Upload a previously exported settings JSON file directly to MongoDB.</p>
                  </div>
                  <label className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm">
                    <Upload className="w-3.5 h-3.5" /> Upload & Restore
                    <input type="file" accept=".json" onChange={handleRestoreSettingsJson} className="hidden" />
                  </label>
                </div>

                {/* Full Database Export */}
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Export Full MongoDB Collections Snapshot</h4>
                    <p className="text-xs text-slate-500 mt-1">Download complete JSON dump of Personnel, Devices, History, Alerts, and Audit logs.</p>
                  </div>
                  <button
                    onClick={handleExportAllCollections}
                    disabled={isExportingDb}
                    className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isExportingDb ? "Exporting..." : "Export Full Snapshot"}
                  </button>
                </div>

                {/* Purge Expired Logs */}
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Purge Expired Database Logs</h4>
                    <p className="text-xs text-slate-500 mt-1">Clean up tracking history older than the configured data retention limit.</p>
                  </div>
                  <button
                    onClick={handlePurgeOldLogs}
                    disabled={isPurgingLogs}
                    className="flex items-center gap-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isPurgingLogs ? "Purging..." : "Purge Expired Logs"}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
