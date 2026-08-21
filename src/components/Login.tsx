import React, { useState } from 'react';
import { db, doc, setDoc } from '../lib/db';
import { ShieldAlert, PlayCircle, Loader2, Mail, Lock, User, Shield, LogIn, UserPlus } from 'lucide-react';
import ApertureLogo, { ApertureLogoMark } from './ApertureLogo';

interface LoginProps {
  onLoginSuccess: (mode: 'real' | 'demo') => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'operator'>('admin');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleDemoAccess = () => {
    localStorage.setItem('gao_app_mode', 'demo');
    onLoginSuccess('demo');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }

        const apiRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name: fullName, role })
        });
        const apiData = await apiRes.json();
        if (!apiRes.ok || !apiData.token) {
          throw new Error(apiData.error || 'Registration failed');
        }

        localStorage.setItem('gao_jwt_token', apiData.token);
        const userId = apiData.user?.id || `usr_${Date.now()}`;

        // Store user role and metadata in MongoDB settings collection
        await setDoc(doc(db, 'settings', `user_role_${userId}`), {
          uid: userId,
          email: email,
          displayName: fullName.trim() || (email || "").split('@')[0],
          role: role,
          createdAt: new Date().toISOString()
        }, { merge: true });

      } else {
        const apiRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const apiData = await apiRes.json();
        if (!apiRes.ok || !apiData.token) {
          throw new Error(apiData.error || 'Invalid email or password');
        }

        localStorage.setItem('gao_jwt_token', apiData.token);
      }
      onLoginSuccess('real');
    } catch (err: any) {
      console.error('Backend Auth Error:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        
{/* Enterprise Brand Header */}
<div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-8 py-9 text-center border-b border-blue-900/50">

  {/* Background Decoration */}
  <div className="absolute inset-0 opacity-15">
    <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-blue-500 blur-2xl"></div>
    <div className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full bg-sky-500 blur-2xl"></div>
  </div>

  {/* Official Logo Banner */}
  <div className="relative flex justify-center mb-4">
    <div className="bg-white/95 backdrop-blur-md px-6 py-3.5 rounded-2xl shadow-xl border border-white/40 inline-flex items-center justify-center">
      <ApertureLogo variant="stacked" size="md" theme="light" showSubtitle={false} />
    </div>
  </div>

  {/* Product Title */}
  <h2 className="relative text-lg font-extrabold text-white tracking-tight">
    People Tracking in Construction
  </h2>

  {/* Tagline */}
  <p className="relative mt-1 text-xs text-sky-200/80 max-w-xs mx-auto leading-relaxed">
    Enterprise RFID Workforce Tracking, Live Location Monitoring & AI Safety Telemetry
  </p>

</div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setError(''); }}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition ${
              !isSignUp 
                ? 'bg-white text-[#007BC4] border-b-2 border-[#007BC4]' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(true); setError(''); }}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition ${
              isSignUp 
                ? 'bg-white text-[#007BC4] border-b-2 border-[#007BC4]' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Create Account
          </button>
        </div>

        {/* Form Body */}
        <div className="p-8">
          <form onSubmit={handleAuth} className="space-y-4">
            
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    required={isSignUp}
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] transition"
                    placeholder="John Doe"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] transition"
                  placeholder="admin@domain.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] transition"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>

            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Access Role
                </label>
                <select
                  value={role}
                  onChange={(e: any) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-4 py-2 text-sm outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4] transition"
                >
                  <option value="admin">Administrator (Full Access)</option>
                  <option value="manager">Manager (Operations & Analytics)</option>
                  <option value="operator">Operator (Live Tracking & Attendance)</option>
                </select>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-start gap-2 text-sm">
                <ShieldAlert className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-[#007BC4] text-white rounded-lg px-4 py-2.5 font-semibold hover:bg-[#0064A0] transition disabled:opacity-70 flex justify-center items-center gap-2 shadow-sm cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus className="w-5 h-5" />
                  Create Aperture Account
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Sign In with Aperture
                </>
              )}
            </button>

            {!isSignUp && (
              <button
                type="button"
                onClick={handleDemoAccess}
                className="w-full mt-2 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <PlayCircle className="w-4 h-4 text-emerald-600" />
                <span>Quick Access via Demo Sandbox Mode</span>
              </button>
            )}
          </form>

          {/* MongoDB Authentication Footnote */}
          <div className="mt-6 text-center">
            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 font-medium">
              <Shield className="w-3.5 h-3.5 text-sky-600" />
              <span>Secured via Enterprise MongoDB Database & JWT Session</span>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

