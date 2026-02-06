import React, { useState } from 'react';
import { ScrollText, Shield, Loader2, PlusCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuditLogs, createAuditLog } from '@/services/auditLogService';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminAuditLogsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => getAuditLogs(200),
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
            Read-only record of sensitive platform actions performed by developers.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
              No audit logs yet. Developer actions will appear here once logged to Firestore.
            </p>
            <p className="text-xs text-muted-foreground">
              Click &quot;Record test action&quot; above to add a sample entry and confirm the page works.
            </p>
          </div>
        )}
        {!isLoading && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Actor</th>
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
      </div>
    </div>
  );
}
