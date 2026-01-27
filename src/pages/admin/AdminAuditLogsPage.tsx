import React from 'react';
import { ScrollText, Shield } from 'lucide-react';

interface AuditLog {
  id: string;
  createdAt: Date;
  actorEmail: string;
  actorUid: string;
  actionType: string;
  targetType: 'COMPANY' | 'USER' | 'EMPLOYEE';
  targetId: string;
  metadata?: Record<string, any>;
}

// Stubbed data hook – wire to Firestore `auditLogs` later
function useAuditLogs(): { logs: AuditLog[]; loading: boolean } {
  return { logs: [], loading: false };
}

export default function AdminAuditLogsPage() {
  const { logs, loading } = useAuditLogs();

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
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1 text-xs text-primary bg-primary/5">
          <Shield className="h-3 w-3" />
          Security & Compliance
        </span>
      </div>

      <div className="fv-card">
        {loading && (
          <p className="text-sm text-muted-foreground mb-4">Loading audit logs…</p>
        )}

        {logs.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            No audit logs yet. Once you wire this to Firestore, developer actions will appear here.
          </p>
        )}
      </div>
    </div>
  );
}

