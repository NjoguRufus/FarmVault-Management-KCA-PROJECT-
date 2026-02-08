import React, { useState } from 'react';
import { ScrollText, Shield, Loader2, PlusCircle, Package } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuditLogs, createAuditLog } from '@/services/auditLogService';
import { getInventoryAuditLogs } from '@/services/inventoryAuditLogService';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function AdminAuditLogsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [tab, setTab] = useState<'platform' | 'inventory'>('platform');

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => getAuditLogs(200),
  });

  const { data: inventoryLogs = [], isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory-audit-logs'],
    queryFn: () => getInventoryAuditLogs(200),
  });

  const recordTestAction = async () => {
    if (!user) return;
    setRecording(true);
    try {
      await createAuditLog({
        actorEmail: user.email ?? '',
        actorUid: user.id,
        actionType: 'TEST_ACTION',
        targetType: 'SYSTEM',
        targetId: 'audit-logs-page',
        metadata: { note: 'Test entry from Audit Logs page' },
      });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    } finally {
      setRecording(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            Audit Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Who did what and when: platform and inventory actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setTab('platform')}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', tab === 'platform' ? 'bg-background shadow' : 'text-muted-foreground')}
            >
              Platform
            </button>
            <button
              type="button"
              onClick={() => setTab('inventory')}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium flex items-center gap-1', tab === 'inventory' ? 'bg-background shadow' : 'text-muted-foreground')}
            >
              <Package className="h-3.5 w-3.5" />
              Inventory
            </button>
          </div>
          <button
            type="button"
            onClick={recordTestAction}
            disabled={recording}
            className="fv-btn fv-btn--secondary text-sm"
          >
            {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            Record test action
          </button>
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1 text-xs text-primary bg-primary/5">
            <Shield className="h-3 w-3" />
            Security & Compliance
          </span>
        </div>
      </div>

      <div className="fv-card">
        {tab === 'platform' && (
          <>
            {isLoading && (
              <p className="text-sm text-muted-foreground mb-4">Loading audit logs…</p>
            )}
            {error && (
              <p className="text-sm text-destructive mb-4">
                Failed to load audit logs. Check that you are signed in as a developer and that Firestore rules allow read on <code>auditLogs</code>.
              </p>
            )}
            {!isLoading && !error && logs.length === 0 && (
              <div className="py-6">
                <p className="text-sm text-muted-foreground mb-3">
                  No platform audit logs yet. Developer actions will appear here once logged.
                </p>
                <p className="text-xs text-muted-foreground">
                  Click &quot;Record test action&quot; above to add a sample entry.
                </p>
              </div>
            )}
            {!isLoading && logs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="fv-table">
                  <thead>
                    <tr>
                      <th>Date &amp; time</th>
                      <th>Who</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Target ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap text-muted-foreground">
                          {log.createdAt.toLocaleString()}
                        </td>
                        <td>
                          <span className="font-medium">{log.actorEmail}</span>
                          <span className="text-xs text-muted-foreground block">{log.actorUid}</span>
                        </td>
                        <td className="capitalize">{log.actionType.replace(/_/g, ' ')}</td>
                        <td>{log.targetType}</td>
                        <td className="font-mono text-xs">{log.targetId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {tab === 'inventory' && (
          <>
            {inventoryLoading && (
              <p className="text-sm text-muted-foreground mb-4">Loading inventory audit logs…</p>
            )}
            {!inventoryLoading && inventoryLogs.length === 0 && (
              <div className="py-6">
                <p className="text-sm text-muted-foreground">
                  No inventory actions yet. Restock, deduct, and delete actions will appear here with who did it and when.
                </p>
              </div>
            )}
            {!inventoryLoading && inventoryLogs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="fv-table">
                  <thead>
                    <tr>
                      <th>Date &amp; time</th>
                      <th>Who</th>
                      <th>Action</th>
                      <th>Item</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap text-muted-foreground">
                          {log.createdAt.toLocaleString()}
                        </td>
                        <td>
                          <span className="font-medium">{log.actorName || log.actorEmail}</span>
                          <span className="text-xs text-muted-foreground block">{log.actorEmail}</span>
                        </td>
                        <td>
                          <span className={cn(
                            'fv-badge text-xs',
                            log.actionType === 'DELETE' && 'bg-destructive/10 text-destructive',
                            log.actionType === 'DEDUCT' && 'bg-amber-100 text-amber-800',
                            log.actionType === 'RESTOCK' && 'bg-green-100 text-green-800',
                          )}>
                            {log.actionType}
                          </span>
                        </td>
                        <td className="font-medium">{(log.metadata as { itemName?: string })?.itemName ?? log.targetId}</td>
                        <td className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {log.metadata && typeof log.metadata === 'object' && Object.keys(log.metadata).filter(k => k !== 'itemName').length > 0
                            ? JSON.stringify(log.metadata)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
