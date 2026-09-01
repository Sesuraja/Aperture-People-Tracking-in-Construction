import React, { useState, useEffect } from "react";
import {
  Building2,
  Briefcase,
  Layers,
  Sparkles,
  Save,
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
  HardHat,
  HeartPulse,
  Pickaxe,
  Factory,
  Package,
  Plane,
  Flame,
  Globe,
  Sliders,
  Check,
  ShieldCheck,
  Bot,
  Tag,
  MapPin,
  Users,
  ChevronRight,
  Info
} from "lucide-react";
import { useTracking, useTerminology } from "../context/TrackingContext";
import { IndustryConfig, INDUSTRY_PRESETS } from "../constants/industryPresets";

const PRESET_ICONS: Record<string, any> = {
  construction: HardHat,
  healthcare: HeartPulse,
  mining: Pickaxe,
  manufacturing: Factory,
  logistics: Package,
  corporate: Building2,
  aviation: Plane,
  oil_gas: Flame,
  custom: Globe
};

const PRESET_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  construction: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30", badge: "bg-amber-500 text-white" },
  healthcare: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/30", badge: "bg-rose-500 text-white" },
  mining: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/30", badge: "bg-orange-500 text-white" },
  manufacturing: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/30", badge: "bg-blue-500 text-white" },
  logistics: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30", badge: "bg-emerald-500 text-white" },
  corporate: { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/30", badge: "bg-indigo-500 text-white" },
  aviation: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", border: "border-sky-500/30", badge: "bg-sky-500 text-white" },
  oil_gas: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/30", badge: "bg-red-500 text-white" },
  custom: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/30", badge: "bg-purple-500 text-white" }
};

