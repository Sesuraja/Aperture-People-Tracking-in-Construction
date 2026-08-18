import { motion, AnimatePresence } from 'motion/react';
import { AIAlert } from '../lib/simulation';
import { AlertCircle, FileWarning, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export default function AIFeed({ alerts }: { alerts: AIAlert[] }) {
  return (
    <ScrollArea className="flex-1 -mx-4 px-4 overflow-hidden">
      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {alerts.map((alert, i) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className={`p-4 rounded-xl border relative overflow-hidden group transition-all shadow-sm ${
                alert.type === 'security' ? 'bg-rose-50 border-rose-200 hover:bg-rose-100 hover:border-rose-300' :
                alert.type === 'warning' ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 hover:border-amber-300' :
                'bg-white border-slate-200 hover:border-[#007BC4]/30 hover:bg-[#007BC4]/5'
              }`}
            >
              <div className={`absolute top-0 left-0 w-1 h-full opacity-50 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-transparent via-current to-transparent ${alert.type === 'security' ? 'text-rose-500' : alert.type === 'warning' ? 'text-amber-500' : 'text-[#007BC4]'}`} />
              <div className="flex items-start gap-3">
                <div className="mt-1 flex-shrink-0">
                  {alert.type === 'security' && <AlertCircle className="w-5 h-5 text-rose-500" />}
                  {alert.type === 'warning' && <FileWarning className="w-5 h-5 text-amber-500" />}
                  {alert.type === 'info' && <Info className="w-5 h-5 text-[#007BC4]" />}
                </div>
                <div className="flex flex-col flex-1 gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={`text-[10px] scale-90 md:scale-100 origin-left border-0 rounded px-1.5 py-0.5 shadow-sm font-bold uppercase tracking-wider ${
                       alert.type === 'security' ? 'bg-rose-100 text-rose-700' :
                       alert.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                       'bg-[#007BC4]/10 text-[#007BC4]'
                    }`}>
                      {alert.type}
                    </Badge>
                    <span className="text-[10px] font-medium text-slate-500 font-mono">
                      {alert.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 leading-snug mt-1">
                    {alert.message}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {alerts.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-4">
            <Info className="w-8 h-8 opacity-50" />
            <p className="text-sm">No construction site safety alerts or events detected yet.</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
