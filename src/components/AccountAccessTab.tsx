import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { getAuthHeaders } from '../lib/db';

type StaffUser = { id: string; name?: string; displayName?: string; email: string; role?: string; invited?: boolean; hasLoggedIn?: boolean };
const roles = ['admin', 'manager', 'operator', 'viewer'];

export default function AccountAccessTab() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operator' });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users', { headers: getAuthHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load accounts');
      setUsers(body.users || []);
    } catch (error: any) {
      setNotice(error.message || 'Unable to load accounts');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const createAccount = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setNotice('');
    try {
      const response = await fetch('/api/admin/create-user', { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not create account');
      setForm({ name: '', email: '', password: '', role: 'operator' });
      setNotice('Account created. The user can sign in with the supplied credentials.');
      await loadUsers();
    } catch (error: any) { setNotice(error.message || 'Could not create account'); }
    finally { setSaving(false); }
  };

  const updateRole = async (userId: string, role: string) => {
    setSaving(true); setNotice('');
    try {
      const response = await fetch('/api/admin/set-user-role', { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update access role');
      setUsers(current => current.map(user => user.id === userId ? { ...user, role } : user));
      setNotice('Access role updated.');
    } catch (error: any) { setNotice(error.message || 'Could not update access role'); }
    finally { setSaving(false); }
  };

  return <section className="p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-6">
    <div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Account Access</h2><p className="text-sm text-slate-500 mt-1">Create staff accounts and assign their operational access role.</p></div>
    <div className="grid lg:grid-cols-[360px_1fr] gap-6">
      <form onSubmit={createAccount} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4 h-fit">
        <div className="flex items-center gap-2"><UserPlus size={18} className="text-[#007BC4]" /><h3 className="font-semibold">Create staff account</h3></div>
        {[['name','Full name','text'],['email','Work email','email'],['password','Temporary password','password']].map(([key,label,type]) => <label key={key} className="block text-xs font-medium text-slate-600 dark:text-slate-300">{label}<input required value={(form as any)[key]} type={type} minLength={key === 'password' ? 6 : undefined} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-transparent text-sm" /></label>)}
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Access role<select value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-transparent text-sm">{roles.map(role => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}</select></label>
        <button disabled={saving} className="w-full h-10 rounded-lg bg-[#007BC4] text-white text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Create account'}</button>
      </form>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2"><Users size={18} className="text-[#007BC4]" /><h3 className="font-semibold">Staff accounts</h3></div>
        {loading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[#007BC4]" /></div> : <div className="divide-y divide-slate-100 dark:divide-slate-700">{users.map(user => <div key={user.id} className="p-4 flex flex-wrap items-center gap-3 justify-between"><div><p className="text-sm font-semibold">{user.name || user.displayName || user.email}</p><p className="text-xs text-slate-500">{user.email} · {user.hasLoggedIn ? 'Active' : 'Invitation pending'}</p></div><select aria-label={`Role for ${user.email}`} value={user.role || 'operator'} disabled={saving} onChange={e => updateRole(user.id, e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-transparent text-sm">{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></div>)}{users.length === 0 && <p className="p-8 text-sm text-slate-500">No staff accounts found.</p>}</div>}
      </div>
    </div>
    {notice && <p className="rounded-lg border border-blue-200 bg-blue-50 text-blue-800 p-3 text-sm flex gap-2"><ShieldCheck size={17}/>{notice}</p>}
  </section>;
}