export default function IndustryConfigurationSection() {
  const { industryConfig, updateIndustryConfig, applyIndustryPreset, customRoles, saveRoles } = useTracking();
  
  // Local form state cloned from context
  const [formData, setFormData] = useState<IndustryConfig>(industryConfig);
  const [rolesList, setRolesList] = useState<string[]>(customRoles || industryConfig.defaultRoles);
  const [newRoleInput, setNewRoleInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'presets' | 'terminology' | 'roles' | 'ai_compliance'>('presets');

  // Keep form data in sync with context
  useEffect(() => {
    setFormData(industryConfig);
    setRolesList(customRoles || industryConfig.defaultRoles);
  }, [industryConfig, customRoles]);

  const handleApplyPreset = async (presetKey: string) => {
    setIsSaving(true);
    try {
      await applyIndustryPreset(presetKey);
      const preset = INDUSTRY_PRESETS[presetKey];
      setFormData(preset);
      setRolesList(preset.defaultRoles);
      setSaveToast(`Successfully applied "${preset.industryName}" profile & synced to MongoDB!`);
      setTimeout(() => setSaveToast(null), 4000);
    } catch (e: any) {
      alert(`Failed to apply preset: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAllToMongo = async () => {
    setIsSaving(true);
    try {
      const payload: Partial<IndustryConfig> = {
        ...formData,
        defaultRoles: rolesList,
        updatedAt: new Date().toISOString()
      };
      await updateIndustryConfig(payload);
      await saveRoles(rolesList);
      setSaveToast("Industry configuration successfully saved and persisted to MongoDB!");
      setTimeout(() => setSaveToast(null), 4000);
    } catch (e: any) {
      alert(`Error saving to MongoDB: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddRole = () => {
    if (!newRoleInput.trim()) return;
    const trimmed = newRoleInput.trim();
    if (!rolesList.includes(trimmed)) {
      setRolesList([...rolesList, trimmed]);
    }
    setNewRoleInput("");
  };

  const handleRemoveRole = (roleToRemove: string) => {
    setRolesList(rolesList.filter(r => r !== roleToRemove));
  };

  const handleResetRolesToPreset = () => {
    const preset = INDUSTRY_PRESETS[formData.industryId] || INDUSTRY_PRESETS.construction;
    setRolesList(preset.defaultRoles);
  };

  const activePresetInfo = INDUSTRY_PRESETS[formData.industryId] || INDUSTRY_PRESETS.construction;
  const ActiveIcon = PRESET_ICONS[formData.industryId] || Globe;
  const activeColor = PRESET_COLORS[formData.industryId] || PRESET_COLORS.custom;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#007BC4]/10 via-indigo-500/10 to-purple-500/10 border border-[#007BC4]/20 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${activeColor.bg} ${activeColor.text} border ${activeColor.border} shadow-sm`}>
              <ActiveIcon className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-[#007BC4] text-white">
                  Active Industry Domain
                </span>
                {formData.subIndustry && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                    {formData.subIndustry}
                  </span>
                )}
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  MongoDB Synced
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {formData.industryName}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {formData.appSubtitle || "Universal Dynamic Personnel & Asset Tracking Platform"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center">
            <button
              onClick={handleSaveAllToMongo}
              disabled={isSaving}
              className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? "Syncing to MongoDB..." : "Save All to MongoDB"}
            </button>
          </div>
        </div>
      </div>

      {/* Toast Feedback */}
      {saveToast && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{saveToast}</span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 pb-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('presets')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'presets'
              ? 'bg-[#007BC4] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> 1-Click Industry Presets
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('terminology')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'terminology'
              ? 'bg-[#007BC4] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" /> Terminology & Labels
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'roles'
              ? 'bg-[#007BC4] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Roles & Specialties ({rolesList.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ai_compliance')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'ai_compliance'
              ? 'bg-[#007BC4] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Bot className="w-3.5 h-3.5" /> AI Copilot & Safety Standards
        </button>
      </div>

      {/* TAB 1: 1-CLICK INDUSTRY PRESETS */}
      {activeTab === 'presets' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Select Industry Use Case Profile
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click any industry preset below to instantly transform all software terminology, roles, zone names, safety compliance frameworks, and AI copilot intelligence across the entire dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => {
              const IconComp = PRESET_ICONS[key] || Globe;
              const color = PRESET_COLORS[key] || PRESET_COLORS.custom;
              const isActive = formData.industryId === key;

              return (
                <div
                  key={key}
                  className={`relative rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                    isActive
                      ? "bg-white dark:bg-slate-900 border-[#007BC4] ring-2 ring-[#007BC4]/30 shadow-md"
                      : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color.bg} ${color.text} border ${color.border}`}>
                        <IconComp className="w-6 h-6" />
                      </div>
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#007BC4] text-white shadow-sm">
                          <Check className="w-3 h-3 stroke-[3]" /> Active
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          Preset
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {preset.industryName}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {preset.appSubtitle}
                    </p>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px]">
                      {preset.subIndustry && (
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                          <span className="text-slate-400">Sector:</span>
                          <span className="font-semibold text-[#007BC4] truncate max-w-[130px]" title={preset.subIndustry}>
                            {preset.subIndustry}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="text-slate-400">Personnel:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {preset.terminology.personnelPlural}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="text-slate-400">ID Tag:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {preset.terminology.idBadgeLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="text-slate-400">Standard:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[130px]" title={preset.complianceFramework}>
                          {preset.complianceFramework}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3">
                    <button
                      type="button"
                      disabled={isSaving || isActive}
                      onClick={() => handleApplyPreset(key)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        isActive
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-default"
                          : "bg-slate-900 hover:bg-[#007BC4] text-white shadow-sm"
                      }`}
                    >
                      {isActive ? (
                        <>Current Active Profile</>
                      ) : (
                        <>Apply Profile & Sync</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: TERMINOLOGY & LABELS */}
      {activeTab === 'terminology' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Dynamic Terminology & System Branding
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Customize how people, roles, badges, zones, and facilities are labeled across every page of the application.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#007BC4] border-b border-slate-100 dark:border-slate-800 pb-2">
              1. Application Branding & Facility
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Software Title / Brand Name
                </label>
                <input
                  type="text"
                  value={formData.appTitle || ""}
                  onChange={(e) => setFormData({ ...formData, appTitle: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Aperture People Tracking"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Software Subtitle / Tagline
                </label>
                <input
                  type="text"
                  value={formData.appSubtitle || ""}
                  onChange={(e) => setFormData({ ...formData, appSubtitle: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Real-Time Telemetry & Safety Platform"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Primary Site / Facility Name
                </label>
                <input
                  type="text"
                  value={formData.primarySiteName || ""}
                  onChange={(e) => setFormData({ ...formData, primarySiteName: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Metro Hospital Campus"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Sub-Industry / Sub-Sector
                </label>
                <input
                  type="text"
                  value={formData.subIndustry || ""}
                  onChange={(e) => setFormData({ ...formData, subIndustry: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. High-Rise Construction, ICU, Deep Pit"
                />
              </div>
            </div>

            <h4 className="text-xs font-bold uppercase tracking-wider text-[#007BC4] border-b border-slate-100 dark:border-slate-800 pb-2 pt-2">
              2. Personnel & Workforce Terminology
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Personnel Singular Term
                </label>
                <input
                  type="text"
                  value={formData.terminology.personnelSingular || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    terminology: { ...formData.terminology, personnelSingular: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Worker, Employee, Doctor, Miner, Operator"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Used on individual profile cards, scan popups, and badges (e.g. "Add New {formData.terminology.personnelSingular || 'Worker'}")
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Personnel Plural Term
                </label>
                <input
                  type="text"
                  value={formData.terminology.personnelPlural || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    terminology: { ...formData.terminology, personnelPlural: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Workers, Employees, Clinical Staff, Miners"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Used on dashboard metrics, attendance lists, and headers (e.g. "Active {formData.terminology.personnelPlural || 'Workers'}")
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Role / Specialty Label
                </label>
                <input
                  type="text"
                  value={formData.terminology.roleLabel || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    terminology: { ...formData.terminology, roleLabel: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Trade / Specialty, Department, Duty"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ID Badge / Transponder Label
                </label>
                <input
                  type="text"
                  value={formData.terminology.idBadgeLabel || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    terminology: { ...formData.terminology, idBadgeLabel: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Hardhat Tag ID, RFID Badge, Wristband"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Safety / Compliance Label
                </label>
                <input
                  type="text"
                  value={formData.terminology.safetyComplianceLabel || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    terminology: { ...formData.terminology, safetyComplianceLabel: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. PPE Compliance, Sanitization Status, Gas Badge"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Zone / Area Label
                </label>
                <input
                  type="text"
                  value={formData.terminology.zoneLabel || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    terminology: { ...formData.terminology, zoneLabel: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Work Zone, Ward, Shaft, Aisle"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Site / Facility Label
                </label>
                <input
                  type="text"
                  value={formData.terminology.siteLabel || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    terminology: { ...formData.terminology, siteLabel: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Job Site, Hospital, Mine, Facility"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Employer / Subcontractor Label
                </label>
                <input
                  type="text"
                  value={formData.terminology.organizationType || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    terminology: { ...formData.terminology, organizationType: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                  placeholder="e.g. Subcontractor, Department, Division"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSaveAllToMongo}
                disabled={isSaving}
                className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save Terminology to MongoDB"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ROLES & SPECIALTIES */}
      {activeTab === 'roles' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Industry Roles, Trades & Specialties
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage the active list of workforce roles and trade specialties available when registering personnel and filtering dashboards.
              </p>
            </div>

            <button
              type="button"
              onClick={handleResetRolesToPreset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset to Preset Defaults
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            {/* Add Role Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newRoleInput}
                onChange={(e) => setNewRoleInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                placeholder={`Type new ${formData.terminology.roleLabel || 'Role'} name (e.g. Lead Surgeon, Electrician, Continuous Miner)`}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
              />
              <button
                type="button"
                onClick={handleAddRole}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-[#007BC4] hover:bg-blue-700 rounded-xl shadow-sm transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add {formData.terminology.roleLabel || 'Role'}
              </button>
            </div>

            {/* Roles Chips Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
              {rolesList.map((role, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 group hover:border-[#007BC4]/50 transition"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#007BC4]" />
                    <span className="truncate">{role}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveRole(role)}
                    className="text-slate-400 hover:text-rose-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove Role"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSaveAllToMongo}
                disabled={isSaving}
                className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving..." : `Save ${rolesList.length} Roles to MongoDB`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AI COPILOT & SAFETY STANDARDS */}
      {activeTab === 'ai_compliance' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              AI Copilot Persona & Compliance Standards
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Customize the AI safety engine's system instructions and regulatory compliance framework to match your industry requirements.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Primary Regulatory & Compliance Standard
              </label>
              <input
                type="text"
                value={formData.complianceFramework || ""}
                onChange={(e) => setFormData({ ...formData, complianceFramework: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                placeholder="e.g. OSHA 1926, HIPAA / JCAHO, MSHA 30 CFR, ISO 45001"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Referenced in incident audits, AI compliance scores, and exportable regulatory filings.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                <span>AI Copilot & Incident RCA System Prompt</span>
                <span className="text-[10px] text-[#007BC4] font-mono">Gemini 3.7 Flash Engine</span>
              </label>
              <textarea
                rows={4}
                value={formData.aiPersonaPrompt || ""}
                onChange={(e) => setFormData({ ...formData, aiPersonaPrompt: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-[#007BC4] outline-none"
                placeholder="Instruct the AI model on how to evaluate telemetry scans, dwell times, and safety risks..."
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                The AI will use this prompt when generating executive safety summaries, root cause analyses, and natural language copilot responses.
              </span>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSaveAllToMongo}
                disabled={isSaving}
                className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save AI Instructions to MongoDB"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
