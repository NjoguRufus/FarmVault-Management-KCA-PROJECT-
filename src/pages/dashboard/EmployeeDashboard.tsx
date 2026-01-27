import React, { useMemo } from 'react';
import { CalendarDays, CheckCircle, Clock, TrendingUp, Wrench, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { WorkLog, Project, CropStage, Employee } from '@/types';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toDate, formatDate } from '@/lib/dateUtils';

export function EmployeeDashboard() {
  const { user } = useAuth();
  const { data: allWorkLogs = [] } = useCollection<WorkLog>('workLogs', 'workLogs');
  const { data: allProjects = [] } = useCollection<Project>('projects', 'projects');
  const { data: allStages = [] } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allEmployees = [] } = useCollection<Employee>('employees', 'employees');

  // Find employee record for current user (match by name or email)
  const currentEmployee = useMemo(() => {
    if (!user) return null;
    return allEmployees.find(e => 
      e.companyId === user.companyId && 
      (e.name.toLowerCase() === user.name.toLowerCase() || 
       e.contact === user.email)
    );
  }, [allEmployees, user]);

  // Filter work logs assigned to this employee
  const assignedWorkLogs = useMemo(() => {
    if (!currentEmployee) return [];
    return allWorkLogs.filter(w => w.employeeId === currentEmployee.id);
  }, [allWorkLogs, currentEmployee]);

  // Get project names
  const getProjectName = (projectId: string) => {
    const project = allProjects.find(p => p.id === projectId);
    return project?.name || 'Unknown Project';
  };

  // Get stage name
  const getStageName = (projectId: string, stageIndex: number) => {
    const stage = allStages.find(s => s.projectId === projectId && s.stageIndex === stageIndex);
    return stage?.stageName || `Stage ${stageIndex}`;
  };

  // Statistics
  const totalAssigned = assignedWorkLogs.length;
  const paidLogs = assignedWorkLogs.filter(w => w.paid).length;
  const unpaidLogs = assignedWorkLogs.filter(w => !w.paid).length;
  const totalEarnings = assignedWorkLogs
    .filter(w => w.paid && w.totalPrice)
    .reduce((sum, w) => sum + (w.totalPrice || 0), 0);
  const pendingEarnings = assignedWorkLogs
    .filter(w => !w.paid && w.totalPrice)
    .reduce((sum, w) => sum + (w.totalPrice || 0), 0);

  // Sort by date (newest first)
  const sortedWorkLogs = useMemo(() => {
    return [...assignedWorkLogs].sort((a, b) => {
      const dateA = toDate(a.date);
      const dateB = toDate(b.date);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });
  }, [assignedWorkLogs]);

  if (!user) {
    return (
      <div className="space-y-6 animate-fade-in">
        <p className="text-sm text-muted-foreground">Please log in to view your dashboard.</p>
      </div>
    );
  }

  if (!currentEmployee) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, {user.name}!
          </p>
        </div>
        <div className="fv-card p-6 text-center">
          <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            No employee record found. Please contact your administrator to set up your employee profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {user.name}! Here's your assigned work and earnings overview.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Total Assigned"
          value={totalAssigned}
          icon={Wrench}
          iconVariant="info"
          layout="vertical"
        />
        <SimpleStatCard
          title="Paid Logs"
          value={paidLogs}
          icon={CheckCircle}
          iconVariant="success"
          layout="vertical"
        />
        <SimpleStatCard
          title="Unpaid Logs"
          value={unpaidLogs}
          icon={Clock}
          iconVariant="warning"
          layout="vertical"
        />
        <SimpleStatCard
          title="Total Earnings"
          value={`KES ${totalEarnings.toLocaleString()}`}
          icon={TrendingUp}
          iconVariant="gold"
          layout="vertical"
        />
      </div>

      {pendingEarnings > 0 && (
        <div className="fv-card p-4 bg-warning/10 border-warning/20">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-warning" />
            <div>
              <p className="font-medium text-foreground">Pending Earnings</p>
              <p className="text-sm text-muted-foreground">
                KES {pendingEarnings.toLocaleString()} from {unpaidLogs} unpaid work log{unpaidLogs !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Assigned Work Logs */}
      <div className="fv-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">My Assigned Work</h3>
          <span className="text-sm text-muted-foreground">{totalAssigned} total</span>
        </div>

        {sortedWorkLogs.length === 0 ? (
          <div className="text-center py-12">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">No work assigned to you yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedWorkLogs.map((log) => {
              const logDate = toDate(log.date);
              const isPaid = log.paid;
              
              return (
                <div
                  key={log.id}
                  className={cn(
                    'p-4 rounded-lg border transition-colors',
                    isPaid ? 'bg-success/5 border-success/20' : 'bg-card border-border hover:bg-muted/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium text-foreground">{log.workCategory}</h4>
                        <span className={cn('fv-badge text-xs', isPaid ? 'fv-badge--active' : 'fv-badge--warning')}>
                          {isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground mb-2">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          <span>{logDate ? format(logDate, 'PPP') : formatDate(log.date)}</span>
                        </div>
                        <div>
                          <span className="font-medium">Project:</span> {getProjectName(log.projectId)}
                        </div>
                        <div>
                          <span className="font-medium">Stage:</span> {getStageName(log.projectId, log.stageIndex)}
                        </div>
                        <div>
                          <span className="font-medium">People:</span> {log.numberOfPeople}
                          {log.ratePerPerson && ` @ KES ${log.ratePerPerson.toLocaleString()}`}
                        </div>
                      </div>

                      {log.totalPrice && (
                        <div className="mt-2">
                          <span className="text-sm font-semibold text-foreground">
                            Total: KES {log.totalPrice.toLocaleString()}
                          </span>
                        </div>
                      )}

                      {log.notes && (
                        <p className="text-sm text-muted-foreground mt-2">{log.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
