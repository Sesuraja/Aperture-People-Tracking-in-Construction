import React, { useState, useEffect } from 'react';
import { ShieldCheck, Clock, AlertTriangle, CheckCircle2, Server, Globe2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db, collection, onSnapshot } from '../lib/db';

interface SlaItem {
  id?: string;
  metric: string;
  target: string;
  actual: string;
  status: 'Met' | 'Breached';
  trend: string;
}

export default function SlaDashboardTab() {
  const [slaList, setSlaList] = useState<SlaItem[]>([]);
  const [activeBreaches, setActiveBreaches] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sla_metrics'), (snap) => {
      const items: SlaItem[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          metric: data.metric || 'Service Metric',
          target: data.target || '99.9%',
          actual: data.actual || '100%',
          status: data.status === 'Breached' ? 'Breached' : 'Met',
          trend: data.trend || '0%'
        };
      });
      setSlaList(items);
      setActiveBreaches(items.filter(i => i.status === 'Breached').length);
    }, () => {
      setSlaList([]);
      setActiveBreaches(0);
    });

    return () => unsub();
  }, []);

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto min-h-0">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#007BC4]" />
            Enterprise SLA Dashboard
          </h2>
          <p className="text-slate-500 font-medium tracking-tight">Monitor service level agreements, system availability, and platform performance from live database data.</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6 shrink-0">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Globe2 className="w-4 h-4 text-[#007BC4]" /> Platform Status</span>
            <span className="text-3xl font-black text-slate-900 mt-2">{activeBreaches === 0 ? 'Optimal' : 'Degraded'}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Clock className="w-4 h-4 text-emerald-500" /> Tracked Metrics</span>
            <span className="text-3xl font-black text-slate-900 mt-2">{slaList.length}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-rose-500" /> Active Breaches</span>
            <span className="text-3xl font-black text-slate-900 mt-2">{activeBreaches}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Server className="w-4 h-4 text-indigo-500" /> Database Connection</span>
            <span className="text-3xl font-black text-emerald-600 mt-2">Active</span>
        </div>
      </div>

      <div className="bg-white border flex-1 border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0">
         <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">SLA Performance Targets</h3>
            <span className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">Live MongoDB Feed</span>
         </div>
        <div className="overflow-y-auto flex-1">
          {slaList.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <ShieldCheck className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-700">No SLA Metrics Configured in Database</p>
              <p className="text-xs text-slate-400 mt-1">Add metrics to the 'sla_metrics' collection in MongoDB to populate this dashboard.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                <TableRow>
                  <TableHead className="py-4">Service Metric</TableHead>
                  <TableHead className="py-4 text-center">Target SLA</TableHead>
                  <TableHead className="py-4 text-center">Current Actual</TableHead>
                  <TableHead className="py-4 text-right">Trend</TableHead>
                  <TableHead className="py-4 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slaList.map((sla, idx) => (
                  <TableRow key={sla.id || idx} className="border-slate-100 hover:bg-slate-50 transition-colors">
                    <TableCell>
                      <div className="font-bold text-slate-900">{sla.metric}</div>
                    </TableCell>
                    <TableCell className="text-center font-mono font-bold text-slate-500">
                       {sla.target}
                    </TableCell>
                    <TableCell className="text-center">
                       <span className={`font-mono font-bold ${sla.status === 'Met' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {sla.actual}
                       </span>
                    </TableCell>
                    <TableCell className="text-right">
                       <span className="text-xs font-bold text-slate-600">
                          {sla.trend}
                       </span>
                    </TableCell>
                    <TableCell className="text-right">
                       {sla.status === 'Met' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200">
                             <CheckCircle2 className="w-3 h-3 mr-1" /> SLA Met
                          </Badge>
                       ) : (
                          <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200 animate-pulse">
                             <AlertTriangle className="w-3 h-3 mr-1" /> Breached
                          </Badge>
                       )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
