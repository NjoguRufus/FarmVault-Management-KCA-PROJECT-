import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar as CalendarIcon, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  addDoc,
  writeBatch,
} from 'firebase/firestore';
import { arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CropStage, Project } from '@/types';
import { useProjectStages } from '@/hooks/useProjectStages';
import { generateStageTimeline } from '@/lib/cropStageConfig';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function ProjectPlanningPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const companyId = user?.companyId || null;
  const role = user?.role;
  const canEdit = role === 'company-admin' || role === 'manager';

  const { data: project, isLoading: projectLoading, refetch: refetchProject } = useQuery<Project | null>({
    queryKey: ['project', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return null;
      const ref = doc(db, 'projects', projectId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data() as any;
      if (data.companyId !== companyId) return null;
      return { id: snap.id, ...(data as Project) };
    },
  });

  const { data: stages = [], isLoading: stagesLoading, refetch: refetchStages } = useProjectStages(
    companyId,
    projectId,
  );

  const loading = projectLoading || stagesLoading;
  const today = new Date();

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0)),
    [stages],
  );

  const [plantingDateInput, setPlantingDateInput] = useState<string>('');
  const [plantingReason, setPlantingReason] = useState('');
  const [savingPlanting, setSavingPlanting] = useState(false);
  const [changePlantingModalOpen, setChangePlantingModalOpen] = useState(false);

  const seed = project?.planning?.seed;
  const [seedName, setSeedName] = useState(seed?.name ?? '');
  const [seedVariety, setSeedVariety] = useState(seed?.variety ?? '');
  const [seedSupplier, setSeedSupplier] = useState(seed?.supplier ?? '');
  const [seedBatch, setSeedBatch] = useState(seed?.batchNumber ?? '');
  const [seedReason, setSeedReason] = useState('');
  const [savingSeed, setSavingSeed] = useState(false);
  const [changeSeedModalOpen, setChangeSeedModalOpen] = useState(false);

  const expectedChallenges = project?.planning?.expectedChallenges ?? [];
  const planHistory = project?.planning?.planHistory ?? [];
  const [newChallenge, setNewChallenge] = useState('');
  const [savingChallenge, setSavingChallenge] = useState(false);

  useEffect(() => {
    if (!project?.plantingDate) {
      setPlantingDateInput('');
      return;
    }
    const raw = project.plantingDate as any;
    const dateObj: Date =
      raw && typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (!isNaN(dateObj.getTime())) {
      setPlantingDateInput(dateObj.toISOString().slice(0, 10));
    }
  }, [project?.plantingDate]);

  const handleSavePlantingDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !companyId || !projectId) return;
    if (!plantingDateInput) return;

    const newDateRaw = new Date(plantingDateInput);
    if (isNaN(newDateRaw.getTime())) return;
    const newDate = newDateRaw;

    const rawOld = project.plantingDate as any;
    const oldDate =
      rawOld && typeof rawOld.toDate === 'function'
        ? (rawOld.toDate() as Date)
        : rawOld
        ? new Date(rawOld)
        : null;
    const changed =
      !oldDate || oldDate.getTime() !== newDate.getTime();
    if (!changed) return;
    if (!plantingReason.trim()) return;

    setSavingPlanting(true);
    try {
      const projectRef = doc(db, 'projects', projectId);
      const historyEntry = {
        field: 'plantingDate',
        oldValue: oldDate && !isNaN(oldDate.getTime()) ? oldDate.toISOString() : null,
        newValue: newDate.toISOString(),
        reason: plantingReason,
        changedAt: serverTimestamp(),
        changedBy: user?.id ?? 'unknown',
      };

      await updateDoc(projectRef, {
        plantingDate: newDate,
        'planning.planHistory': arrayUnion(historyEntry),
      });

      // Recalculate stages for active + pending only
      if (project.cropType) {
        const startIndex = project.startingStageIndex ?? 0;
        const timeline = generateStageTimeline(project.cropType, newDate, startIndex);
        const byIndex = new Map<number, GeneratedStage>();
        timeline.forEach((t) => byIndex.set(t.stageIndex, t));

        const batch = writeBatch(db);
        sortedStages.forEach((s) => {
          if (!s.startDate || !s.endDate) return;
          const start = new Date(s.startDate);
          const end = new Date(s.endDate);
          const isCompleted = today > end;
          if (isCompleted) return; // preserve completed

          const updated = byIndex.get(s.stageIndex);
          if (!updated) return;

          const stageRef = doc(db, 'projectStages', s.id);
          batch.update(stageRef, {
            startDate: updated.startDate,
            endDate: updated.endDate,
            recalculated: true,
            recalculatedAt: serverTimestamp(),
            recalculationReason: 'Change of plan: planting date updated',
          });
        });
        await batch.commit();
      }

      await Promise.all([refetchProject(), refetchStages()]);
      setPlantingReason('');
      setChangePlantingModalOpen(false);
    } finally {
      setSavingPlanting(false);
    }
  };

  const handleSaveSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !companyId || !projectId) return;
    if (!seedName.trim()) return;
    if (!seedReason.trim()) return;

    setSavingSeed(true);
    try {
      const projectRef = doc(db, 'projects', projectId);
      const oldSeed = project.planning?.seed ?? {};
      const newSeed = {
        name: seedName,
        variety: seedVariety || null,
        supplier: seedSupplier || null,
        batchNumber: seedBatch || null,
      };

      const historyEntries = [];
      const fields: (keyof typeof newSeed)[] = ['name', 'variety', 'supplier', 'batchNumber'];
      for (const f of fields) {
        const oldVal = (oldSeed as any)?.[f] ?? null;
        const newVal = (newSeed as any)[f] ?? null;
        if (oldVal !== newVal) {
          historyEntries.push({
            field: `planning.seed.${f}`,
            oldValue: oldVal,
            newValue: newVal,
            reason: seedReason,
            changedAt: serverTimestamp(),
            changedBy: user?.id ?? 'unknown',
          });
        }
      }

      const update: any = {
        'planning.seed': newSeed,
      };
      if (historyEntries.length) {
        update['planning.planHistory'] = arrayUnion(...historyEntries);
      }

      await updateDoc(projectRef, update);
      await refetchProject();
      setSeedReason('');
      setChangeSeedModalOpen(false);
    } finally {
      setSavingSeed(false);
    }
  };

  const handleAddExpectedChallenge = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!project || !companyId || !projectId) return;
    if (!newChallenge.trim()) return;

    setSavingChallenge(true);
    try {
      const projectRef = doc(db, 'projects', projectId);
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description: newChallenge.trim(),
        addedAt: serverTimestamp(),
        addedBy: user?.id ?? 'unknown',
      };
      const historyEntry = {
        field: 'planning.expectedChallenges',
        oldValue: null,
        newValue: entry.description,
        reason: 'Added expected challenge',
        changedAt: serverTimestamp(),
        changedBy: user?.id ?? 'unknown',
      };
      await updateDoc(projectRef, {
        'planning.expectedChallenges': arrayUnion(entry),
        'planning.planHistory': arrayUnion(historyEntry),
      });
      await refetchProject();
      setNewChallenge('');
    } finally {
      setSavingChallenge(false);
    }
  };

  if (!companyId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">No company context available.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-sm text-muted-foreground">Loading project planning…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 animate-fade-in">
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/projects')}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <div className="fv-card flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <div>
            <h2 className="créfont-semibold text-foreground">Project not found</h2>
            <p className="text-sm text-muted-foreground">
              The requested project could not be found or you don&apos;t have access to it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (d?: any) => {
    if (!d) return '—';
    const raw = d as any;
    const dateObj: Date =
      raw && typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (isNaN(dateObj.getTime())) return '—';
    return dateObj.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const totalPlanChanges = planHistory.length;
  const totalExpectedChallenges = expectedChallenges.length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Back + warning */}
      <div className="flex flex-col gap-4">
        <button
          className="fv-btn fv-btn--secondary w-fit"
          onClick={() => navigate(`/projects/${project.id}`)}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Project
        </button>

        <div className="fv-card flex items-start gap-3 bg-amber-50/80 dark:bg-amber-900/20">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Planning mode</h2>
            <p className="text-xs text-muted-foreground">
              Changes here affect project timelines and reports. All edits are logged as immutable
              change-of-plan events.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left: forms */}
        <div className="space-y-6 xl:col-span-2">
          {/* 1️⃣ Planting Date Planning */}
          <div className="fv-card space-y-4">
            <h2 className="text-lg font-semibold">Planting Date Planning</h2>
            <p className="text-sm text-muted-foreground">
              Plan and adjust the season start date. Any change is recorded as a change of plan and
              future stages are recalculated, while completed stages are preserved.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Current planting date</label>
                  <div className="fv-input bg-muted/60 flex items-center gap-2 text-sm">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDate(project.plantingDate)}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Planned planting date</label>
                  <input
                    type="date"
                    className="fv-input"
                    disabled={!canEdit}
                    value={plantingDateInput}
                    onChange={(e) => setPlantingDateInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  disabled={!canEdit}
                  onClick={() => setChangePlantingModalOpen(true)}
                >
                  Change plan
                </button>
              </div>
            </div>

            <Dialog open={changePlantingModalOpen} onOpenChange={setChangePlantingModalOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Change planting plan</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    handleSavePlantingDate(e);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Planned planting date</label>
                    <input
                      type="date"
                      className="fv-input w-full"
                      value={plantingDateInput}
                      onChange={(e) => setPlantingDateInput(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Reason for change</label>
                    <textarea
                      className="fv-input w-full resize-none"
                      rows={3}
                      value={plantingReason}
                      onChange={(e) => setPlantingReason(e.target.value)}
                      placeholder="E.g. delayed rains, seed delivery delay, field not ready..."
                      required
                    />
                  </div>
                  <DialogFooter>
                    <button
                      type="button"
                      className="fv-btn fv-btn--secondary"
                      onClick={() => {
                        setChangePlantingModalOpen(false);
                        setPlantingReason('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="fv-btn fv-btn--primary"
                      disabled={savingPlanting}
                    >
                      {savingPlanting ? 'Saving…' : 'Save Change'}
                    </button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* 2️⃣ Seed / Variety Planning */}
          <div className="fv-card space-y-4">
            <h2 className="text-lg font-semibold">Seed & Variety Planning</h2>
            <p className="text-sm text-muted-foreground">
              Capture the exact seed, variety, supplier, and batch. This enables yield analysis and
              traceability across seasons.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Seed name</label>
                  <input
                    className="fv-input"
                    disabled={!canEdit}
                    value={seedName}
                    onChange={(e) => setSeedName(e.target.value)}
                    placeholder="e.g. Hybrid Tomato X123"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Variety</label>
                  <input
                    className="fv-input"
                    value={seedVariety}
                    onChange={(e) => setSeedVariety(e.target.value)}
                    placeholder="e.g. Indeterminate salad type"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Supplier</label>
                  <input
                    className="fv-input"
                    disabled={!canEdit}
                    value={seedSupplier}
                    onChange={(e) => setSeedSupplier(e.target.value)}
                    placeholder="e.g. SeedCo, local agrovet..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Batch / lot number</label>
                  <input
                    className="fv-input"
                    value={seedBatch}
                    onChange={(e) => setSeedBatch(e.target.value)}
                    placeholder="e.g. LOT-2026-08-1234"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  disabled={!canEdit}
                  onClick={() => setChangeSeedModalOpen(true)}
                >
                  Change plan
                </button>
              </div>
            </div>

            <Dialog open={changeSeedModalOpen} onOpenChange={setChangeSeedModalOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Change seed plan</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    handleSaveSeed(e);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Reason for change</label>
                    <textarea
                      className="fv-input w-full resize-none"
                      rows={3}
                      value={seedReason}
                      onChange={(e) => setSeedReason(e.target.value)}
                      placeholder="E.g. switching to disease-resistant variety, new supplier, trialing new hybrid..."
                      required
                    />
                  </div>
                  <DialogFooter>
                    <button
                      type="button"
                      className="fv-btn fv-btn--secondary"
                      onClick={() => {
                        setChangeSeedModalOpen(false);
                        setSeedReason('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="fv-btn fv-btn--primary"
                      disabled={savingSeed}
                    >
                      {savingSeed ? 'Saving…' : 'Save Seed Plan'}
                    </button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* 3️⃣ Pre-season / planned challenges */}
          <div className="fv-card space-y-4">
            <h2 className="text-lg font-semibold">Pre-season / Planned Challenges</h2>
            <p className="text-sm text-muted-foreground">
              Record anticipated risks such as pest pressure, late rains, or labour constraints. These
              are separate from actual season challenges and help compare plan vs reality.
            </p>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className="fv-input flex-1"
                disabled={!canEdit}
                placeholder="E.g. High whitefly pressure expected in early vegetative stage"
                value={newChallenge}
                onChange={(e) => setNewChallenge(e.target.value)}
              />
              <button
                className="fv-btn fv-btn--secondary"
                disabled={!canEdit || savingChallenge}
                onClick={handleAddExpectedChallenge}
              >
                {savingChallenge ? 'Adding…' : 'Add'}
              </button>
            </div>
            <div className="space-y-2">
              {expectedChallenges.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No pre-season challenges recorded yet.
                </p>
              )}
              {expectedChallenges.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 border border-border/60 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-foreground">{c.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Added on {formatDate(c.addedAt)} by {c.addedBy}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: summary & history */}
        <div className="space-y-6">
          {/* 4️⃣ Planning summary panel */}
          <div className="fv-card space-y-3">
            <h2 className="text-lg font-semibold">Planning Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current planting date</span>
                <span className="font-medium">{formatDate(project.plantingDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seed</span>
                <span className="font-medium">
                  {seedName || 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Variety</span>
                <span className="font-medium">
                  {seedVariety || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan changes</span>
                <span className="font-medium">{totalPlanChanges}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected challenges</span>
                <span className="font-medium">{totalExpectedChallenges}</span>
              </div>
            </div>
          </div>

          {/* 5️⃣ Planning history timeline */}
          <div className="fv-card space-y-3">
            <h2 className="text-lg font-semibold">Planning History</h2>
            {planHistory.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No change-of-plan events recorded yet. All future edits from this page will appear here.
              </p>
            )}
            {planHistory.length > 0 && (
              <div className="space-y-3 text-sm">
                {planHistory
                  .slice()
                  .reverse()
                  .map((h, idx) => (
                    <div key={idx} className="border-l border-border/60 pl-3 ml-1">
                      <p className="font-medium">
                        {h.field === 'plantingDate'
                          ? 'Changed planting date'
                          : `Changed ${h.field}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        From: <code className="px-1">{String(h.oldValue ?? '—')}</code> → To:{' '}
                        <code className="px-1">{String(h.newValue ?? '—')}</code>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Reason: {h.reason}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

