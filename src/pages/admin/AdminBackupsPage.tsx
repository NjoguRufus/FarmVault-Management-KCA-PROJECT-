import React, { useState } from 'react';
import { Database, CloudDownload, RotateCcw, ChevronDown, ChevronUp, Loader2, Eye, Lock } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { Company } from '@/types';
import {
  createCompanyBackup,
  listCompanyBackups,
  restoreCompanyFromBackup,
  getBackupSnapshot,
  type CompanyBackupSnapshot,
} from '@/services/backupService';
import { format } from 'date-fns';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const BACKUP_ACCESS_PASSWORD = import.meta.env.VITE_DEVELOPER_BACKUP_PASSWORD ?? '';

export default function AdminBackupsPage() {
  const { addNotification } = useNotifications();
  const { data: companies = [], isLoading: companiesLoading } = useCollection<Company>(
    'admin-companies',
    'companies'
  );
  const [backupsByCompany, setBackupsByCompany] = useState<
    Record<string, Array<{ id: string; companyName?: string; createdAt: any }>>
  >({});
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [loadingBackup, setLoadingBackup] = useState<string | null>(null);
  const [loadingRestore, setLoadingRestore] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewDataTarget, setViewDataTarget] = useState<{ companyId: string; companyName: string; snapshotId: string } | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPasswordError, setBackupPasswordError] = useState<string | null>(null);
  const [backupData, setBackupData] = useState<CompanyBackupSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});

  const loadBackups = async (companyId: string) => {
    setLoadingList(companyId);
    setError(null);
    try {
      const list = await listCompanyBackups(companyId);
      setBackupsByCompany((prev) => ({
        ...prev,
        [companyId]: list.map((b) => ({
          id: b.id,
          companyName: b.companyName,
          createdAt: b.createdAt,
        })),
      }));
      if (expandedCompany !== companyId) setExpandedCompany(companyId);
    } catch (e: any) {
      setError(e?.message || 'Failed to load backups');
    } finally {
      setLoadingList(null);
    }
  };

  const handleBackupNow = async (companyId: string, companyName: string) => {
    setLoadingBackup(companyId);
    setError(null);
    try {
      await createCompanyBackup(companyId, companyName);
      await loadBackups(companyId);
    } catch (e: any) {
      setError(e?.message || 'Backup failed');
    } finally {
      setLoadingBackup(null);
    }
  };

  const handleRestore = async (companyId: string, snapshotId: string) => {
    if (!confirm('Restore will overwrite this company’s current data with the backup. Continue?')) return;
    setLoadingRestore(snapshotId);
    setError(null);
    try {
      await restoreCompanyFromBackup(companyId, snapshotId);
      addNotification({ title: 'Restore completed', message: 'Company data has been restored.', type: 'success' });
      alert('Restore completed. The company can now see their data again.');
    } catch (e: any) {
      setError(e?.message || 'Restore failed');
    } finally {
      setLoadingRestore(null);
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    if (ts.toDate) return format(ts.toDate(), 'PPp');
    if (ts.seconds) return format(new Date(ts.seconds * 1000), 'PPp');
    return '—';
  };

  const handleViewData = (companyId: string, companyName: string, snapshotId: string) => {
    setViewDataTarget({ companyId, companyName, snapshotId });
    setBackupData(null);
    setBackupPassword('');
    setBackupPasswordError(null);
    setExpandedCollections({});
  };

  const handleUnlockBackup = async () => {
    if (!viewDataTarget) return;
    const required = BACKUP_ACCESS_PASSWORD;
    if (required && backupPassword !== required) {
      setBackupPasswordError('Incorrect password');
      return;
    }
    setBackupPasswordError(null);
    setLoadingSnapshot(true);
    try {
      const snapshot = await getBackupSnapshot(viewDataTarget.companyId, viewDataTarget.snapshotId);
      setBackupData(snapshot);
    } catch (e: any) {
      setBackupPasswordError(e?.message || 'Failed to load backup');
    } finally {
      setLoadingSnapshot(false);
    }
  };

  const toggleCollection = (name: string) => {
    setExpandedCollections((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Company backups
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Backup each company’s data. Only you can see and restore. If a company loses data, restore from a backup here.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {companiesLoading ? (
        <p className="text-sm text-muted-foreground">Loading companies…</p>
      ) : (
        <div className="fv-card">
          <div className="divide-y divide-border">
            {companies.map((company) => {
              const backups = backupsByCompany[company.id] ?? [];
              const isExpanded = expandedCompany === company.id;
              return (
                <div key={company.id} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => (backups.length ? setExpandedCompany(isExpanded ? null : company.id) : loadBackups(company.id))}
                        className="p-1 rounded hover:bg-muted"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <span className="font-medium text-foreground">{company.name}</span>
                      <span className="text-xs text-muted-foreground">({company.id})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={loadingBackup === company.id}
                        onClick={() => handleBackupNow(company.id, company.name)}
                        className="fv-btn fv-btn--secondary text-sm"
                      >
                        {loadingBackup === company.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CloudDownload className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline ml-1">Backup now</span>
                      </button>
                      <button
                        type="button"
                        disabled={loadingList === company.id}
                        onClick={() => loadBackups(company.id)}
                        className="fv-btn fv-btn--ghost text-sm"
                      >
                        {loadingList === company.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'View backups'
                        )}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pl-6">
                      {backups.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No backups yet. Click “Backup now” to create one.</p>
                      ) : (
                        <ul className="space-y-2">
                          {backups.map((b) => (
                            <li
                              key={b.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-muted/30 rounded-lg"
                            >
                              <span className="text-sm text-muted-foreground">
                                {formatDate(b.createdAt)}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleViewData(company.id, company.name, b.id)}
                                  className="fv-btn fv-btn--ghost text-sm"
                                >
                                  <Eye className="h-4 w-4" />
                                  <span className="ml-1">View data</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={loadingRestore === b.id}
                                  onClick={() => handleRestore(company.id, b.id)}
                                  className="fv-btn fv-btn--primary text-sm"
                                >
                                  {loadingRestore === b.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                  <span className="ml-1">Restore</span>
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View backup data modal (password + full snapshot) */}
      <Dialog open={!!viewDataTarget} onOpenChange={(open) => !open && setViewDataTarget(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Backup data {viewDataTarget ? `· ${viewDataTarget.companyName}` : ''}
            </DialogTitle>
          </DialogHeader>
          {viewDataTarget && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {!backupData ? (
                <>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Lock className="h-4 w-4" />
                      Access password
                    </label>
                    <input
                      type="password"
                      value={backupPassword}
                      onChange={(e) => { setBackupPassword(e.target.value); setBackupPasswordError(null); }}
                      placeholder={BACKUP_ACCESS_PASSWORD ? 'Enter password' : 'Optional (not configured)'}
                      className="fv-input w-full"
                      onKeyDown={(e) => e.key === 'Enter' && handleUnlockBackup()}
                    />
                    {backupPasswordError && (
                      <p className="text-sm text-destructive">{backupPasswordError}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={loadingSnapshot}
                    onClick={handleUnlockBackup}
                    className="fv-btn fv-btn--primary"
                  >
                    {loadingSnapshot ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Unlock & view data
                  </button>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {Object.entries(backupData.collections ?? {}).map(([collName, docs]) => {
                    const arr = Array.isArray(docs) ? docs : [];
                    const isExpanded = expandedCollections[collName] ?? false;
                    return (
                      <div key={collName} className="border border-border rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleCollection(collName)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted text-left text-sm font-medium"
                        >
                          <span>{collName}</span>
                          <span className="text-muted-foreground">({arr.length} docs)</span>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {isExpanded && (
                          <div className="p-3 max-h-60 overflow-y-auto bg-background">
                            <pre className="text-xs text-foreground whitespace-pre-wrap break-all">
                              {JSON.stringify(arr, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
