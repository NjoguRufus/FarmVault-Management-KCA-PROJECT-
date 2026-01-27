import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar as CalendarIcon, ChevronLeft, Clock, Users, Activity, Wallet, ListChecks } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CropStage, Expense, InventoryUsage, Project, SeasonChallenge, WorkLog } from '@/types';
import { useProjectStages } from '@/hooks/useProjectStages';
import { toDate, formatDate } from '@/lib/dateUtils';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';

export default function ProjectDetailsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const companyId = user?.companyId || null;

  const { data: project, isLoading: projectLoading } = useQuery<Project | null>({
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

  const { data: stages = [], isLoading: stagesLoading } = useProjectStages(companyId, projectId);

  const { data: workLogs = [] } = useQuery<WorkLog[]>({
    queryKey: ['workLogs', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return [];
      const qWork = query(
        collection(db, 'workLogs'),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
      );
      const snap = await getDocs(qWork);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as WorkLog[];
    },
  });

  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ['expenses', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return [];
      const qExp = query(
        collection(db, 'expenses'),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
      );
      const snap = await getDocs(qExp);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Expense[];
    },
  });

  const { data: challenges = [] } = useQuery<SeasonChallenge[]>({
    queryKey: ['seasonChallenges', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return [];
      const qChallenges = query(
        collection(db, 'seasonChallenges'),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
      );
      const snap = await getDocs(qChallenges);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SeasonChallenge[];
    },
  });

  const { data: inventoryUsage = [] } = useQuery<InventoryUsage[]>({
    queryKey: ['inventoryUsage', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return [];
      const qUsage = query(
        collection(db, 'inventoryUsage'),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
      );
      const snap = await getDocs(qUsage);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as InventoryUsage[];
    },
  });

  const loading = projectLoading || stagesLoading;

  const today = new Date();

  const normalizeDate = (raw: any | undefined) => toDate(raw) || undefined;

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0)),
    [stages],
  );

  const expectedHarvestDate = useMemo(() => {
    if (!sortedStages.length) return undefined;
    const last = sortedStages[sortedStages.length - 1];
    return normalizeDate(last.endDate || last.startDate);
  }, [sortedStages]);

  const plantingDate = normalizeDate(project?.plantingDate as any);

  const daysSincePlanting =
    plantingDate
      ? Math.max(
          0,
          Math.floor(
            (today.getTime() - plantingDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : undefined;

  const currentStage = useMemo(() => {
    if (!sortedStages.length) return null;
    const active = sortedStages.find((s) => {
      if (!s.startDate || !s.endDate) return false;
      const start = normalizeDate(s.startDate as any);
      const end = normalizeDate(s.endDate as any);
      if (!start || !end) return false;
      return today >= start && today <= end;
    });
    if (active) return active;
    const completed = sortedStages.filter((s) => s.endDate && today > new Date(s.endDate));
    if (completed.length) {
      return completed[completed.length - 1];
    }
    return sortedStages[0];
  }, [sortedStages, today]);

  const stageProgressPercent = useMemo(() => {
    if (!currentStage || !currentStage.startDate || !currentStage.endDate) return 0;
    const startDate = normalizeDate(currentStage.startDate as any);
    const endDate = normalizeDate(currentStage.endDate as any);
    if (!startDate || !endDate) return 0;
    const start = startDate.getTime();
    const end = endDate.getTime();
    const total = end - start;
    if (total <= 0) return 0;
    const elapsed = Math.min(Math.max(today.getTime() - start, 0), total);
    return Math.round((elapsed / total) * 100);
  }, [currentStage, today]);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const labourCost = expenses.filter((e) => e.category === 'labour').reduce((s, e) => s + e.amount, 0);
  const inputCost = expenses
    .filter((e) => ['fertilizer', 'chemical', 'fuel'].includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const avgDailyCost =
    daysSincePlanting && daysSincePlanting > 0 ? Math.round(totalExpenses / daysSincePlanting) : 0;

  const totalPeopleDays = workLogs.reduce(
    (sum, w) => sum + (w.numberOfPeople || 0),
    0,
  );
  const derivedLabourCost = workLogs.reduce(
    (sum, w) => sum + (w.numberOfPeople || 0) * (w.ratePerPerson || 0),
    0,
  );

  const workLogsByCategory = workLogs.reduce<Record<string, number>>((acc, w) => {
    const key = w.workCategory || 'Other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const inventoryUsageByItem = inventoryUsage.reduce<Record<string, { quantity: number; unit: string; category: string }>>(
    (acc, u) => {
      const key = u.inventoryItemId;
      if (!acc[key]) {
        acc[key] = { quantity: 0, unit: u.unit, category: u.category };
      }
      acc[key].quantity += u.quantity;
      return acc;
    },
    {},
  );

  const expensesByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const [mode, setMode] = useState<'overview' | 'planning'>('overview');
  const [savingPlan, setSavingPlan] = useState(false);

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
        <p className="text-sm text-muted-foreground">Loading project details…</p>
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
            <h2 className="font-semibold text-foreground">Project not found</h2>
            <p className="text-sm text-muted-foreground">
              The requested project could not be found or you don&apos;t have access to it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Back + Header Strip */}
      <div className="flex flex-col gap-4">
        <button
          className="fv-btn fv-btn--secondary w-fit"
          onClick={() => navigate('/projects')}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Projects
        </button>

        {/* Project summary strip */}
        <div className="fv-card flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              <span className="fv-badge capitalize">
                {project.cropType.replace('-', ' ')}
              </span>
              <span className="fv-badge capitalize">
                {project.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
              {project.plantingDate && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-4 w-4" />
                  Planted{' '}
                  {formatDate(project.plantingDate)}
                </span>
              )}
              {expectedHarvestDate && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-4 w-4" />
                  Expected harvest{' '}
                  {formatDate(expectedHarvestDate)}
                </span>
              )}
            </div>
          </div>

          </div>

          {/* Metrics cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
            <SimpleStatCard
              title="Days since planting"
              value={Number.isFinite(daysSincePlanting as any) ? daysSincePlanting : '—'}
              layout="vertical"
            />
            <SimpleStatCard
              title="Current stage"
              value={currentStage?.stageName ?? 'Not started'}
              layout="vertical"
            />
            <SimpleStatCard
              title="Stage progress"
              value={`${stageProgressPercent}%`}
              layout="vertical"
            />
            <SimpleStatCard
              title="Total expenses"
              value={formatCurrency(totalExpenses)}
              layout="vertical"
            />
          </div>
        </div>
      </div>

      {/* 2️⃣ Crop stage timeline */}
      <div className="fv-card">
        <h2 className="text-lg font-semibold mb-4">Crop Stage Timeline</h2>
        {!sortedStages.length && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            No stages generated for this project yet.
          </div>
        )}
        <div className="space-y-4">
                    {sortedStages.map((stage, index) => {
                    const start = normalizeDate(stage.startDate as any) || null;
                    const end = normalizeDate(stage.endDate as any) || null;
            let derivedStatus: 'pending' | 'active' | 'completed' = 'pending';
            if (start && end) {
              if (today < start) derivedStatus = 'pending';
              else if (today > end) derivedStatus = 'completed';
              else derivedStatus = 'active';
            }
            const diffDays =
              start && end
                ? Math.max(
                    1,
                    Math.round(
                      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
                    ) + 1,
                  )
                : undefined;
            return (
              <div
                key={stage.id}
                className="flex items-start gap-4"
              >
                <div className="flex flex-col items-center">
                  <div
                    className={[
                      'flex h-10 w-10 items-center justify-center rounded-full border-2',
                      derivedStatus === 'completed' && 'border-fv-success bg-fv-success/10',
                      derivedStatus === 'active' && 'border-fv-warning bg-fv-warning/10',
                      derivedStatus === 'pending' && 'border-muted bg-muted',
                    ].join(' ')}
                  >
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {index < sortedStages.length - 1 && (
                    <div className="w-0.5 h-8 mt-2 bg-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-4 border-b last:border-b-0 border-border/60">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground">{stage.stageName}</h3>
                    <span className="fv-badge text-xs capitalize">
                      {derivedStatus}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-3">
                    {start && end && (
                      <span>
                        {formatDate(start, { month: 'short', day: 'numeric' })} –{' '}
                        {formatDate(end, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {diffDays && <span>{diffDays} days</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3️⃣ Season Challenges */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Season Challenges</h2>
        </div>
        {!challenges.length && (
          <div className="fv-card flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            No challenges recorded yet.
          </div>
        )}
        {!!challenges.length && (
          <div className="space-y-3">
            {challenges.map((c) => {
              const stage = sortedStages.find((s) => s.stageIndex === (c as any).stageIndex);
              const stageStart = stage?.startDate ? normalizeDate(stage.startDate as any) : null;
              const seasonStart = plantingDate;
              const challengeDate = c.dateIdentified ? normalizeDate(c.dateIdentified as any) : null;

              const dayInStage =
                stageStart && challengeDate
                  ? Math.max(
                      1,
                      Math.round(
                        (challengeDate.getTime() - stageStart.getTime()) /
                          (1000 * 60 * 60 * 24),
                      ) + 1,
                    )
                  : undefined;

              const dayInSeason =
                seasonStart && challengeDate
                  ? Math.max(
                      1,
                      Math.round(
                        (challengeDate.getTime() - seasonStart.getTime()) /
                          (1000 * 60 * 60 * 24),
                      ) + 1,
                    )
                  : undefined;

              return (
                <div key={c.id} className="fv-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{c.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{c.description}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {stage && (
                          <span>
                            Stage: <span className="font-medium">{stage.stageName}</span>
                          </span>
                        )}
                        {dayInStage && (
                          <span>
                            Day {dayInStage} of stage
                          </span>
                        )}
                        {dayInSeason && (
                          <span>
                            Day {dayInSeason} of season
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="fv-badge text-xs capitalize">
                        {c.severity}
                      </span>
                      <span className="fv-badge text-xs capitalize">
                        {c.status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4️⃣ Operations Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Work logs */}
        <div className="fv-card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Work Logs
          </h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total work logs</span>
              <span className="font-medium">{workLogs.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total people-days</span>
              <span className="font-medium">{totalPeopleDays}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Derived labour cost</span>
              <span className="font-medium">{formatCurrency(derivedLabourCost)}</span>
            </div>
          </div>
          {Object.keys(workLogsByCategory).length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                By work type
              </p>
              <div className="space-y-1 text-xs">
                {Object.entries(workLogsByCategory).map(([key, count]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-muted-foreground truncate mr-2">{key}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Inventory usage */}
        <div className="fv-card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Inventory Usage
          </h2>
          {!Object.keys(inventoryUsageByItem).length && (
            <p className="text-sm text-muted-foreground">No inventory usage recorded yet.</p>
          )}
          {!!Object.keys(inventoryUsageByItem).length && (
            <div className="space-y-1 text-sm">
              {Object.entries(inventoryUsageByItem).map(([id, data]) => (
                <div key={id} className="flex justify-between">
                  <span className="text-muted-foreground capitalize">
                    {data.category}
                  </span>
                  <span className="font-medium">
                    {data.quantity} {data.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expenses summary */}
        <div className="fv-card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Expenses Summary
          </h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total expenses</span>
              <span className="font-medium">{formatCurrency(totalExpenses)}</span>
            </div>
            {['labour', 'fertilizer', 'chemical', 'fuel', 'other'].map((cat) => (
              <div key={cat} className="flex justify-between">
                <span className="text-muted-foreground capitalize">{cat}</span>
                <span className="font-medium">
                  {formatCurrency(expensesByCategory[cat] || 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5️⃣ Financial snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SimpleStatCard
          title="Total project cost"
          value={formatCurrency(totalExpenses)}
          layout="vertical"
        />
        <SimpleStatCard
          title="Labour cost"
          value={formatCurrency(labourCost)}
          layout="vertical"
        />
        <SimpleStatCard
          title="Input cost"
          value={formatCurrency(inputCost)}
          layout="vertical"
        />
        <SimpleStatCard
          title="Avg daily cost"
          value={formatCurrency(Number.isFinite(avgDailyCost) ? avgDailyCost : 0)}
          layout="vertical"
        />
      </div>

      {/* 6️⃣ Quick actions */}
      <div className="fv-card flex flex-wrap gap-3">
        {project.status === 'active' && (
          <button
            className="fv-btn fv-btn--primary"
            onClick={() => navigate(`/projects/${project.id}/planning`)}
          >
            Planning
          </button>
        )}
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/challenges')}
        >
          <ListChecks className="h-4 w-4" />
          Add Season Challenge
        </button>
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/operations')}
        >
          <Users className="h-4 w-4" />
          View Work Logs
        </button>
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/expenses')}
        >
          <Wallet className="h-4 w-4" />
          View Expenses
        </button>
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/inventory')}
        >
          <Activity className="h-4 w-4" />
          View Inventory Usage
        </button>
      </div>
    </div>
  );
}

