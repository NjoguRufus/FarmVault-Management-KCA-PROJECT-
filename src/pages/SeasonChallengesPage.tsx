import React, { useState } from 'react';
import { Plus, AlertTriangle, CheckCircle, Clock, MoreHorizontal } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { SeasonChallenge } from '@/types';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function SeasonChallengesPage() {
  const { activeProject } = useProject();
  const { data: allChallenges = [], isLoading } = useCollection<SeasonChallenge>('seasonChallenges', 'seasonChallenges');

  const challenges = activeProject
    ? allChallenges.filter(c => c.projectId === activeProject.id)
    : allChallenges;

  const getSeverityBadge = (severity: string) => {
    const styles: Record<string, string> = {
      high: 'bg-destructive/20 text-destructive',
      medium: 'fv-badge--warning',
      low: 'fv-badge--info',
    };
    return styles[severity] || 'bg-muted text-muted-foreground';
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      resolved: 'fv-badge--active',
      mitigating: 'fv-badge--warning',
      identified: 'bg-muted text-muted-foreground',
    };
    return styles[status] || 'bg-muted text-muted-foreground';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle className="h-5 w-5 text-fv-success" />;
      case 'mitigating':
        return <Clock className="h-5 w-5 text-fv-warning" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [saving, setSaving] = useState(false);

  const handleReportChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'seasonChallenges'), {
        title,
        description,
        severity,
        status: 'identified',
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        dateIdentified: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      setAddOpen(false);
      setTitle('');
      setDescription('');
      setSeverity('medium');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Season Challenges</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Track challenges for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'Document and manage seasonal challenges'
            )}
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <button className="fv-btn fv-btn--primary" disabled={!activeProject}>
              <Plus className="h-4 w-4" />
              Report Challenge
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report Season Challenge</DialogTitle>
            </DialogHeader>
            {!activeProject ? (
              <p className="text-sm text-muted-foreground">
                Select a project first to report a challenge.
              </p>
            ) : (
              <form onSubmit={handleReportChallenge} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Title</label>
                  <input
                    className="fv-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Description</label>
                  <textarea
                    className="fv-input resize-none"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Severity</label>
                  <select
                    className="fv-select w-full"
                    value={severity}
                    onChange={(e) =>
                      setSeverity(e.target.value as 'low' | 'medium' | 'high')
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <DialogFooter>
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="fv-btn fv-btn--primary"
                  >
                    {saving ? 'Saving…' : 'Save Challenge'}
                  </button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">High Severity</p>
            <p className="text-2xl font-bold">{challenges.filter(c => c.severity === 'high').length}</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-warning/10">
            <Clock className="h-6 w-6 text-fv-warning" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">In Progress</p>
            <p className="text-2xl font-bold">{challenges.filter(c => c.status === 'mitigating').length}</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-success/10">
            <CheckCircle className="h-6 w-6 text-fv-success" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Resolved</p>
            <p className="text-2xl font-bold">{challenges.filter(c => c.status === 'resolved').length}</p>
          </div>
        </div>
      </div>

      {/* Challenges List */}
      <div className="space-y-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading challenges…</p>
        )}
        {challenges.map((challenge) => (
          <div key={challenge.id} className="fv-card">
            <div className="flex items-start gap-4">
              <div className="shrink-0 mt-1">
                {getStatusIcon(challenge.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{challenge.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{challenge.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('fv-badge capitalize', getSeverityBadge(challenge.severity))}>
                      {challenge.severity}
                    </span>
                    <span className={cn('fv-badge capitalize', getStatusBadge(challenge.status))}>
                      {challenge.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    Identified: {new Date(challenge.dateIdentified).toLocaleDateString('en-KE', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {challenge.dateResolved && (
                    <span>
                      Resolved: {new Date(challenge.dateResolved).toLocaleDateString('en-KE', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              </div>
              <button className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}

        {challenges.length === 0 && (
          <div className="fv-card text-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Challenges Recorded</h3>
            <p className="text-sm text-muted-foreground">
              Click "Report Challenge" to document any issues affecting your crops.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
