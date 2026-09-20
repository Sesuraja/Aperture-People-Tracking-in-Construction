import React, { useState, useEffect } from 'react';
import { X, User, Mail, Shield, Key, LogOut, Edit3, Check, Loader2, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { safeStorage } from '../lib/safeStorage';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onUserUpdated?: (user: any) => void;
}

export default function ProfileModal({ isOpen, onClose, onLogout, onUserUpdated }: ProfileModalProps) {
  const [me, setMe] = useState<{ id?: string; email?: string; name?: string; role?: string; organizationId?: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Edit form state
  const [editName, setEditName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Feedback state
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadProfile = () => {
    const token = safeStorage.getItem('gao_jwt_token') || (typeof window !== 'undefined' ? localStorage.getItem('gao_jwt_token') : null);
    if (token) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data?.user) {
            setMe(data.user);
            setEditName(data.user.name || '');
          }
        })
        .catch(err => console.warn('Failed to load profile user:', err));
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsEditing(false);
      setErrorMessage('');
      setSuccessMessage('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      loadProfile();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const email = me?.email || '';
  const role = me?.role || 'admin';
  const displayName = me?.name || (email ? email.split('@')[0] : 'User');
  const initial = (displayName || 'U').charAt(0).toUpperCase();

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (newPassword) {
      if (newPassword.length < 6) {
        setErrorMessage('New password must be at least 6 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage('New passwords do not match.');
        return;
      }
      if (!currentPassword) {
        setErrorMessage('Current password is required to change password.');
        return;
      }
    }

    setIsLoading(true);

    try {
      const token = safeStorage.getItem('gao_jwt_token') || localStorage.getItem('gao_jwt_token');
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editName.trim(),
          ...(newPassword ? { currentPassword, newPassword } : {})
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      if (data.token) {
        safeStorage.setItem('gao_jwt_token', data.token);
        try { localStorage.setItem('gao_jwt_token', data.token); } catch {}
      }

      if (data.user) {
        setMe(data.user);
        setEditName(data.user.name || '');
        if (onUserUpdated) onUserUpdated(data.user);
      }

      setSuccessMessage('Profile updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsEditing(false);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gao_user_updated', { detail: data.user }));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error updating profile');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-[#007BC4] to-[#005a91] p-6 relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 p-1.5 rounded-full transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 border-4 border-white/30 flex items-center justify-center text-2xl font-black text-[#007BC4] shadow-md uppercase shrink-0">
              {initial}
            </div>
            <div className="flex flex-col min-w-0 pr-6">
              <h2 className="text-xl font-bold text-white tracking-tight truncate">{displayName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-white/90 bg-white/20 px-2.5 py-0.5 rounded-md inline-block border border-white/25 capitalize shadow-xs">
                  {role}
                </span>
                <span className="text-xs text-white/75 truncate">{email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab / Mode Bar */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 px-6 py-2.5 justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {isEditing ? 'Edit Profile & Credentials' : 'Account Overview'}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsEditing(!isEditing);
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#007BC4] hover:bg-blue-50 dark:hover:bg-blue-950/40 transition shadow-2xs cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            {isEditing ? 'View Info' : 'Edit Profile'}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col gap-5">

          {/* Alerts */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {isEditing ? (
            /* EDIT FORM */
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Full Name / Display Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] transition"
                    placeholder="Your Name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Email Address (Read-only)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    disabled
                    value={email}
                    className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-xl pl-9 pr-3 py-2 text-sm cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2.5">
                  <Lock className="w-3.5 h-3.5 text-[#007BC4]" />
                  Change Password (Leave blank to keep unchanged)
                </span>

                <div className="space-y-2.5">
                  <div>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-[#007BC4] transition"
                      placeholder="Current Password (required to change)"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-[#007BC4] transition"
                      placeholder="New Password (min 6 chars)"
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-[#007BC4] transition"
                      placeholder="Confirm New Password"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 rounded-xl bg-[#007BC4] text-white text-sm font-semibold hover:bg-[#0064A0] transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-70"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            /* VIEW DETAILS */
            <div className="space-y-3.5">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-[#007BC4] rounded-lg shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Display Name</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-[#007BC4] rounded-lg shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Email Address</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{email || 'Not Configured'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-[#007BC4] rounded-lg shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Assigned Role</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white capitalize">{role} Access</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-[#007BC4] rounded-lg shrink-0">
                  <Key className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Security Engine</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">JWT + MongoDB Atlas Protected Session</span>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <button 
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition cursor-pointer shadow-2xs"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
