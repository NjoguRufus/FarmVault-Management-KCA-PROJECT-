import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Building2, AlertTriangle, Trash2, Loader2, Lock, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { deleteAllCompanyData } from '@/services/companyDataService';
import { updateCompany } from '@/services/companyService';
import { useNotifications } from '@/contexts/NotificationContext';

const PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'inactive', label: 'Inactive' },
] as const;

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const deletePasswordRequired = import.meta.env.VITE_COMPANY_DELETE_PASSWORD ?? '';

  const isCompanyAdmin = user?.role === 'company-admin' || (user as any)?.role === 'company_admin';
  const companyId = user?.companyId ?? null;

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['company', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return null;
      const snap = await getDoc(doc(db, 'companies', companyId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as { id: string; name?: string; email?: string; status?: string; plan?: string };
    },
  });

  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPlan, setEditPlan] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('');

  useEffect(() => {
    if (company) {
      setEditName(company.name ?? '');
      setEditEmail(company.email ?? '');
      setEditPlan(company.plan ?? 'starter');
      setEditStatus(company.status ?? 'active');
    }
  }, [company]);

  const handleSaveCompany = async () => {
    if (!companyId || !isCompanyAdmin) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateCompany(companyId, {
        name: editName || undefined,
        email: editEmail || undefined,
        plan: editPlan || undefined,
        status: editStatus || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      addNotification({ title: 'Company updated', message: 'Your company details have been saved.', type: 'success' });
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEverything = async () => {
    if (!companyId || !isCompanyAdmin) return;
    if (deleteConfirm !== 'DELETE') return;
    if (deletePasswordRequired && deletePassword !== deletePasswordRequired) {
      setDeleteError('Incorrect password');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAllCompanyData(companyId);
      setDeleteConfirm('');
      setDeletePassword('');
      addNotification({ title: 'Company data deleted', message: 'All company data has been removed.', type: 'warning' });
      alert('All company data has been deleted. You can continue using the app with a clean slate.');
      window.location.reload();
    } catch (e: any) {
      setDeleteError(e?.message || 'Failed to delete data');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edit your company details and preferences
        </p>
      </div>

      {/* Company settings - editable */}
      <div className="fv-card">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Company</h3>
        </div>
        {companyLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : company && isCompanyAdmin ? (
          <div className="space-y-4">
            {saveError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {saveError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Company name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="fv-input w-full"
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Company email</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="fv-input w-full"
                placeholder="company@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Plan</label>
              <select
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
                className="fv-input w-full"
              >
                {PLANS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="fv-input w-full"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveCompany}
              className="fv-btn fv-btn--primary"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-1">Save changes</span>
            </button>
          </div>
        ) : company ? (
          <dl className="space-y-2 text-sm">
            <div><dt className="text-muted-foreground">Company name</dt><dd className="font-medium text-foreground">{company.name ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Company email</dt><dd className="font-medium text-foreground">{company.email ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Plan</dt><dd className="font-medium text-foreground capitalize">{company.plan ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium text-foreground capitalize">{company.status ?? '—'}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No company data found.</p>
        )}
      </div>

      {/* Danger zone */}
      {isCompanyAdmin && companyId && (
        <div className="fv-card border-destructive/40 border">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="text-lg font-semibold text-destructive">Danger zone</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Permanently delete all data for your company: projects, harvests, sales, expenses, inventory,
            employees, and all other records. Your company account and user accounts will remain so you can
            log in again. This cannot be undone.
          </p>
          {deleteError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
              {deleteError}
            </div>
          )}
          <div className="space-y-3 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-foreground mb-1">
                Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => { setDeleteConfirm(e.target.value); setDeleteError(null); }}
                placeholder="DELETE"
                className="fv-input border-destructive/50"
                disabled={deleting}
              />
            </div>
            {deletePasswordRequired && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-foreground mb-1">
                  <Lock className="h-3.5 w-3.5 inline mr-1" />
                  Password required to delete
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }}
                  placeholder="Enter password"
                  className="fv-input border-destructive/50"
                  disabled={deleting}
                />
              </div>
            )}
            <button
              type="button"
              disabled={deleting || deleteConfirm !== 'DELETE' || (!!deletePasswordRequired && deletePassword !== deletePasswordRequired)}
              onClick={handleDeleteEverything}
              className="fv-btn bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="ml-1">Delete everything</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
