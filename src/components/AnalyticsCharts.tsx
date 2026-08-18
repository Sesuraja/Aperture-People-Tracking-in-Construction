import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { Person } from '../lib/simulation';
import { useMemo } from 'react';

export default function AnalyticsCharts({ people }: { people: Person[] }) {
  // Generate some aggregate data based on dwell time per zone
  const zoneData = useMemo(() => {
    const counts = people.reduce((acc, p) => {
      acc[p.currentZone] = (acc[p.currentZone] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts).map(zone => ({
      name: zone,
      occupancy: counts[zone]
    }));
  }, [people]);

  const mockTimelineData = useMemo(() => {
    // Generate static looking trend data with slight tail end jitter
    const base = [
      { time: '09:00', load: 12 },
      { time: '10:00', load: 18 },
      { time: '11:00', load: 25 },
      { time: '12:00', load: 35 },
      { time: '13:00', load: 45 },
      { time: '14:00', load: 30 },
      { time: '15:00', load: 28 },
      { time: '16:00', load: 32 },
    ];
    // Add current real value to end to make it feel alive
    base.push({ time: new Date().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' }), load: Object.keys(zoneData).reduce((s, z) => s + (zoneData as any)[z]?.occupancy || 0, 20) + (Math.random() * 5) });
    return base;
  }, [zoneData]);


  return (
    <div className="flex h-full gap-6 w-full">
      <div className="flex-1 flex flex-col h-full bg-slate-950/30 rounded-xl border border-slate-800/50 p-4">
        <h3 className="text-sm font-semibold text-slate-400 mb-4 px-2">Predictive Occupancy</h3>
        <div className="flex-1 min-h-0 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockTimelineData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', padding: '8px' }}
                itemStyle={{ color: '#818cf8', fontSize: '12px', fontWeight: 'bold' }}
                labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}
              />
              <Area type="monotone" dataKey="load" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorLoad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="w-1/3 flex flex-col h-full bg-slate-950/30 rounded-xl border border-slate-800/50 p-4">
        <h3 className="text-sm font-semibold text-slate-400 mb-4 px-2">Zone Distribution</h3>
        <div className="flex-1 min-h-0 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={zoneData} layout="vertical" margin={{ top: 0, right: 0, left: 30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} width={80} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                cursor={{ fill: '#1e293b' }}
              />
              <Bar dataKey="occupancy" fill="#38bdf8" radius={[0, 4, 4, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
