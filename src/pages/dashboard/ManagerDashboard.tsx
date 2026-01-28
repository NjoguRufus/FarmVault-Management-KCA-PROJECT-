import React, { useMemo, useState } from 'react';
import { Plus, Wrench, CheckCircle, Calendar, TrendingUp, Users, DollarSign, Sprout } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { WorkLog, Expense, CropStage, SeasonChallenge, InventoryUsage } from '@/types';
import { LuxuryStatCard } from '@/components/dashboard/LuxuryStatCard';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { cn } from '@/lib/utils';
import { formatDate, toDate } from '@/lib/dateUtils';
import { getCurrentStageForProject } from '@/services/stageService';
import { syncTodaysLabourExpenses } from '@/services/workLogService';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function ManagerDashboard() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [markingAllPaid, setMarkingAllPaid] = useState(false);

  const companyId = user?.companyId || '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Data sources
  const { data: allWorkLogs = [] } = useCollection<WorkLog>('workLogs', 'workLogs');
  const { data: allExpenses = [] } = useCollection<Expense>('expenses', 'expenses');
  const { data: allStages = [] } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allChallenges = [] } = useCollection<SeasonChallenge>('seasonChallenges', 'seasonChallenges');
  const { data: allInventoryUsage = [] } = useCollection<InventoryUsage>('inventoryUsage', 'inventoryUsage');

  // Filter by project
  const projectWorkLogs = useMemo(() => {
    if (!activeProject) return [];
    return allWorkLogs.filter(
      w => w.projectId === activeProject.id && 
      w.companyId === activeProject.companyId &&
      w.managerId === user?.id
    );
  }, [allWorkLogs, activeProject, user?.id]);

  const todayWorkLogs = useMemo(() => {
    return projectWorkLogs.filter(log => {
      const logDate = toDate(log.date);
      return logDate && logDate >= today && logDate <= todayEnd;
    });
  }, [projectWorkLogs, today, todayEnd]);

  const projectExpenses = useMemo(() => {
    if (!activeProject) return [];
    return allExpenses.filter(
      e => e.projectId === activeProject.id && 
      e.companyId === activeProject.companyId &&
      e.category === 'labour'
    );
  }, [allExpenses, activeProject]);

  const projectStages = useMemo(() => {
    if (!activeProject) return [];
    return allStages.filter(
      s => s.projectId === activeProject.id &&
      s.companyId === activeProject.companyId &&
      s.cropType === activeProject.cropType
    ).sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0));
  }, [allStages, activeProject]);

  const currentStage = useMemo(() => {
    return getCurrentStageForProject(projectStages);
  }, [projectStages]);

  // Calculate stats
  const todaysWorkCount = todayWorkLogs.length;
  const totalPeopleToday = useMemo(() => {
    return todayWorkLogs.reduce((sum, log) => sum + (log.numberOfPeople || 0), 0);
  }, [todayWorkLogs]);

  const labourCostToday = useMemo(() => {
    return todayWorkLogs.reduce((sum, log) => sum + (log.totalPrice || 0), 0);
  }, [todayWorkLogs]);

  const unpaidWorkLogs = useMemo(() => {
    return projectWorkLogs.filter(log => !log.paid && log.totalPrice && log.totalPrice > 0);
  }, [projectWorkLogs]);

  const unpaidTotal = useMemo(() => {
    return unpaidWorkLogs.reduce((sum, log) => sum + (log.totalPrice || 0), 0);
  }, [unpaidWorkLogs]);

  // Stage progress calculation
  const stageProgress = useMemo(() => {
    if (!currentStage || !projectStages.length) return 0;
    const stage = projectStages.find(s => s.stageIndex === currentStage.stageIndex);
    if (!stage || !stage.startDate || !stage.endDate) return 0;
    const start = toDate(stage.startDate);
    const end = toDate(stage.endDate);
    if (!start || !end) return 0;
    const now = new Date();
    const total = end.getTime() - start.getTime();
    const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), total);
    return Math.round((elapsed / total) * 100);
  }, [currentStage, projectStages]);

  const daysInStage = useMemo(() => {
    if (!currentStage || !projectStages.length) return 0;
    const stage = projectStages.find(s => s.stageIndex === currentStage.stageIndex);
    if (!stage || !stage.startDate) return 0;
    const start = toDate(stage.startDate);
    if (!start) return 0;
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [currentStage, projectStages]);

  // Group today's work logs by category
  const workLogsByCategory = useMemo(() => {
    const grouped: Record<string, WorkLog[]> = {};
    todayWorkLogs.forEach(log => {
      const category = log.workCategory || 'Uncategorized work';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(log);
    });
    return grouped;
  }, [todayWorkLogs]);

  const handleSyncLabour = async () => {
    if (!activeProject || !user) return;
    setSyncing(true);
    try {
      await syncTodaysLabourExpenses({
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        date: today,
        paidByUserId: user.id,
        paidByName: user.name,
      });
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkAllAsPaid = async () => {
    if (!user || unpaidWorkLogs.length === 0) return;
    setMarkingAllPaid(true);
    try {
      const batch = writeBatch(db);
      unpaidWorkLogs.forEach(log => {
        if (log.id) {
          const logRef = doc(db, 'workLogs', log.id);
          batch.update(logRef, {
            paid: true,
            paidAt: serverTimestamp(),
            paidBy: user.id,
            paidByName: user.name,
          });
        }
      });
      await batch.commit();
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } finally {
      setMarkingAllPaid(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="fv-card p-8 text-center">
          <p className="text-muted-foreground">Please select a project to view the manager dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manager Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Daily field operations for <span className="font-medium">{activeProject.name}</span>
        </p>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <LuxuryStatCard
          title="Today's Work Logs"
          value={todaysWorkCount}
          icon={Wrench}
          iconVariant="primary"
        />
        <LuxuryStatCard
          title="Total People Today"
          value={totalPeopleToday}
          icon={Users}
          iconVariant="info"
        />
        <LuxuryStatCard
          title="Labour Cost (KES)"
          value={labourCostToday.toLocaleString()}
          icon={DollarSign}
          iconVariant="success"
        />
        <LuxuryStatCard
          title="Current Crop Stage"
          value={currentStage?.stageName || 'N/A'}
          icon={Sprout}
          iconVariant="gold"
          variant="gold"
        />
      </div>

      {/* Quick Actions */}
      <div className="fv-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/operations')} className="fv-btn fv-btn--primary">
            <Plus className="h-4 w-4" />
            Log Daily Work
          </Button>
          <Button onClick={() => navigate('/operations')} className="fv-btn fv-btn--secondary">
            <Wrench className="h-4 w-4" />
            View Today's Work
          </Button>
          <Button 
            onClick={handleSyncLabour} 
            disabled={syncing}
            className="fv-btn fv-btn--secondary"
          >
            <CheckCircle className="h-4 w-4" />
            {syncing ? 'Syncing...' : "Sync Labour Expenses"}
          </Button>
          <Button onClick={() => navigate('/challenges')} className="fv-btn fv-btn--secondary">
            <Plus className="h-4 w-4" />
            Add Season Challenge
          </Button>
        </div>
      </div>

      {/* Today's Work Logs */}
      <div className="fv-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Today's Work Logs</h2>
        </div>
        <div className="p-4 space-y-4">
          {Object.keys(workLogsByCategory).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No work logged for today.
            </p>
          ) : (
            Object.entries(workLogsByCategory).map(([category, logs]) => (
              <div key={category} className="space-y-2">
                <h3 className="font-semibold text-foreground">{category}</h3>
                {logs.map(log => (
                  <div
                    key={log.id}
                    className={cn(
                      "p-3 rounded-lg border",
                      log.paid && "bg-muted/30"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{log.numberOfPeople} people</span>
                          {log.ratePerPerson && (
                            <span className="text-sm text-muted-foreground">
                              @ KES {log.ratePerPerson.toLocaleString()}
                            </span>
                          )}
                          <span className={cn(
                            'fv-badge text-xs',
                            log.paid ? 'fv-badge--success' : 'fv-badge--warning'
                          )}>
                            {log.paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </div>
                        {log.totalPrice && (
                          <p className="text-sm font-semibold text-foreground">
                            Total: KES {log.totalPrice.toLocaleString()}
                          </p>
                        )}
                        {log.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{log.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pending Payments */}
      {unpaidWorkLogs.length > 0 && (
        <div className="fv-card">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Pending Payments</h2>
              <Button 
                onClick={handleMarkAllAsPaid}
                disabled={markingAllPaid}
                className="fv-btn fv-btn--primary"
              >
                {markingAllPaid ? 'Marking...' : 'Mark All as Paid'}
              </Button>
            </div>
          </div>
          <div className="p-4">
            <SimpleStatCard
              title="Unpaid Labour Total"
              value={`KES ${unpaidTotal.toLocaleString()}`}
              subtitle={`${unpaidWorkLogs.length} work log${unpaidWorkLogs.length !== 1 ? 's' : ''} pending`}
              valueVariant="warning"
            />
          </div>
        </div>
      )}

      {/* Stage Context */}
      {currentStage && (
        <div className="fv-card">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-foreground">Stage Context</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SimpleStatCard
                title="Current Stage"
                value={currentStage.stageName}
                icon={Sprout}
                iconVariant="gold"
              />
              <SimpleStatCard
                title="Day in Stage"
                value={`Day ${daysInStage}`}
                icon={Calendar}
                iconVariant="info"
              />
              <SimpleStatCard
                title="Stage Progress"
                value={`${stageProgress}%`}
                icon={TrendingUp}
                iconVariant="success"
              />
            </div>
            <Button 
              onClick={() => navigate(`/projects/${activeProject.id}`)}
              className="fv-btn fv-btn--secondary"
            >
              View Project Details
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
