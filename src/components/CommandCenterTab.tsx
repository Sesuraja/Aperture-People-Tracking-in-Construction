import React, { useState, useEffect } from 'react';
import { Building2, Activity, Users, Radio, AlertOctagon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { db, collection, onSnapshot } from '../lib/db';

interface SiteItem {
  id: string;
  name: string;
  type: string;
  health: number;
  occupancy: number;
  limit: number;
  activeAlerts: number;
  offlineReaders: number;
}

export default function CommandCenterTab() {
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [totalOccupancy, setTotalOccupancy] = useState(0);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  const [offlineReadersCount, setOfflineReadersCount] = useState(0);
  const [avgHealth, setAvgHealth] = useState(100);

  useEffect(() => {
    // Sync sites/projects from MongoDB
    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      const items: SiteItem[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || 'Site ' + d.id,
          type: data.type || 'Construction Site',
          health: data.health || 100,
          occupancy: data.occupancy || 0,
          limit: data.capacity || data.limit || 500,
          activeAlerts: data.activeAlerts || 0,
          offlineReaders: data.offlineReaders || 0
        };
      });
      setSites(items);
    }, () => setSites([]));

    // Sync total people occupancy
    const unsubPeople = onSnapshot(collection(db, 'registered_people'), (snap) => {
      setTotalOccupancy(snap.size);
    }, () => setTotalOccupancy(0));

    // Sync active alerts
    const unsubAlerts = onSnapshot(collection(db, 'alerts_enterprise'), (snap) => {
      setActiveAlertsCount(snap.size);
    }, () => setActiveAlertsCount(0));

    // Sync offline readers from devices
    const unsubDevices = onSnapshot(collection(db, 'devices'), (snap) => {
      let offline = 0;
      snap.forEach(d => {
        if (d.data().status === 'offline') offline++;
      });
      setOfflineReadersCount(offline);
    }, () => setOfflineReadersCount(0));

    return () => {
      unsubProjects();
      unsubPeople();
      unsubAlerts();
      unsubDevices();
    };
  }, []);

  return (
    <div className="w-full flex flex-col p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#007BC4]" />
            Multi-Site Command Center
          </h2>
          <p className="text-slate-500 font-medium tracking-tight">Enterprise overview across all registered facilities and branches.</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6 shrink-0">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <span className="text-sm font-bold text-slate-500 uppercase flex items-center gap-1.5"><Users className="w-4 h-4 text-[#007BC4]" /> Total Occupancy</span>
            <span className="text-3xl font-black text-slate-900 mt-2">{totalOccupancy}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <span className="text-sm font-bold text-slate-500 uppercase flex items-center gap-1.5"><Activity className="w-4 h-4 text-emerald-500" /> Avg System Health</span>
            <span className="text-3xl font-black text-slate-900 mt-2">{sites.length > 0 ? (sites.reduce((acc, s) => acc + s.health, 0) / sites.length).toFixed(1) + '%' : '100%'}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <span className="text-sm font-bold text-slate-500 uppercase flex items-center gap-1.5"><AlertOctagon className="w-4 h-4 text-rose-500" /> Active Alerts</span>
            <span className="text-3xl font-black text-rose-600 mt-2">{activeAlertsCount}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <span className="text-sm font-bold text-slate-500 uppercase flex items-center gap-1.5"><Radio className="w-4 h-4 text-amber-500" /> Offline Readers</span>
            <span className="text-3xl font-black text-slate-900 mt-2">{offlineReadersCount}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex-1 overflow-hidden relative overflow-y-auto p-4">
         {sites.length === 0 ? (
           <div className="text-center py-16 text-slate-500">
             <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
             <p className="font-semibold text-slate-700">No Sites Registered</p>
             <p className="text-xs text-slate-400 mt-1">Sites created in MongoDB will be displayed here in real-time.</p>
           </div>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sites.map(site => (
                 <div key={site.id} className="border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer bg-slate-50 group">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 group-hover:text-[#007BC4] transition-colors">{site.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                             <Badge variant="outline" className="text-slate-500 border-slate-300 font-medium">{site.type}</Badge>
                             <span className="text-xs font-mono text-slate-500 bg-slate-200 px-2 rounded-sm">{site.id}</span>
                          </div>
                       </div>
                       {site.health < 90 ? (
                          <div className="flex flex-col items-end">
                             <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200">Needs Attention</Badge>
                          </div>
                       ) : (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200">System Nominal</Badge>
                       )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                       <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Occupancy</div>
                          <div className="flex items-end gap-2">
                             <span className="text-2xl font-bold text-slate-800">{site.occupancy}</span>
                             <span className="text-xs font-semibold text-slate-500 mb-1">/ {site.limit}</span>
                          </div>
                          {/* Capacity bar */}
                          <div className="w-full bg-slate-200 h-1.5 mt-2 rounded-full overflow-hidden">
                             <div 
                               className={`h-full rounded-full ${site.limit > 0 && site.occupancy / site.limit > 0.85 ? 'bg-rose-500' : 'bg-[#007BC4]'}`}
                               style={{ width: `${site.limit > 0 ? Math.min(100, (site.occupancy / site.limit) * 100) : 0}%` }}
                             />
                          </div>
                       </div>
                       <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Live Status</div>
                          <div className="flex flex-col gap-1 mt-1">
                             <div className="flex items-center justify-between text-xs font-medium">
                                <span className="text-slate-600 flex items-center gap-1.5"><AlertOctagon className="w-3 h-3 text-rose-500"/> Alerts</span>
                                <span className={site.activeAlerts > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}>{site.activeAlerts}</span>
                             </div>
                             <div className="flex items-center justify-between text-xs font-medium">
                                <span className="text-slate-600 flex items-center gap-1.5"><Radio className="w-3 h-3 text-amber-500"/> Offline Readers</span>
                                <span className={site.offlineReaders > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}>{site.offlineReaders}</span>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
              ))}
           </div>
         )}
      </div>
    </div>
  );
}
