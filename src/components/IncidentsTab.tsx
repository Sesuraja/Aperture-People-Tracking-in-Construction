import React, { useState, useEffect, useMemo } from 'react';
import { 
  EnterpriseIncident, IncidentCategory, IncidentWorkflowStatus, 
  WitnessStatement, IncidentAttachment, IncidentTimelineEvent 
} from '../types';
import { 
  ShieldAlert, AlertTriangle, CheckCircle2, Clock, Paperclip, 
  Plus, Printer, Search, Flame, Stethoscope, 
  Shield, Zap, Wrench, Droplet, AlertOctagon, Activity, Sparkles, 
  ArrowRight, CheckSquare, MessageSquare, UserPlus, X, 
  HardHat, FileSpreadsheet, RefreshCw, Trash2, Edit3, Database,
  ArrowLeft, Upload, FileText, Lock
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDocs, isMongoActive, db } from '../lib/db';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';

const INCIDENT_CATEGORIES: { name: IncidentCategory; icon: React.ElementType; color: string; bg: string }[] = [
  { name: 'Near Miss', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  { name: 'Injury', icon: Stethoscope, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950/40' },
  { name: 'Equipment Damage', icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  { name: 'Fire', icon: Flame, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
  { name: 'Medical', icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { name: 'Security', icon: Shield, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
  { name: 'Chemical', icon: Droplet, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
  { name: 'Electrical', icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950/40' },
  { name: 'Environmental', icon: AlertOctagon, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-950/40' }
];

const WORKFLOW_STAGES: IncidentWorkflowStatus[] = [
  'Open', 'Assigned', 'Investigation', 'Root Cause', 'Corrective Action', 'Approval', 'Closed'
];

function formatIncidentTimestamp(ts: any): string {
  if (!ts) return '';
  if (typeof ts === 'string') return ts;
  if (ts instanceof Date) {
    return ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof ts.seconds === 'number') {
    return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  try {
    return String(ts);
  } catch {
    return '';
  }
}

export default function IncidentsTab() {
  const [incidents, setIncidents] = useState<EnterpriseIncident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<EnterpriseIncident | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mongoStatus, setMongoStatus] = useState({ connected: true, latencyMs: 24, databaseName: 'Lat-Aperture-People-Tracking' });

  useEffect(() => {
    const checkMongo = async () => {
      try {
        const start = performance.now();
        const res = await fetch('/api/mongodb/status');
        const latency = Math.round(performance.now() - start);
        if (res.ok) {
          const data = await res.json();
          setMongoStatus({
            connected: data.connected ?? true,
            latencyMs: latency,
            databaseName: data.databaseName || 'Lat-Aperture-People-Tracking'
          });
        }
      } catch {}
    };
    checkMongo();
    const interval = setInterval(checkMongo, 8000);
    return () => clearInterval(interval);
  }, []);

  // Filters & Sorting
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory | 'All'>('All');
  const [selectedStatus, setSelectedStatus] = useState<IncidentWorkflowStatus | 'All'>('All');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<'All' | 'Critical' | 'High' | 'Medium' | 'Low'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'severity' | 'threat'>('newest');

  // Modals & Sub-Tabs
  const [isNewIncidentOpen, setIsNewIncidentOpen] = useState(false);
  const [isEditIncidentOpen, setIsEditIncidentOpen] = useState(false);
  const [isAddWitnessOpen, setIsAddWitnessOpen] = useState(false);
  const [isAddCapaOpen, setIsAddCapaOpen] = useState(false);
  const [isAddAttachmentOpen, setIsAddAttachmentOpen] = useState(false);
  const [isAddTimelineOpen, setIsAddTimelineOpen] = useState(false);
  const [isSignOffOpen, setIsSignOffOpen] = useState(false);
  const [isEditRcaOpen, setIsEditRcaOpen] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<IncidentAttachment | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);

  const [activeDetailTab, setActiveDetailTab] = useState<'ai_analysis' | 'workflow' | 'capa' | 'witnesses' | 'attachments' | 'timeline'>('ai_analysis');

  // Notification Toast
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Forms State
  const [newForm, setNewForm] = useState<{
    title: string;
    category: IncidentCategory;
    severity: 'Critical' | 'High' | 'Medium' | 'Low';
    locationZone: string;
    reportedBy: string;
    assignedOfficer: string;
    equipmentInvolved: string;
    hazardClass: string;
    injuredPersonnelCount: number;
    description: string;
  }>({
    title: '',
    category: 'Near Miss',
    severity: 'High',
    locationZone: 'Main Gate 1',
    reportedBy: 'Field Safety Officer',
    assignedOfficer: 'Marcus Vance (EHS Director)',
    equipmentInvolved: '',
    hazardClass: '',
    injuredPersonnelCount: 0,
    description: ''
  });

  const [editForm, setEditForm] = useState<any>({});

  const [newWitness, setNewWitness] = useState({
    witnessName: '',
    witnessRole: '',
    company: 'BuildCorp Partner',
    interviewedBy: 'Marcus Vance',
    statement: ''
  });

  const [newCapa, setNewCapa] = useState({
    actionItem: '',
    assignedTo: 'Site Safety Team',
    dueDate: new Date().toISOString().split('T')[0]
  });

  const [newAttachment, setNewAttachment] = useState({
    fileName: '',
    fileType: 'Photo' as const,
    fileUrl: '',
    fileSize: '1.2 MB',
    uploadedBy: 'EHS Inspector'
  });

  const [newTimelineEvent, setNewTimelineEvent] = useState({
    title: '',
    description: '',
    actor: 'EHS Field Officer'
  });

  const [signOffForm, setSignOffForm] = useState({
    approvedBy: 'David Miller (Site Operations VP)',
    comments: 'Comprehensive RCA and CAPA items verified. Incident formally approved and signed off.'
  });

  const [rcaForm, setRcaForm] = useState({
    probableRootCause: '',
    regulatoryImpact: '',
    contributingFactorText: ''
  });

  const normalizeIncident = (d: any, id: string): EnterpriseIncident => ({
    ...d,
    id,
    title: d.title || 'Untitled Incident',
    category: d.category || 'Near Miss',
    severity: d.severity || 'Medium',
    workflowStatus: d.workflowStatus || 'Open',
    locationZone: d.locationZone || 'Excavation Pit',
    reportedBy: d.reportedBy || 'Safety Officer',
    assignedOfficer: d.assignedOfficer || 'Marcus Vance (EHS Director)',
    reportedAt: d.reportedAt || new Date().toISOString(),
    description: d.description || '',
    correctiveActions: Array.isArray(d.correctiveActions) ? d.correctiveActions : [],
    witnessStatements: Array.isArray(d.witnessStatements) ? d.witnessStatements : [],
    attachments: Array.isArray(d.attachments) ? d.attachments : [],
    timeline: Array.isArray(d.timeline) ? d.timeline : [],
    aiAnalysis: d.aiAnalysis ? {
      aiSummary: d.aiAnalysis.aiSummary || 'Automated AI Root Cause Assessment completed.',
      probableRootCause: d.aiAnalysis.probableRootCause || 'Under review',
      contributingFactors: Array.isArray(d.aiAnalysis.contributingFactors) ? d.aiAnalysis.contributingFactors : [],
      capaRecommendations: Array.isArray(d.aiAnalysis.capaRecommendations) ? d.aiAnalysis.capaRecommendations : [],
      severityScore: d.aiAnalysis.severityScore || 65,
      regulatoryImpact: d.aiAnalysis.regulatoryImpact || 'OSHA 1926 Standard Review Recommended'
    } : undefined
  });

  // Sync with MongoDB / Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'incidents_enterprise'), (snapshot) => {
      const data = snapshot.docs.map(docSnap => normalizeIncident(docSnap.data(), docSnap.id));

      setIncidents(data);
      if (data.length > 0) {
        setSelectedIncident(prev => {
          if (!prev) return data[0];
          const updated = data.find(i => i.id === prev.id);
          return updated || data[0];
        });
      }
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const snap = await getDocs(collection(db, 'incidents_enterprise'));
      const data = snap.docs.map(docSnap => normalizeIncident(docSnap.data(), docSnap.id));
      setIncidents(data);
      if (data.length > 0) {
        if (!selectedIncident) setSelectedIncident(data[0]);
        else {
          const matched = data.find(i => i.id === selectedIncident.id);
          if (matched) setSelectedIncident(matched);
        }
      }
      setNotification({ type: 'success', text: 'Incidents synchronized directly with MongoDB.' });
    } catch (err) {
      console.error('Manual refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filtered and Sorted Incidents Roster
  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      const matchesCategory = selectedCategory === 'All' || inc.category === selectedCategory;
      const matchesStatus = selectedStatus === 'All' || inc.workflowStatus === selectedStatus;
      const matchesSeverity = selectedSeverityFilter === 'All' || inc.severity === selectedSeverityFilter;
      
      const searchLower = (searchTerm || "").toLowerCase();
      const matchesSearch = !searchTerm ||
        (inc.id || "").toLowerCase().includes(searchLower) ||
        (inc.title || "").toLowerCase().includes(searchLower) ||
        (inc.locationZone || "").toLowerCase().includes(searchLower) ||
        (inc.assignedOfficer || "").toLowerCase().includes(searchLower) ||
        (inc.description || "").toLowerCase().includes(searchLower) ||
        (inc.equipmentInvolved && (inc.equipmentInvolved || "").toLowerCase().includes(searchLower));

      return matchesCategory && matchesStatus && matchesSeverity && matchesSearch;
    }).sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime();
      }
      if (sortBy === 'severity') {
        const orderMap = { Critical: 4, High: 3, Medium: 2, Low: 1 };
        return (orderMap[b.severity] || 0) - (orderMap[a.severity] || 0);
      }
      if (sortBy === 'threat') {
        return (b.aiAnalysis?.severityScore || 0) - (a.aiAnalysis?.severityScore || 0);
      }
      return 0;
    });
  }, [incidents, selectedCategory, selectedStatus, selectedSeverityFilter, searchTerm, sortBy]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = incidents.length;
    const openCount = incidents.filter(i => i.workflowStatus === 'Open' || i.workflowStatus === 'Assigned' || i.workflowStatus === 'Investigation').length;
    const highRisk = incidents.filter(i => (i.severity === 'Critical' || i.severity === 'High') && i.workflowStatus !== 'Closed').length;
    const capaPending = incidents.reduce((acc, curr) => acc + (curr.correctiveActions?.filter(c => !c.isCompleted).length || 0), 0);
    const closedCount = incidents.filter(i => i.workflowStatus === 'Closed').length;

    return { total, openCount, highRisk, capaPending, closedCount };
  }, [incidents]);

  // 1. Create New Incident Submit (MongoDB Persisted)
  const handleCreateIncidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.title || !newForm.description) return;

    const incId = `INC-2026-${Math.floor(Math.random() * 899) + 100}`;
    const nowStr = new Date().toISOString();

    const initialAiScore = newForm.severity === 'Critical' ? 92 : newForm.severity === 'High' ? 78 : newForm.severity === 'Medium' ? 50 : 25;

    const newRecord: EnterpriseIncident = {
      id: incId,
      title: newForm.title,
      category: newForm.category,
      severity: newForm.severity,
      workflowStatus: 'Open',
      locationZone: newForm.locationZone,
      reportedAt: nowStr,
      reportedBy: newForm.reportedBy,
      assignedOfficer: newForm.assignedOfficer,
      assignedRole: 'Field EHS Specialist',
      description: newForm.description,
      equipmentInvolved: newForm.equipmentInvolved || undefined,
      hazardClass: newForm.hazardClass || undefined,
      injuredPersonnelCount: newForm.injuredPersonnelCount || 0,
      aiAnalysis: {
        severityScore: initialAiScore,
        aiSummary: `Initial automated EHS incident analysis logged for ${newForm.category} at ${newForm.locationZone}.`,
        probableRootCause: `Pending formal field investigation by ${newForm.assignedOfficer}.`,
        contributingFactors: [
          'Environmental or operational hazard reported in field.',
          'Initial notification captured via Enterprise Incident Center.'
        ],
        capaRecommendations: [
          'Secure immediate hazard perimeter at location zone.',
          'Assign field investigator to conduct witness interviews.',
          'Log formal root cause analysis within 24 hours.'
        ],
        regulatoryImpact: 'Internal EHS Incident Protocol Level 1 - Mandatory Notification Dispatched.'
      },
      witnessStatements: [],
      attachments: [],
      timeline: [
        { id: `t_${Date.now()}`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), title: 'Incident Created', description: newForm.description, actor: newForm.reportedBy, statusChange: 'Open' }
      ],
      correctiveActions: [
        { id: `ca_${Date.now()}`, actionItem: 'Perform preliminary safety perimeter isolation', assignedTo: newForm.assignedOfficer, dueDate: new Date().toISOString().split('T')[0], isCompleted: false }
      ]
    };

    try {
      await setDoc(doc(db, 'incidents_enterprise', incId), newRecord);
      setSelectedIncident(newRecord);
      setIsNewIncidentOpen(false);
      setNotification({ type: 'success', text: `Incident ${incId} saved to MongoDB and dispatched!` });
      setNewForm({
        title: '',
        category: 'Near Miss',
        severity: 'High',
        locationZone: 'Main Gate 1',
        reportedBy: 'Field Safety Officer',
        assignedOfficer: 'Marcus Vance (EHS Director)',
        equipmentInvolved: '',
        hazardClass: '',
        injuredPersonnelCount: 0,
        description: ''
      });
    } catch (err) {
      console.error('Error creating incident in MongoDB:', err);
      setNotification({ type: 'error', text: 'Failed to create incident in MongoDB database.' });
    }
  };

  // 2. Edit Incident Details Submit (MongoDB Persisted)
  const openEditIncident = () => {
    if (!selectedIncident) return;
    setEditForm({
      title: selectedIncident.title,
      category: selectedIncident.category,
      severity: selectedIncident.severity,
      locationZone: selectedIncident.locationZone,
      assignedOfficer: selectedIncident.assignedOfficer,
      equipmentInvolved: selectedIncident.equipmentInvolved || '',
      hazardClass: selectedIncident.hazardClass || '',
      injuredPersonnelCount: selectedIncident.injuredPersonnelCount || 0,
      description: selectedIncident.description
    });
    setIsEditIncidentOpen(true);
  };

  const handleEditIncidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;

    const updated = {
      ...selectedIncident,
      title: editForm.title,
      category: editForm.category,
      severity: editForm.severity,
      locationZone: editForm.locationZone,
      assignedOfficer: editForm.assignedOfficer,
      equipmentInvolved: editForm.equipmentInvolved,
      hazardClass: editForm.hazardClass,
      injuredPersonnelCount: Number(editForm.injuredPersonnelCount) || 0,
      description: editForm.description
    };

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), updated);
      setSelectedIncident(updated);
      setIsEditIncidentOpen(false);
      setNotification({ type: 'success', text: `Incident ${selectedIncident.id} details updated in MongoDB.` });
    } catch (err) {
      console.error('Error updating incident:', err);
    }
  };

  // 3. Delete Incident (MongoDB Persisted)
  const handleDeleteIncident = async () => {
    if (!selectedIncident) return;
    if (!window.confirm(`Are you sure you want to permanently delete incident ${selectedIncident.id} from MongoDB?`)) return;

    try {
      await deleteDoc(doc(db, 'incidents_enterprise', selectedIncident.id));
      setNotification({ type: 'info', text: `Incident ${selectedIncident.id} deleted from MongoDB.` });
      setSelectedIncident(null);
    } catch (err) {
      console.error('Error deleting incident:', err);
    }
  };

  // 4. Advance or Jump Workflow Stage (MongoDB Persisted)
  const handleSetWorkflowStage = async (nextStatus: IncidentWorkflowStatus) => {
    if (!selectedIncident) return;

    const nowTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const updatedTimeline: IncidentTimelineEvent[] = [
      ...(selectedIncident.timeline || []),
      {
        id: `t_${Date.now()}`,
        timestamp: nowTimeStr,
        title: `Stage Changed to ${nextStatus}`,
        description: `Workflow stage updated from ${selectedIncident.workflowStatus} to ${nextStatus}.`,
        actor: 'EHS Control Lead',
        statusChange: nextStatus
      }
    ];

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        workflowStatus: nextStatus,
        timeline: updatedTimeline
      });

      setSelectedIncident({
        ...selectedIncident,
        workflowStatus: nextStatus,
        timeline: updatedTimeline
      });

      setNotification({ type: 'success', text: `Incident ${selectedIncident.id} advanced to: ${nextStatus}` });
    } catch (err) {
      console.error('Error advancing workflow stage:', err);
    }
  };

  // 5. Trigger Server-Side AI Re-Analyze for Incident RCA
  const handleReanalyzeWithAi = async () => {
    if (!selectedIncident) return;
    setIsAnalyzingAi(true);

    try {
      const res = await fetch('/api/analyze-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedIncident.title,
          category: selectedIncident.category,
          severity: selectedIncident.severity,
          locationZone: selectedIncident.locationZone,
          equipmentInvolved: selectedIncident.equipmentInvolved,
          description: selectedIncident.description
        })
      });

      const aiData = await res.json();

      const updatedAiAnalysis = {
        severityScore: aiData.severityScore || selectedIncident.aiAnalysis?.severityScore || 75,
        aiSummary: aiData.aiSummary || selectedIncident.aiAnalysis?.aiSummary || 'Analysis complete.',
        probableRootCause: aiData.probableRootCause || selectedIncident.aiAnalysis?.probableRootCause || 'Under review.',
        contributingFactors: aiData.contributingFactors || selectedIncident.aiAnalysis?.contributingFactors || [],
        capaRecommendations: aiData.capaRecommendations || selectedIncident.aiAnalysis?.capaRecommendations || [],
        regulatoryImpact: aiData.regulatoryImpact || selectedIncident.aiAnalysis?.regulatoryImpact || 'OSHA Protocol'
      };

      const updatedTimeline = [
        ...(selectedIncident.timeline || []),
        {
          id: `t_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          title: 'AI RCA Re-Analyzed',
          description: 'Gemini AI generated fresh Root Cause Analysis and CAPA recommendations.',
          actor: 'EHS AI Engine'
        }
      ];

      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        aiAnalysis: updatedAiAnalysis,
        timeline: updatedTimeline
      });

      setSelectedIncident({
        ...selectedIncident,
        aiAnalysis: updatedAiAnalysis,
        timeline: updatedTimeline
      });

      setNotification({ type: 'success', text: 'AI Root Cause Analysis updated via Gemini Model!' });
    } catch (err) {
      console.error('AI Re-analyze error:', err);
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // 6. Edit Manual RCA Details
  const openEditRca = () => {
    if (!selectedIncident) return;
    setRcaForm({
      probableRootCause: selectedIncident.aiAnalysis?.probableRootCause || '',
      regulatoryImpact: selectedIncident.aiAnalysis?.regulatoryImpact || '',
      contributingFactorText: (selectedIncident.aiAnalysis?.contributingFactors || []).join('\n')
    });
    setIsEditRcaOpen(true);
  };

  const handleSaveRca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;

    const updatedFactors = rcaForm.contributingFactorText.split('\n').filter(Boolean);

    const updatedAnalysis = {
      ...(selectedIncident.aiAnalysis || {
        severityScore: 70,
        aiSummary: 'Manual RCA updated by EHS Lead.',
        capaRecommendations: []
      }),
      probableRootCause: rcaForm.probableRootCause,
      regulatoryImpact: rcaForm.regulatoryImpact,
      contributingFactors: updatedFactors
    };

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        aiAnalysis: updatedAnalysis
      });
      setSelectedIncident({
        ...selectedIncident,
        aiAnalysis: updatedAnalysis
      });
      setIsEditRcaOpen(false);
      setNotification({ type: 'success', text: 'Root Cause Analysis details saved to MongoDB.' });
    } catch (err) {
      console.error('Error saving RCA:', err);
    }
  };

  // 7. CAPA Items CRUD
  const handleToggleCapa = async (actionId: string) => {
    if (!selectedIncident) return;
    const currentCapas = selectedIncident.correctiveActions || [];

    const updatedCapas = currentCapas.map(ca => 
      ca.id === actionId ? { ...ca, isCompleted: !ca.isCompleted } : ca
    );

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        correctiveActions: updatedCapas
      });

      setSelectedIncident({
        ...selectedIncident,
        correctiveActions: updatedCapas
      });
      setNotification({ type: 'info', text: 'CAPA action item status updated.' });
    } catch (err) {
      console.error('Error toggling CAPA item:', err);
    }
  };

  const handleAddCapaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !newCapa.actionItem) return;

    const newCapItem = {
      id: `ca_${Date.now()}`,
      actionItem: newCapa.actionItem,
      assignedTo: newCapa.assignedTo,
      dueDate: newCapa.dueDate,
      isCompleted: false
    };

    const updatedCapas = [...(selectedIncident.correctiveActions || []), newCapItem];

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        correctiveActions: updatedCapas
      });

      setSelectedIncident({
        ...selectedIncident,
        correctiveActions: updatedCapas
      });

      setIsAddCapaOpen(false);
      setNewCapa({ actionItem: '', assignedTo: 'Site Safety Team', dueDate: new Date().toISOString().split('T')[0] });
      setNotification({ type: 'success', text: 'New CAPA action item created in MongoDB.' });
    } catch (err) {
      console.error('Error adding CAPA item:', err);
    }
  };

  const handleDeleteCapa = async (actionId: string) => {
    if (!selectedIncident || !selectedIncident.correctiveActions) return;
    const updatedCapas = selectedIncident.correctiveActions.filter(c => c.id !== actionId);

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        correctiveActions: updatedCapas
      });
      setSelectedIncident({ ...selectedIncident, correctiveActions: updatedCapas });
      setNotification({ type: 'info', text: 'CAPA item removed.' });
    } catch (err) {
      console.error('Error deleting CAPA:', err);
    }
  };

  // 8. Witness Statements CRUD
  const handleAddWitnessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !newWitness.witnessName || !newWitness.statement) return;

    const newStmt: WitnessStatement = {
      id: `ws_${Date.now()}`,
      witnessName: newWitness.witnessName,
      witnessRole: newWitness.witnessRole || 'Site Worker',
      company: newWitness.company,
      interviewedBy: newWitness.interviewedBy,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      statement: newWitness.statement
    };

    const updatedStatements = [...(selectedIncident.witnessStatements || []), newStmt];

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        witnessStatements: updatedStatements
      });

      setSelectedIncident({
        ...selectedIncident,
        witnessStatements: updatedStatements
      });

      setIsAddWitnessOpen(false);
      setNewWitness({ witnessName: '', witnessRole: '', company: 'BuildCorp Partner', interviewedBy: 'Marcus Vance', statement: '' });
      setNotification({ type: 'success', text: 'Witness statement recorded in MongoDB.' });
    } catch (err) {
      console.error('Error adding witness statement:', err);
    }
  };

  const handleDeleteWitness = async (witnessId: string) => {
    if (!selectedIncident || !selectedIncident.witnessStatements) return;
    const updatedStatements = selectedIncident.witnessStatements.filter(w => w.id !== witnessId);

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        witnessStatements: updatedStatements
      });
      setSelectedIncident({ ...selectedIncident, witnessStatements: updatedStatements });
      setNotification({ type: 'info', text: 'Witness statement removed.' });
    } catch (err) {
      console.error('Error deleting witness statement:', err);
    }
  };

  // 9. Attachments CRUD
  const handleAddAttachmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !newAttachment.fileName) return;

    const newAtt: IncidentAttachment = {
      id: `att_${Date.now()}`,
      fileName: newAttachment.fileName,
      fileType: newAttachment.fileType,
      fileUrl: newAttachment.fileUrl || 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b7?w=600&auto=format&fit=crop&q=80',
      fileSize: newAttachment.fileSize,
      uploadedBy: newAttachment.uploadedBy,
      uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedAttachments = [...(selectedIncident.attachments || []), newAtt];

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        attachments: updatedAttachments
      });

      setSelectedIncident({
        ...selectedIncident,
        attachments: updatedAttachments
      });

      setIsAddAttachmentOpen(false);
      setNewAttachment({ fileName: '', fileType: 'Photo', fileUrl: '', fileSize: '1.2 MB', uploadedBy: 'EHS Inspector' });
      setNotification({ type: 'success', text: 'Evidence attachment uploaded to incident file.' });
    } catch (err) {
      console.error('Error adding attachment:', err);
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    if (!selectedIncident || !selectedIncident.attachments) return;
    const updatedAttachments = selectedIncident.attachments.filter(a => a.id !== attId);

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        attachments: updatedAttachments
      });
      setSelectedIncident({ ...selectedIncident, attachments: updatedAttachments });
      setNotification({ type: 'info', text: 'Evidence attachment removed.' });
    } catch (err) {
      console.error('Error deleting attachment:', err);
    }
  };

  // 10. Timeline Note Addition
  const handleAddTimelineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !newTimelineEvent.title) return;

    const newEvt: IncidentTimelineEvent = {
      id: `t_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: newTimelineEvent.title,
      description: newTimelineEvent.description,
      actor: newTimelineEvent.actor
    };

    const updatedTimeline = [...(selectedIncident.timeline || []), newEvt];

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        timeline: updatedTimeline
      });

      setSelectedIncident({
        ...selectedIncident,
        timeline: updatedTimeline
      });

      setIsAddTimelineOpen(false);
      setNewTimelineEvent({ title: '', description: '', actor: 'EHS Field Officer' });
      setNotification({ type: 'success', text: 'Timeline event recorded.' });
    } catch (err) {
      console.error('Error adding timeline event:', err);
    }
  };

  // 11. Executive Approval & Sign-Off Submit
  const handleSignOffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;

    const signOffData = {
      approvedBy: signOffForm.approvedBy,
      approvedAt: new Date().toISOString(),
      comments: signOffForm.comments
    };

    const updatedTimeline = [
      ...(selectedIncident.timeline || []),
      {
        id: `t_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: 'Executive Sign-Off Completed',
        description: `Approved by ${signOffForm.approvedBy}: "${signOffForm.comments}"`,
        actor: signOffForm.approvedBy,
        statusChange: 'Closed' as IncidentWorkflowStatus
      }
    ];

    try {
      await updateDoc(doc(db, 'incidents_enterprise', selectedIncident.id), {
        workflowStatus: 'Closed',
        approvalSignOff: signOffData,
        timeline: updatedTimeline
      });

      setSelectedIncident({
        ...selectedIncident,
        workflowStatus: 'Closed',
        approvalSignOff: signOffData,
        timeline: updatedTimeline
      });

      setIsSignOffOpen(false);
      setNotification({ type: 'success', text: `Incident ${selectedIncident.id} formally signed off and closed.` });
    } catch (err) {
      console.error('Error completing sign off:', err);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const data = filteredIncidents.map(i => ({
      IncidentID: i.id,
      Title: i.title,
      Category: i.category,
      Severity: i.severity,
      WorkflowStatus: i.workflowStatus,
      Location: i.locationZone,
      ReportedBy: i.reportedBy,
      AssignedOfficer: i.assignedOfficer,
      Equipment: i.equipmentInvolved || 'N/A',
      InjuredCount: i.injuredPersonnelCount || 0,
      SeverityScore: i.aiAnalysis?.severityScore || 50,
      CapasPending: i.correctiveActions?.filter(c => !c.isCompleted).length || 0
    }));

    exportToCSV('Enterprise_Incidents_Log', data, [
      { key: 'IncidentID', label: 'INCIDENT ID' },
      { key: 'Title', label: 'TITLE' },
      { key: 'Category', label: 'CATEGORY' },
      { key: 'Severity', label: 'SEVERITY' },
      { key: 'WorkflowStatus', label: 'WORKFLOW STAGE' },
      { key: 'Location', label: 'ZONE LOCATION' },
      { key: 'ReportedBy', label: 'REPORTED BY' },
      { key: 'AssignedOfficer', label: 'ASSIGNED OFFICER' },
      { key: 'Equipment', label: 'EQUIPMENT' },
      { key: 'InjuredCount', label: 'INJURED COUNT' },
      { key: 'SeverityScore', label: 'AI THREAT SCORE' },
      { key: 'CapasPending', label: 'PENDING CAPAS' }
    ]);
  };

  // Export PDF
  const handleExportPDF = () => {
    const rows = filteredIncidents.map(i => ({
      id: i.id,
      cat: i.category,
      title: i.title,
      sev: i.severity,
      status: i.workflowStatus,
      zone: i.locationZone,
      officer: i.assignedOfficer
    }));

    generatePDFReport(
      'Aperture Enterprise Incident & CAPA Audit Report',
      'Official EHS Command Center Investigation Record',
      [
        { key: 'id', label: 'Incident ID' },
        { key: 'cat', label: 'Category' },
        { key: 'title', label: 'Incident Description' },
        { key: 'sev', label: 'Severity' },
        { key: 'status', label: 'Workflow Stage' },
        { key: 'zone', label: 'Zone' },
        { key: 'officer', label: 'Assigned Lead' }
      ],
      rows,
      [
        { label: 'Total Incidents Logged', value: metrics.total },
        { label: 'Active Open / Investigation', value: metrics.openCount },
        { label: 'High/Critical Severity Hazards', value: metrics.highRisk },
        { label: 'Pending CAPA Items', value: metrics.capaPending },
        { label: 'Closed / Signed Off', value: metrics.closedCount }
      ]
    );
  };

  return (
    <div className="w-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-7 h-7 text-[#007BC4]" />
              Enterprise Incident Center
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#007BC4]/10 text-[#007BC4] border border-[#007BC4]/20">
              EHS Command Live
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs ${
              mongoStatus.connected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
            }`}>
              <Database size={13} className={mongoStatus.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'} />
              <span>MongoDB Atlas: {mongoStatus.databaseName} ({mongoStatus.connected ? `Connected • ${mongoStatus.latencyMs}ms` : 'Offline'})</span>
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm mt-0.5">
            Full incident lifecycle management: near misses, injuries, fires, witness statements, RCA, CAPA actions, and MongoDB Atlas persistence.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 transition flex items-center gap-1.5 text-xs font-bold"
            title="Refresh from MongoDB"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-[#007BC4]' : ''} />
            <span className="hidden sm:inline">Sync DB</span>
          </button>

          <button
            onClick={() => setIsNewIncidentOpen(true)}
            className="px-4 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2"
          >
            <Plus size={15} /> Log New Incident
          </button>

          <button
            onClick={handleExportCSV}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 transition"
            title="Export CSV Log"
          >
            <FileSpreadsheet size={15} />
          </button>

          <button
            onClick={handleExportPDF}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 transition"
            title="Export Official PDF Report"
          >
            <Printer size={15} />
          </button>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {notification && (
        <div className={`p-3.5 border rounded-xl text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in ${
          notification.type === 'success' ? 'bg-emerald-50 dark:bg-slate-800 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' :
          notification.type === 'error' ? 'bg-rose-50 dark:bg-slate-800 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200' :
          'bg-blue-50 dark:bg-slate-800 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#007BC4]" />
            {notification.text}
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Incidents</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">{metrics.total}</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Open / Investigating</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-2xl font-black text-amber-600">{metrics.openCount}</span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">High / Critical Hazards</span>
          <span className="text-2xl font-black text-rose-600">{metrics.highRisk}</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending CAPA Actions</span>
          <span className="text-2xl font-black text-indigo-600">{metrics.capaPending}</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Closed & Signed Off</span>
          <span className="text-2xl font-black text-emerald-600">{metrics.closedCount}</span>
        </div>
      </div>

      {/* Category Selection Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategory('All')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            selectedCategory === 'All'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          All Categories ({incidents.length})
        </button>

        {INCIDENT_CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const count = incidents.filter(i => i.category === cat.name).length;

          return (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap border ${
                selectedCategory === cat.name
                  ? `${cat.bg} ${cat.color} ring-2 ring-offset-1 ring-current shadow-sm`
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon size={14} className={cat.color} />
              {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Search, Workflow Stage, Severity & Sorting Toolbar */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-3.5" />
          <input
            type="text"
            placeholder="Search ID, title, zone, officer, equipment..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#007BC4]"
          />
        </div>

        {/* Workflow Stage Filter */}
        <div className="flex items-center gap-1 overflow-x-auto w-full lg:w-auto">
          <button
            onClick={() => setSelectedStatus('All')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold ${selectedStatus === 'All' ? 'bg-[#007BC4] text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
          >
            All Stages
          </button>
          {WORKFLOW_STAGES.map(st => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${
                selectedStatus === st ? 'bg-[#007BC4] text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Severity & Sort Dropdowns */}
        <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
          <select
            value={selectedSeverityFilter}
            onChange={e => setSelectedSeverityFilter(e.target.value as any)}
            className="p-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300"
          >
            <option value="All">All Severities</option>
            <option value="Critical">Critical Only</option>
            <option value="High">High Only</option>
            <option value="Medium">Medium Only</option>
            <option value="Low">Low Only</option>
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="p-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="severity">Highest Severity</option>
            <option value="threat">Highest AI Threat</option>
          </select>
        </div>
      </div>

      {/* Main Split Interface: Left Roster (4 cols) + Right Workspace (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[580px]">
        
        {/* Incident Roster Left Column */}
        <div className="lg:col-span-4 space-y-3 overflow-y-auto max-h-[720px] pr-1">
          {filteredIncidents.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 text-xs">
              No matching enterprise incidents found.
            </div>
          ) : (
            filteredIncidents.map(inc => {
              const isSelected = selectedIncident?.id === inc.id;
              const catObj = INCIDENT_CATEGORIES.find(c => c.name === inc.category) || INCIDENT_CATEGORIES[0];
              const Icon = catObj.icon;

              return (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncident(inc)}
                  className={`p-4 rounded-2xl border transition cursor-pointer shadow-sm relative ${
                    isSelected
                      ? 'bg-[#007BC4]/5 border-[#007BC4] ring-2 ring-[#007BC4]/20'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono text-xs font-black text-[#007BC4] bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                      {inc.id}
                    </span>

                    <Badge variant="outline" className={
                      inc.workflowStatus === 'Open' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      inc.workflowStatus === 'Investigation' ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
                      inc.workflowStatus === 'Root Cause' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      inc.workflowStatus === 'Closed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700'
                    }>
                      {inc.workflowStatus}
                    </Badge>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-1 mb-1">
                    {inc.title}
                  </h3>

                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <span className={`flex items-center gap-1 font-bold ${catObj.color}`}>
                      <Icon size={12} /> {inc.category}
                    </span>
                    •
                    <span>{inc.locationZone}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100 dark:border-slate-700/60">
                    <span className="text-slate-500 font-medium">
                      Officer: <strong className="text-slate-800 dark:text-slate-200">{(inc.assignedOfficer || "").split(' ')[0]}</strong>
                    </span>

                    <div className="flex items-center gap-1">
                      {inc.severity === 'Critical' && <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[9px] uppercase">Critical</span>}
                      {inc.severity === 'High' && <span className="px-2 py-0.5 rounded bg-rose-500 text-white font-black text-[9px] uppercase">High</span>}
                      {inc.severity === 'Medium' && <span className="px-2 py-0.5 rounded bg-amber-500 text-white font-black text-[9px] uppercase">Medium</span>}
                      {inc.severity === 'Low' && <span className="px-2 py-0.5 rounded bg-slate-400 text-white font-black text-[9px] uppercase">Low</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detailed Workspace Right Column */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          {selectedIncident ? (
            <div className="flex flex-col h-full">
              
              {/* Workspace Top Header */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-xs font-black text-[#007BC4]">{selectedIncident.id}</span>
                      <Badge className="bg-[#007BC4]">{selectedIncident.category}</Badge>
                      <Badge variant="outline" className="border-rose-200 text-rose-700 bg-rose-50 font-bold">
                        Severity: {selectedIncident.severity}
                      </Badge>
                      {selectedIncident.equipmentInvolved && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                          Equipment: {selectedIncident.equipmentInvolved}
                        </span>
                      )}
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-snug">
                      {selectedIncident.title}
                    </h2>
                  </div>

                  {/* Header Management Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={openEditIncident}
                      className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 text-xs font-bold flex items-center gap-1"
                      title="Edit Incident Details"
                    >
                      <Edit3 size={13} /> Edit
                    </button>

                    <button
                      onClick={handleDeleteIncident}
                      className="p-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100 text-xs font-bold flex items-center gap-1"
                      title="Delete Incident"
                    >
                      <Trash2 size={13} />
                    </button>

                    {/* Workflow Stage Quick Progression */}
                    {selectedIncident.workflowStatus !== 'Closed' && (
                      <button
                        onClick={() => {
                          const currentIdx = WORKFLOW_STAGES.indexOf(selectedIncident.workflowStatus);
                          if (currentIdx < WORKFLOW_STAGES.length - 1) {
                            handleSetWorkflowStage(WORKFLOW_STAGES[currentIdx + 1]);
                          }
                        }}
                        className="px-3 py-1.5 bg-[#007BC4] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-blue-700 transition flex items-center gap-1.5"
                      >
                        Advance Stage <ArrowRight size={13} />
                      </button>
                    )}

                    {selectedIncident.workflowStatus === 'Approval' && (
                      <button
                        onClick={() => setIsSignOffOpen(true)}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-emerald-700 transition flex items-center gap-1.5"
                      >
                        Sign Off & Close <CheckCircle2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {selectedIncident.description}
                </p>

                {/* Metadata Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-[11px]">
                  <div>
                    <span className="text-slate-400 block font-semibold">Location Zone</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedIncident.locationZone}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-semibold">Assigned Lead</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedIncident.assignedOfficer}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-semibold">Reported By</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedIncident.reportedBy}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-semibold">Reported Timestamp</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{new Date(selectedIncident.reportedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Sub-Tabs Bar */}
                <div className="flex items-center gap-1 pt-2 border-t border-slate-200 dark:border-slate-700 overflow-x-auto">
                  {[
                    { id: 'ai_analysis', label: 'AI RCA & Analysis', icon: Sparkles },
                    { id: 'workflow', label: 'Workflow Stepper', icon: ArrowRight },
                    { id: 'capa', label: `CAPA Actions (${selectedIncident.correctiveActions?.length || 0})`, icon: CheckSquare },
                    { id: 'witnesses', label: `Witnesses (${selectedIncident.witnessStatements?.length || 0})`, icon: MessageSquare },
                    { id: 'attachments', label: `Attachments (${selectedIncident.attachments?.length || 0})`, icon: Paperclip },
                    { id: 'timeline', label: `Timeline (${selectedIncident.timeline?.length || 0})`, icon: Clock }
                  ].map(tab => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveDetailTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                          activeDetailTab === tab.id
                            ? 'bg-[#007BC4] text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Icon size={13} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Workspace Active Sub-Tab View */}
              <div className="p-5 flex-1 overflow-y-auto space-y-5">
                
                {/* 1. AI RCA & ANALYSIS TAB */}
                {activeDetailTab === 'ai_analysis' && (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 bg-blue-50/70 dark:bg-slate-900 border border-blue-200 dark:border-slate-700 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h4 className="font-bold text-blue-900 dark:text-blue-200 text-sm flex items-center gap-2">
                          <Sparkles size={16} className="text-[#007BC4]" />
                          Automated Root Cause Analysis (AI RCA)
                        </h4>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleReanalyzeWithAi}
                            disabled={isAnalyzingAi}
                            className="px-3 py-1 bg-[#007BC4] text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition flex items-center gap-1 shadow-sm"
                          >
                            <RefreshCw size={12} className={isAnalyzingAi ? 'animate-spin' : ''} />
                            {isAnalyzingAi ? 'Analyzing...' : 'Re-Analyze with AI'}
                          </button>

                          <button
                            onClick={openEditRca}
                            className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-xs hover:bg-slate-50"
                          >
                            Edit RCA
                          </button>

                          <span className="px-2.5 py-0.5 rounded-full font-black text-xs bg-[#007BC4] text-white">
                            Threat Score: {selectedIncident.aiAnalysis?.severityScore || 70}/100
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                        {selectedIncident.aiAnalysis?.aiSummary}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                          <span className="font-bold text-slate-500 text-[10px] uppercase">Probable Root Cause</span>
                          <p className="font-bold text-slate-900 dark:text-white">{selectedIncident.aiAnalysis?.probableRootCause}</p>
                        </div>

                        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                          <span className="font-bold text-slate-500 text-[10px] uppercase">OSHA / ISO 45001 Regulatory Impact</span>
                          <p className="font-bold text-slate-900 dark:text-white">{selectedIncident.aiAnalysis?.regulatoryImpact}</p>
                        </div>
                      </div>

                      <div className="space-y-1 pt-1">
                        <span className="font-bold text-slate-500 text-[10px] uppercase block">Contributing Factors</span>
                        <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300 font-medium">
                          {(selectedIncident.aiAnalysis?.contributingFactors || []).map((cf, idx) => (
                            <li key={idx}>{cf}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-1 pt-1">
                        <span className="font-bold text-slate-500 text-[10px] uppercase block">AI CAPA Recommendations</span>
                        <div className="space-y-1.5">
                          {(selectedIncident.aiAnalysis?.capaRecommendations || []).map((rec, idx) => (
                            <div key={idx} className="p-2 bg-emerald-50 dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg font-bold text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                {rec}
                              </span>
                              <button
                                onClick={() => {
                                  setNewCapa({ actionItem: rec, assignedTo: selectedIncident.assignedOfficer, dueDate: new Date().toISOString().split('T')[0] });
                                  setIsAddCapaOpen(true);
                                }}
                                className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700"
                              >
                                Convert to CAPA
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. WORKFLOW STEPPER TAB */}
                {activeDetailTab === 'workflow' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">Seven-Stage EHS Investigation Pipeline</h4>
                      <span className="text-xs font-bold text-[#007BC4]">Current Stage: {selectedIncident.workflowStatus}</span>
                    </div>

                    {/* Stepper Pipeline Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      {WORKFLOW_STAGES.map((st, idx) => {
                        const currentStageIdx = WORKFLOW_STAGES.indexOf(selectedIncident.workflowStatus);
                        const isDone = idx < currentStageIdx;
                        const isCurrent = idx === currentStageIdx;

                        return (
                          <div
                            key={st}
                            onClick={() => handleSetWorkflowStage(st)}
                            className={`p-3 rounded-xl border flex flex-col justify-between h-24 text-xs cursor-pointer transition ${
                              isCurrent ? 'bg-[#007BC4] text-white border-[#007BC4] font-bold shadow-md' :
                              isDone ? 'bg-emerald-50 dark:bg-slate-900 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold' :
                              'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
                            }`}
                          >
                            <span className="text-[10px] uppercase font-black opacity-75">Stage 0{idx + 1}</span>
                            <span className="font-bold leading-tight">{st}</span>
                            <div className="flex items-center gap-1 text-[10px]">
                              {isDone && <CheckCircle2 size={12} className="text-emerald-600" />}
                              {isCurrent && <Clock size={12} className="text-white animate-spin" />}
                              <span>{isDone ? 'Completed' : isCurrent ? 'Active Stage' : 'Click to Jump'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Approval Sign-off details if available */}
                    {selectedIncident.approvalSignOff && (
                      <div className="p-4 bg-emerald-50 dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs space-y-1">
                        <span className="font-bold text-emerald-900 dark:text-emerald-200 text-sm flex items-center gap-2">
                          <CheckCircle2 size={16} className="text-emerald-600" /> Executive Sign-Off Completed
                        </span>
                        <p className="text-slate-700 dark:text-slate-300 font-medium">"{selectedIncident.approvalSignOff.comments}"</p>
                        <span className="text-[10px] text-slate-400 font-bold block">
                          Signed by {selectedIncident.approvalSignOff.approvedBy} on {new Date(selectedIncident.approvalSignOff.approvedAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. CAPA ACTION ITEMS TAB */}
                {activeDetailTab === 'capa' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                        <CheckSquare size={16} className="text-[#007BC4]" />
                        Corrective & Preventive Action (CAPA) Log
                      </h4>
                      <button
                        onClick={() => setIsAddCapaOpen(true)}
                        className="px-3 py-1.5 bg-[#007BC4] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-blue-700 transition flex items-center gap-1.5"
                      >
                        <Plus size={14} /> Add CAPA Action Item
                      </button>
                    </div>

                    <div className="space-y-2 text-xs">
                      {(selectedIncident.correctiveActions || []).length > 0 ? (
                        (selectedIncident.correctiveActions || []).map(ca => (
                          <div key={ca.id} className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={ca.isCompleted}
                                onChange={() => handleToggleCapa(ca.id)}
                                className="w-4 h-4 rounded text-[#007BC4] focus:ring-[#007BC4] cursor-pointer"
                              />
                              <div>
                                <p className={`font-bold ${ca.isCompleted ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                                  {ca.actionItem}
                                </p>
                                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                                  Assigned: <strong>{ca.assignedTo}</strong> • Due Date: {ca.dueDate}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={ca.isCompleted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>
                                {ca.isCompleted ? 'Completed' : 'Pending'}
                              </Badge>

                              <button
                                onClick={() => handleDeleteCapa(ca.id)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="Delete CAPA Item"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                          No CAPA action items logged for this incident yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. WITNESS STATEMENTS TAB */}
                {activeDetailTab === 'witnesses' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                        <MessageSquare size={16} className="text-[#007BC4]" />
                        Recorded Witness & Personnel Statements
                      </h4>
                      <button
                        onClick={() => setIsAddWitnessOpen(true)}
                        className="px-3 py-1.5 bg-[#007BC4] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-blue-700 transition flex items-center gap-1.5"
                      >
                        <UserPlus size={14} /> Record Witness Statement
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      {(selectedIncident.witnessStatements || []).length > 0 ? (
                        (selectedIncident.witnessStatements || []).map(ws => (
                          <div key={ws.id} className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2 relative">
                            <div className="flex justify-between items-center font-bold text-slate-900 dark:text-white">
                              <span className="flex items-center gap-2">
                                <HardHat size={14} className="text-[#007BC4]" />
                                {ws.witnessName} ({ws.witnessRole}) • <span className="text-slate-500 font-normal">{ws.company}</span>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 font-mono text-[10px]">{formatIncidentTimestamp(ws.timestamp)} • Interviewed by {ws.interviewedBy}</span>
                                <button onClick={() => handleDeleteWitness(ws.id)} className="text-slate-400 hover:text-rose-600">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 italic bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                              "{ws.statement}"
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                          No witness statements logged for this incident yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. ATTACHMENTS & EVIDENCE TAB */}
                {activeDetailTab === 'attachments' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                        <Paperclip size={16} className="text-[#007BC4]" />
                        Evidence & Digital Attachments
                      </h4>

                      <button
                        onClick={() => setIsAddAttachmentOpen(true)}
                        className="px-3 py-1.5 bg-[#007BC4] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-blue-700 transition flex items-center gap-1.5"
                      >
                        <Upload size={14} /> Add Attachment / Evidence
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {(selectedIncident.attachments || []).length > 0 ? (
                        (selectedIncident.attachments || []).map(att => (
                          <div key={att.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div className="p-2 bg-[#007BC4]/10 text-[#007BC4] rounded-lg font-bold text-xs shrink-0">
                                {att.fileType === 'CCTV Clip' ? 'CCTV' : att.fileType === 'Photo' ? 'IMG' : 'DOC'}
                              </div>
                              <div className="truncate">
                                <p className="font-bold text-slate-900 dark:text-white truncate">{att.fileName}</p>
                                <span className="text-[10px] text-slate-400 block">{att.fileSize} • Uploaded by {att.uploadedBy}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => setViewingAttachment(att)}
                                className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold hover:bg-slate-100 transition"
                              >
                                View
                              </button>
                              <button
                                onClick={() => handleDeleteAttachment(att.id)}
                                className="p-1 text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="sm:col-span-2 p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                          No evidence files attached to this incident record yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 6. TIMELINE & LOG HISTORY TAB */}
                {activeDetailTab === 'timeline' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                        <Clock size={16} className="text-[#007BC4]" />
                        Chronological Timeline History
                      </h4>

                      <button
                        onClick={() => setIsAddTimelineOpen(true)}
                        className="px-3 py-1.5 bg-[#007BC4] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-blue-700 transition flex items-center gap-1.5"
                      >
                        <Plus size={14} /> Add Timeline Note
                      </button>
                    </div>

                    <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700 pl-8">
                      {(selectedIncident.timeline || []).map((evt, idx) => (
                        <div key={evt.id || idx} className="relative space-y-0.5">
                          <div className="absolute -left-[27px] top-0.5 w-4 h-4 rounded-full bg-[#007BC4] text-white flex items-center justify-center text-[8px] font-black">
                            ✓
                          </div>
                          <div className="flex justify-between items-center text-xs font-bold text-slate-900 dark:text-white">
                            <span>{evt.title}</span>
                            <span className="text-slate-400 font-mono text-[10px]">{formatIncidentTimestamp(evt.timestamp)}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300">{evt.description}</p>
                          <span className="text-[10px] text-slate-400 font-semibold">Actor: {evt.actor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
              <ShieldAlert className="w-12 h-12 mb-3 text-slate-300" />
              <p className="font-bold text-sm">Select an incident from the left roster to view workspace details.</p>
            </div>
          )}
        </div>
      </div>

      {/* 1. LOG NEW INCIDENT MODAL */}
      {isNewIncidentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsNewIncidentOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Plus size={18} className="text-[#007BC4]" /> Log Enterprise Incident
            </h3>

            <form onSubmit={handleCreateIncidentSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Incident Category</label>
                  <select
                    value={newForm.category}
                    onChange={e => setNewForm({ ...newForm, category: e.target.value as IncidentCategory })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    {INCIDENT_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Severity Rating</label>
                  <select
                    value={newForm.severity}
                    onChange={e => setNewForm({ ...newForm, severity: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value="Critical">Critical Severity</option>
                    <option value="High">High Severity</option>
                    <option value="Medium">Medium Severity</option>
                    <option value="Low">Low Severity</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Incident Title / Summary</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Scaffolding Plank Shift near Gate 2"
                  value={newForm.title}
                  onChange={e => setNewForm({ ...newForm, title: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Location Zone</label>
                  <input
                    type="text"
                    required
                    value={newForm.locationZone}
                    onChange={e => setNewForm({ ...newForm, locationZone: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Assigned EHS Officer</label>
                  <input
                    type="text"
                    required
                    value={newForm.assignedOfficer}
                    onChange={e => setNewForm({ ...newForm, assignedOfficer: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Equipment Involved (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. CAT Excavator EX-04"
                    value={newForm.equipmentInvolved}
                    onChange={e => setNewForm({ ...newForm, equipmentInvolved: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Injured Personnel Count</label>
                  <input
                    type="number"
                    min="0"
                    value={newForm.injuredPersonnelCount}
                    onChange={e => setNewForm({ ...newForm, injuredPersonnelCount: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Detailed Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the initial findings, personnel involved, and immediate safety measures taken..."
                  value={newForm.description}
                  onChange={e => setNewForm({ ...newForm, description: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewIncidentOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition"
                >
                  Save & Save to MongoDB
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. EDIT INCIDENT MODAL */}
      {isEditIncidentOpen && selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsEditIncidentOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Edit3 size={18} className="text-[#007BC4]" /> Edit Incident Details ({selectedIncident.id})
            </h3>

            <form onSubmit={handleEditIncidentSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Category</label>
                  <select
                    value={editForm.category}
                    onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    {INCIDENT_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Severity</label>
                  <select
                    value={editForm.severity}
                    onChange={e => setEditForm({ ...editForm, severity: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Location Zone</label>
                  <input
                    type="text"
                    value={editForm.locationZone}
                    onChange={e => setEditForm({ ...editForm, locationZone: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Assigned Officer</label>
                  <input
                    type="text"
                    value={editForm.assignedOfficer}
                    onChange={e => setEditForm({ ...editForm, assignedOfficer: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditIncidentOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. ADD CAPA MODAL */}
      {isAddCapaOpen && selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setIsAddCapaOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <CheckSquare size={18} className="text-[#007BC4]" /> Add CAPA Action Item
            </h3>

            <form onSubmit={handleAddCapaSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Action Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inspect scaffold handrail clamps"
                  value={newCapa.actionItem}
                  onChange={e => setNewCapa({ ...newCapa, actionItem: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Assigned To</label>
                  <input
                    type="text"
                    required
                    value={newCapa.assignedTo}
                    onChange={e => setNewCapa({ ...newCapa, assignedTo: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Due Date</label>
                  <input
                    type="date"
                    required
                    value={newCapa.dueDate}
                    onChange={e => setNewCapa({ ...newCapa, dueDate: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCapaOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold"
                >
                  Add CAPA Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. RECORD WITNESS STATEMENT MODAL */}
      {isAddWitnessOpen && selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setIsAddWitnessOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <MessageSquare size={18} className="text-[#007BC4]" /> Record Witness Statement
            </h3>

            <form onSubmit={handleAddWitnessSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Witness Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. David Chen"
                  value={newWitness.witnessName}
                  onChange={e => setNewWitness({ ...newWitness, witnessName: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Witness Role</label>
                  <input
                    type="text"
                    placeholder="e.g. Scaffolding Lead"
                    value={newWitness.witnessRole}
                    onChange={e => setNewWitness({ ...newWitness, witnessRole: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Contractor / Trade</label>
                  <input
                    type="text"
                    value={newWitness.company}
                    onChange={e => setNewWitness({ ...newWitness, company: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Interviewed By</label>
                <input
                  type="text"
                  value={newWitness.interviewedBy}
                  onChange={e => setNewWitness({ ...newWitness, interviewedBy: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Witness Statement Text</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Verbatim quote or transcript of what the witness observed..."
                  value={newWitness.statement}
                  onChange={e => setNewWitness({ ...newWitness, statement: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddWitnessOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold"
                >
                  Save Witness Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. ADD ATTACHMENT MODAL */}
      {isAddAttachmentOpen && selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setIsAddAttachmentOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Upload size={18} className="text-[#007BC4]" /> Add Evidence Attachment
            </h3>

            <form onSubmit={handleAddAttachmentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">File Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. cctv_camera_gate3_frame.jpg"
                  value={newAttachment.fileName}
                  onChange={e => setNewAttachment({ ...newAttachment, fileName: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">File Type</label>
                  <select
                    value={newAttachment.fileType}
                    onChange={e => setNewAttachment({ ...newAttachment, fileType: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value="Photo">Photo</option>
                    <option value="CCTV Clip">CCTV Clip</option>
                    <option value="Telemetry Log">Telemetry Log</option>
                    <option value="Inspection PDF">Inspection PDF</option>
                    <option value="Medical Report">Medical Report</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">File Size</label>
                  <input
                    type="text"
                    value={newAttachment.fileSize}
                    onChange={e => setNewAttachment({ ...newAttachment, fileSize: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Image URL / File URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={newAttachment.fileUrl}
                  onChange={e => setNewAttachment({ ...newAttachment, fileUrl: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddAttachmentOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold"
                >
                  Save Attachment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. VIEW ATTACHMENT LIGHTBOX */}
      {viewingAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-2xl w-full p-5 relative space-y-4">
            <button onClick={() => setViewingAttachment(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
            <div className="flex items-center gap-2">
              <Paperclip className="text-[#007BC4]" size={18} />
              <h3 className="font-bold text-slate-900 dark:text-white text-base">{viewingAttachment.fileName}</h3>
            </div>

            {viewingAttachment.fileUrl.startsWith('http') ? (
              <img src={viewingAttachment.fileUrl} alt={viewingAttachment.fileName} className="w-full max-h-[400px] object-cover rounded-xl border" />
            ) : (
              <div className="p-8 bg-slate-100 dark:bg-slate-800 text-center rounded-xl font-mono text-xs">
                File Preview: {viewingAttachment.fileName} ({viewingAttachment.fileSize})
              </div>
            )}

            <div className="flex justify-between items-center text-xs text-slate-500 pt-2 border-t">
              <span>Uploaded by {viewingAttachment.uploadedBy} on {viewingAttachment.uploadedAt}</span>
              <a
                href={viewingAttachment.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-[#007BC4] text-white rounded-lg font-bold"
              >
                Open Original
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 7. EDIT RCA MODAL */}
      {isEditRcaOpen && selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-lg p-6 relative">
            <button onClick={() => setIsEditRcaOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Sparkles size={18} className="text-[#007BC4]" /> Edit Root Cause Analysis (RCA)
            </h3>

            <form onSubmit={handleSaveRca} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Probable Root Cause</label>
                <textarea
                  rows={2}
                  value={rcaForm.probableRootCause}
                  onChange={e => setRcaForm({ ...rcaForm, probableRootCause: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">OSHA / ISO Regulatory Impact</label>
                <input
                  type="text"
                  value={rcaForm.regulatoryImpact}
                  onChange={e => setRcaForm({ ...rcaForm, regulatoryImpact: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Contributing Factors (1 per line)</label>
                <textarea
                  rows={3}
                  value={rcaForm.contributingFactorText}
                  onChange={e => setRcaForm({ ...rcaForm, contributingFactorText: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditRcaOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold"
                >
                  Save RCA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. ADD TIMELINE NOTE MODAL */}
      {isAddTimelineOpen && selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setIsAddTimelineOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Clock size={18} className="text-[#007BC4]" /> Add Timeline Log Event
            </h3>

            <form onSubmit={handleAddTimelineSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Log Event Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Perimeter barrier re-inspected"
                  value={newTimelineEvent.title}
                  onChange={e => setNewTimelineEvent({ ...newTimelineEvent, title: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Actor / Field Officer</label>
                <input
                  type="text"
                  value={newTimelineEvent.actor}
                  onChange={e => setNewTimelineEvent({ ...newTimelineEvent, actor: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Event Details</label>
                <textarea
                  rows={3}
                  value={newTimelineEvent.description}
                  onChange={e => setNewTimelineEvent({ ...newTimelineEvent, description: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddTimelineOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold"
                >
                  Record Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. EXECUTIVE SIGN OFF MODAL */}
      {isSignOffOpen && selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setIsSignOffOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" /> Executive Sign-Off & Close Incident
            </h3>

            <form onSubmit={handleSignOffSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Approved By (Executive / Director)</label>
                <input
                  type="text"
                  required
                  value={signOffForm.approvedBy}
                  onChange={e => setSignOffForm({ ...signOffForm, approvedBy: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Approval Comments & Notes</label>
                <textarea
                  rows={3}
                  required
                  value={signOffForm.comments}
                  onChange={e => setSignOffForm({ ...signOffForm, comments: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSignOffOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold shadow-md hover:bg-emerald-700"
                >
                  Sign Off & Close File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
