import React, { useEffect, useState } from 'react';
import { AlertTriangle, MessageSquare, Send, RotateCcw, Loader2, X } from 'lucide-react';
import {
  listAllCodeReds,
  getCodeRed,
  listCodeRedMessages,
  addCodeRedMessage,
  updateCodeRedStatus,
  type CodeRedRequestData,
  type CodeRedMessageData,
} from '@/services/codeRedService';
import {
  listCompanyBackups,
  restoreCompanyFromBackup,
} from '@/services/backupService';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

export default function AdminCodeRedPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CodeRedRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<CodeRedRequestData | null>(null);
  const [messages, setMessages] = useState<CodeRedMessageData[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const list = await listAllCodeReds();
      setRequests(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load Code Red requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedRequest(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const req = await getCodeRed(selectedId);
        if (cancelled) return;
        setSelectedRequest(req ?? null);
        if (req) {
          const msgs = await listCodeRedMessages(selectedId);
          if (!cancelled) setMessages(msgs);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load thread');
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const handleSendReply = async () => {
    if (!selectedId || !replyBody.trim() || !user) return;
    setSending(true);
    setError(null);
    try {
      await addCodeRedMessage(
        selectedId,
        user.id,
        user.name || 'Developer',
        'developer',
        replyBody.trim()
      );
      setReplyBody('');
      const msgs = await listCodeRedMessages(selectedId);
      setMessages(msgs);
      await loadRequests();
    } catch (e: any) {
      setError(e?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleRestoreForCompany = async (companyId: string) => {
    if (!confirm('Restore this company’s data from the latest backup? This will overwrite their current data.')) return;
    setRestoring(true);
    setError(null);
    try {
      const backups = await listCompanyBackups(companyId);
      if (backups.length === 0) {
        alert('No backups found for this company. Create a backup from the Backups page first.');
        setRestoring(false);
        return;
      }
      const latest = backups[0];
      await restoreCompanyFromBackup(companyId, latest.id);
      alert('Restore completed. The company can now see their data again.');
    } catch (e: any) {
      setError(e?.message || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const handleMarkResolved = async (requestId: string) => {
    try {
      await updateCodeRedStatus(requestId, 'resolved');
      await loadRequests();
      if (selectedId === requestId) setSelectedRequest((r) => (r ? { ...r, status: 'resolved' } : null));
    } catch (e: any) {
      setError(e?.message || 'Failed to update status');
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    if (ts.toDate) return format(ts.toDate(), 'PPp');
    if (ts.seconds) return format(new Date(ts.seconds * 1000), 'PPp');
    return '—';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Code Red
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Urgent requests from companies (e.g. data recovery). Reply here and restore their data from Backups when needed.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="fv-card lg:col-span-1">
          <h3 className="font-semibold text-foreground mb-3">Requests</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Code Red requests yet.</p>
          ) : (
            <ul className="space-y-1">
              {requests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedId === r.id ? 'bg-primary/15 text-primary' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="font-medium text-foreground truncate">{r.companyName}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.message}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(r.updatedAt)} · {r.status}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="fv-card lg:col-span-2">
          {!selectedRequest ? (
            <p className="text-sm text-muted-foreground">Select a request to view and reply.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">{selectedRequest.companyName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedRequest.requestedByName} · {formatDate(selectedRequest.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`fv-badge ${selectedRequest.status === 'open' ? 'fv-badge--warning' : 'fv-badge--active'}`}>
                    {selectedRequest.status}
                  </span>
                  {selectedRequest.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => handleMarkResolved(selectedRequest.id)}
                      className="fv-btn fv-btn--ghost text-sm"
                    >
                      Mark resolved
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 mb-4">
                <p className="text-sm text-foreground">{selectedRequest.message}</p>
              </div>

              <div className="mb-4">
                <h4 className="text-sm font-medium text-foreground mb-2">Restore company data</h4>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => handleRestoreForCompany(selectedRequest.companyId)}
                  className="fv-btn fv-btn--secondary"
                >
                  {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  <span className="ml-1">Restore from latest backup</span>
                </button>
              </div>

              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1">
                <MessageSquare className="h-4 w-4" /> Thread
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-2 rounded-lg text-sm ${
                      m.fromRole === 'developer' ? 'bg-primary/10 ml-4' : 'bg-muted/50 mr-4'
                    }`}
                  >
                    <span className="font-medium text-foreground">{m.fromName}</span>
                    <span className="text-xs text-muted-foreground ml-1">({m.fromRole})</span>
                    <p className="mt-0.5 text-foreground">{m.body}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(m.createdAt)}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Reply…"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                  className="fv-input flex-1"
                />
                <button
                  type="button"
                  disabled={sending || !replyBody.trim()}
                  onClick={handleSendReply}
                  className="fv-btn fv-btn--primary"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
