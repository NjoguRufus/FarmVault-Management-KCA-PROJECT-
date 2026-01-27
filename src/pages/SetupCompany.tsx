import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, Wrench } from 'lucide-react';
import { registerCompanyAdmin } from '@/services/authService';
import { createCompany, createCompanyUserProfile } from '@/services/companyService';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function SetupCompany() {
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // 1. Create admin auth user
      const user = await registerCompanyAdmin(adminEmail, password);

      // 2. Create company
      const companyId = await createCompany(companyName, companyEmail);

      // 3. Create user profile linked to company
      await createCompanyUserProfile({
        uid: user.uid,
        companyId,
        name: adminName,
        email: adminEmail,
      });

      // 4. Redirect to dashboard
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Failed to create company account');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeveloper = async () => {
    setDevError(null);
    setDevLoading(true);
    try {
      const email = window.prompt('Developer email (for super admin login)');
      const password = window.prompt('Developer password');
      if (!email || !password) {
        setDevLoading(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      await setDoc(doc(db, 'users', uid), {
        companyId: null,
        name: 'System Developer',
        email,
        role: 'developer',
        createdAt: serverTimestamp(),
      });

      alert('Developer super admin account created. You can now log in with these credentials.');
    } catch (err: any) {
      setDevError(err?.message || 'Failed to create developer account');
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-950 via-background to-emerald-900 px-4">
      <div className="w-full max-w-xl">
        <div className="fv-card shadow-2xl border border-emerald-800/60 bg-card/95 backdrop-blur-xl">
          <div className="flex flex-col items-center gap-3 mb-6 text-center">
            <div className="flex items-center gap-3">
              <img
                src="/Logo/FarmVault_Logo dark mode.png"
                alt="FarmVault logo"
                className="h-10 w-auto rounded-md object-contain"
              />
              <span className="text-xs uppercase tracking-wide text-emerald-200/80">
                FarmVault Management Setup
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Create your company account
            </h1>
            <p className="text-sm text-muted-foreground max-w-md">
              This wizard creates a new FarmVault space for your agribusiness and the first
              Company Admin who will manage users and data.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company details */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
                <Building2 className="h-3 w-3" />
                Company details
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Company Name</label>
                  <input
                    className="fv-input"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    placeholder="GreenField Farms Ltd"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Company Email</label>
                  <input
                    type="email"
                    className="fv-input"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    required
                    placeholder="info@greenfieldfarms.com"
                  />
                </div>
              </div>
            </div>

            {/* Admin account */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
                <ShieldCheck className="h-3 w-3" />
                Company Admin
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Admin Full Name</label>
                  <input
                    className="fv-input"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    required
                    placeholder="James Mwangi"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Admin Email</label>
                  <input
                    type="email"
                    className="fv-input"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                    placeholder="admin@greenfieldfarms.com"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Password</label>
                    <input
                      type="password"
                      className="fv-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Confirm Password</label>
                    <input
                      type="password"
                      className="fv-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="fv-btn fv-btn--primary w-full"
            >
              {loading ? 'Creating company...' : 'Create Company Account'}
            </button>

            <p className="text-[11px] text-muted-foreground text-center">
              By continuing you create a new FarmVault tenant. You can invite additional users
              later from the admin settings.
            </p>

            <div className="pt-4 mt-2 border-t border-border/40 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wrench className="h-3 w-3" />
                  <span>Developer tools</span>
                </div>
                <button
                  type="button"
                  onClick={handleCreateDeveloper}
                  disabled={devLoading}
                  className="fv-btn fv-btn--secondary text-xs px-3 py-1 h-auto"
                >
                  {devLoading ? 'Creating…' : 'Create Developer Account'}
                </button>
              </div>
              {devError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                  {devError}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Temporary: creates a global super admin (role `developer`) for system-wide
                management and a personalized sidebar.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

