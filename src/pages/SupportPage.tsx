import React, { useEffect, useState } from 'react';
import { HelpCircle, MessageCircle, FileText, Mail, Phone, ExternalLink, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  listCodeRedsForCompany,
  getCodeRed,
  listCodeRedMessages,
  addCodeRedMessage,
  createCodeRed,
  type CodeRedRequestData,
  type CodeRedMessageData,
} from '@/services/codeRedService';
import { format } from 'date-fns';
import { useNotifications } from '@/contexts/NotificationContext';

export default function SupportPage() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const isCompanyAdmin = user?.role === 'company-admin' || (user as any)?.role === 'company_admin';

  const [codeReds, setCodeReds] = useState<CodeRedRequestData[]>([]);
  const [loadingCodeRed, setLoadingCodeRed] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<CodeRedRequestData | null>(null);
  const [messages, setMessages] = useState<CodeRedMessageData[]>([]);
  const [newMessageBody, setNewMessageBody] = useState('');
  const [sending, setSending] = useState(false);
  const [codeRedError, setCodeRedError] = useState<string | null>(null);

  // New Code Red form (company admin only)
  const [showNewCodeRed, setShowNewCodeRed] = useState(false);
  const [newCodeRedMessage, setNewCodeRedMessage] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isCompanyAdmin || !user?.companyId) {
      setLoadingCodeRed(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await listCodeRedsForCompany(user.companyId!);
        if (!cancelled) setCodeReds(list);
      } catch (e: any) {
        if (!cancelled) setCodeRedError(e?.message || 'Failed to load Code Red');
      } finally {
        if (!cancelled) setLoadingCodeRed(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isCompanyAdmin, user?.companyId]);

  useEffect(() => {
    if (!selectedRequestId) {
      setSelectedRequest(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const req = await getCodeRed(selectedRequestId);
        if (cancelled) return;
        setSelectedRequest(req ?? null);
        if (req) {
          const msgs = await listCodeRedMessages(selectedRequestId);
          if (!cancelled) setMessages(msgs);
        }
      } catch (e: any) {
        if (!cancelled) setCodeRedError(e?.message || 'Failed to load thread');
      }
    })();
    return () => { cancelled = true; };
  }, [selectedRequestId]);

  const handleSendMessage = async () => {
    if (!selectedRequestId || !newMessageBody.trim() || !user) return;
    setSending(true);
    setCodeRedError(null);
    try {
      const role = user.role === 'company-admin' || (user as any).role === 'company_admin' ? 'company-admin' : user.role;
      await addCodeRedMessage(
        selectedRequestId,
        user.id,
        user.name || user.email || 'User',
        role,
        newMessageBody.trim()
      );
      setNewMessageBody('');
      const msgs = await listCodeRedMessages(selectedRequestId);
      setMessages(msgs);
    } catch (e: any) {
      setCodeRedError(e?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleCreateCodeRed = async () => {
    if (!user?.companyId || !newCodeRedMessage.trim()) return;
    setCreating(true);
    setCodeRedError(null);
    try {
      await createCodeRed(
        user.companyId,
        user.companyName || 'Our company',
        user.id,
        user.name || user.email || 'Admin',
        user.email || '',
        newCodeRedMessage.trim()
      );
      setNewCodeRedMessage('');
      setShowNewCodeRed(false);
      const list = await listCodeRedsForCompany(user.companyId);
      setCodeReds(list);
      addNotification({ title: 'Code Red sent', message: 'The developer has been notified.', type: 'warning' });
    } catch (e: any) {
      setCodeRedError(e?.message || 'Failed to send Code Red');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    if (ts.toDate) return format(ts.toDate(), 'PPp');
    if (ts.seconds) return format(new Date(ts.seconds * 1000), 'PPp');
    return '—';
  };

  const supportOptions = [
    {
      title: 'Documentation',
      description: 'Browse our comprehensive guides and tutorials',
      icon: <FileText className="h-6 w-6" />,
      action: 'View Docs',
      color: 'bg-primary/10 text-primary',
    },
    {
      title: 'Email Support',
      description: 'Get help from our support team via email',
      icon: <Mail className="h-6 w-6" />,
      action: 'Send Email',
      color: 'bg-fv-gold-soft text-fv-olive',
    },
    {
      title: 'Phone Support',
      description: 'Call us for immediate assistance',
      icon: <Phone className="h-6 w-6" />,
      action: 'Call Now',
      color: 'bg-fv-success/10 text-fv-success',
    },
    {
      title: 'Live Chat',
      description: 'Chat with our support agents in real-time',
      icon: <MessageCircle className="h-6 w-6" />,
      action: 'Start Chat',
      color: 'bg-fv-info/10 text-fv-info',
    },
  ];

  const faqs = [
    {
      question: 'How do I create a new project?',
      answer: 'Navigate to the Projects page and click "New Project". Fill in the required details including crop type, location, and budget.',
    },
    {
      question: 'How does the project selector work?',
      answer: 'The project selector in the top navbar allows you to switch between projects. All pages will automatically update to show data for the selected project.',
    },
    {
      question: 'Can I export my data?',
      answer: 'Yes, you can export data from the Reports page. Choose the report type and click Export to download as CSV or PDF.',
    },
    {
      question: 'How do I add team members?',
      answer: 'Go to the Employees page and click "Add Employee". You can assign roles and departments to each team member.',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Get help and find answers to your questions
        </p>
      </div>

      {/* Code Red — Company Admin only */}
      {isCompanyAdmin && (
        <div className="fv-card border-destructive/30 border">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="text-lg font-semibold text-foreground">Code Red</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            For urgent issues only (e.g. data loss, need recovery). The developer will see your request and can restore your data from a backup. Use for critical emergencies.
          </p>
          {codeRedError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
              {codeRedError}
            </div>
          )}
          {!showNewCodeRed ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowNewCodeRed(true)}
                className="fv-btn fv-btn--primary bg-destructive/90 hover:bg-destructive"
              >
                <AlertTriangle className="h-4 w-4" />
                Send Code Red
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                placeholder="Describe the urgent issue (e.g. we lost our data, need recovery…)"
                value={newCodeRedMessage}
                onChange={(e) => setNewCodeRedMessage(e.target.value)}
                className="fv-input min-h-[80px] w-full"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={creating || !newCodeRedMessage.trim()}
                  onClick={handleCreateCodeRed}
                  className="fv-btn fv-btn--primary bg-destructive/90 hover:bg-destructive"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Code Red
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewCodeRed(false); setNewCodeRedMessage(''); }}
                  className="fv-btn fv-btn--ghost"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loadingCodeRed ? (
            <p className="text-sm text-muted-foreground mt-4 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : codeReds.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <h4 className="text-sm font-medium text-foreground mb-2">Your Code Red requests</h4>
              <div className="space-y-2">
                {codeReds.map((r) => (
                  <div key={r.id} className="rounded-lg bg-muted/30 p-3">
                    <button
                      type="button"
                      onClick={() => setSelectedRequestId(selectedRequestId === r.id ? null : r.id)}
                      className="w-full text-left font-medium text-foreground"
                    >
                      {r.message.slice(0, 80)}{r.message.length > 80 ? '…' : ''} · {r.status} · {formatDate(r.updatedAt)}
                    </button>
                    {selectedRequestId === r.id && selectedRequest && (
                      <div className="mt-3 space-y-2">
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {messages.map((m) => (
                            <div
                              key={m.id}
                              className={`p-2 rounded text-sm ${
                                m.fromRole === 'developer' ? 'bg-primary/10' : 'bg-muted/50'
                              }`}
                            >
                              <span className="font-medium">{m.fromName}</span>
                              <span className="text-xs text-muted-foreground ml-1">({m.fromRole})</span>
                              <p className="mt-0.5">{m.body}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(m.createdAt)}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Reply…"
                            value={newMessageBody}
                            onChange={(e) => setNewMessageBody(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            className="fv-input flex-1"
                          />
                          <button
                            type="button"
                            disabled={sending || !newMessageBody.trim()}
                            onClick={handleSendMessage}
                            className="fv-btn fv-btn--primary"
                          >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Support Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {supportOptions.map((option) => (
          <div key={option.title} className="fv-card hover:shadow-card-hover transition-shadow">
            <div className="flex items-start gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${option.color}`}>
                {option.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">{option.title}</h3>
                <p className="text-sm text-muted-foreground">{option.description}</p>
              </div>
              <button className="fv-btn fv-btn--secondary text-sm">
                {option.action}
                <ExternalLink className="h-3 w-3 ml-1" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* FAQs */}
      <div className="fv-card">
        <div className="flex items-center gap-2 mb-6">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Frequently Asked Questions</h3>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium text-foreground mb-2">{faq.question}</h4>
              <p className="text-sm text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Info */}
      <div className="fv-card">
        <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">support@farmvault.com</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">+254 700 123 456</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
