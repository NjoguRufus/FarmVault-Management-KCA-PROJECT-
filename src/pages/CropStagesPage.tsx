import React from 'react';
import { Search, MoreHorizontal, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { useCollection } from '@/hooks/useCollection';
import { CropStage } from '@/types';

export default function CropStagesPage() {
  const { activeProject } = useProject();
  const { data: allStages = [], isLoading } = useCollection<CropStage>('projectStages', 'projectStages');

  const stages = activeProject
    ? allStages.filter(s => s.projectId === activeProject.id)
    : allStages;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-fv-success" />;
      case 'in-progress':
        return <Clock className="h-5 w-5 text-fv-warning" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (startDate?: Date, endDate?: Date) => {
    if (!startDate || !endDate) return 'bg-muted text-muted-foreground';
    const today = new Date();
    if (today < startDate) return 'bg-muted text-muted-foreground';
    if (today > endDate) return 'fv-badge--active';
    return 'fv-badge--warning';
  };

  const getDerivedStatus = (startDate?: Date, endDate?: Date): 'pending' | 'in-progress' | 'completed' => {
    if (!startDate || !endDate) return 'pending';
    const today = new Date();
    if (today < startDate) return 'pending';
    if (today > endDate) return 'completed';
    return 'in-progress';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Crop Stages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Track stages for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'Manage crop growth stages'
            )}
          </p>
        </div>
        {/* Stages are generated automatically from crop configuration */}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-success/10">
            <CheckCircle className="h-6 w-6 text-fv-success" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold">
              {stages.filter(s => getDerivedStatus(s.startDate, s.endDate) === 'completed').length}
            </p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-warning/10">
            <Clock className="h-6 w-6 text-fv-warning" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">In Progress</p>
            <p className="text-2xl font-bold">
              {stages.filter(s => getDerivedStatus(s.startDate, s.endDate) === 'in-progress').length}
            </p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold">
              {stages.filter(s => getDerivedStatus(s.startDate, s.endDate) === 'pending').length}
            </p>
          </div>
        </div>
      </div>

      {/* Stages Timeline */}
      <div className="fv-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Stage Timeline</h3>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground mb-4">Loading stages…</p>
        )}

        <div className="space-y-1">
          {stages
            .sort((a, b) => (a.stageIndex ?? a.order) - (b.stageIndex ?? b.order))
            .map((stage, index) => {
              const status = getDerivedStatus(stage.startDate, stage.endDate);
              return (
              <div
                key={stage.id}
                className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors"
              >
                {/* Timeline indicator */}
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2',
                    status === 'completed' && 'border-fv-success bg-fv-success/10',
                    status === 'in-progress' && 'border-fv-warning bg-fv-warning/10',
                    status === 'pending' && 'border-muted bg-muted'
                  )}>
                    {getStatusIcon(status)}
                  </div>
                  {index < stages.length - 1 && (
                    <div className={cn(
                      'w-0.5 h-8 mt-2',
                      status === 'completed' ? 'bg-fv-success' : 'bg-muted'
                    )} />
                  )}
                </div>

                {/* Stage content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-foreground">{stage.name}</h4>
                    <span className={cn('fv-badge capitalize', getStatusBadge(stage.startDate, stage.endDate))}>
                      {status.replace('-', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {stage.startDate && (
                      <span>
                        Started: {new Date(stage.startDate).toLocaleDateString('en-KE', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                    {stage.endDate && (
                      <span>
                        Completed: {new Date(stage.endDate).toLocaleDateString('en-KE', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
