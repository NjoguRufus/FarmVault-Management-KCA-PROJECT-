import React, { useState, useMemo } from 'react';
import { Search, MoreHorizontal, AlertCircle, CheckCircle, Clock, X, Package, Wrench, AlertTriangle } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { useCollection } from '@/hooks/useCollection';
import { CropStage, WorkLog, SeasonChallenge, InventoryUsage, InventoryItem } from '@/types';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { getCropStages } from '@/lib/cropStageConfig';
import { addDays } from 'date-fns';
import { toDate, formatDate } from '@/lib/dateUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function CropStagesPage() {
  const { activeProject } = useProject();
  const { data: allStages = [], isLoading } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allWorkLogs = [] } = useCollection<WorkLog>('workLogs', 'workLogs');
  const { data: allChallenges = [] } = useCollection<SeasonChallenge>('seasonChallenges', 'seasonChallenges');
  const { data: allInventoryUsage = [] } = useCollection<InventoryUsage>('inventoryUsage', 'inventoryUsage');
  const { data: allInventoryItems = [] } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');

  const [selectedStage, setSelectedStage] = useState<CropStage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const projectStages = activeProject
    ? allStages.filter(s => s.projectId === activeProject.id)
    : allStages;

  // Generate all expected stages for the crop type, including missing ones
  const allExpectedStages = useMemo(() => {
    if (!activeProject) return projectStages;
    
    const stageDefs = getCropStages(activeProject.cropType);
    const stagesMap = new Map(projectStages.map(s => [s.stageIndex, s]));
    
    // Create complete stage list with all expected stages
    return stageDefs.map(def => {
      const existing = stagesMap.get(def.order);
      if (existing) return existing;
      
      // Create a placeholder stage for missing stages
      // If this stage index is before the starting stage, calculate dates backwards from planting date
      const isBeforeStart = activeProject.startingStageIndex !== undefined && def.order < activeProject.startingStageIndex;
      
      if (isBeforeStart && activeProject.plantingDate) {
        // Calculate dates backwards from planting date
        const plantingDate = new Date(activeProject.plantingDate);
        let currentEnd = addDays(plantingDate, -1); // Day before planting
        
        // Work backwards through stages to find this stage's dates
        for (let i = activeProject.startingStageIndex - 1; i >= def.order; i--) {
          const prevDef = stageDefs[i];
          if (prevDef) {
            const prevStart = addDays(currentEnd, -(prevDef.expectedDurationDays - 1));
            if (i === def.order) {
              return {
                id: `placeholder-${def.order}`,
                projectId: activeProject.id,
                companyId: activeProject.companyId,
                cropType: activeProject.cropType,
                stageName: def.name,
                stageIndex: def.order,
                startDate: prevStart,
                endDate: currentEnd,
                status: 'completed' as const,
              } as CropStage;
            }
            currentEnd = addDays(prevStart, -1);
          }
        }
      }
      
      return {
        id: `placeholder-${def.order}`,
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        stageName: def.name,
        stageIndex: def.order,
        startDate: undefined,
        endDate: undefined,
        status: 'pending' as const,
      } as CropStage;
    });
  }, [projectStages, activeProject]);

  const stages = allExpectedStages;


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

  const getStatusBadge = (startDate?: any, endDate?: any) => {
    const start = toDate(startDate);
    const end = toDate(endDate);
    if (!start || !end) return 'bg-muted text-muted-foreground';
    const today = new Date();
    if (today < start) return 'bg-muted text-muted-foreground';
    if (today > end) return 'fv-badge--active';
    return 'fv-badge--warning';
  };

  const getDerivedStatus = (startDate?: any, endDate?: any): 'pending' | 'in-progress' | 'completed' => {
    const start = toDate(startDate);
    const end = toDate(endDate);
    if (!start || !end) return 'pending';
    const today = new Date();
    if (today < start) return 'pending';
    if (today > end) return 'completed';
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
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Completed"
          value={stages.filter(s => getDerivedStatus(s.startDate, s.endDate) === 'completed').length}
          icon={CheckCircle}
          iconVariant="success"
        />
        <SimpleStatCard
          title="In Progress"
          value={stages.filter(s => getDerivedStatus(s.startDate, s.endDate) === 'in-progress').length}
          icon={Clock}
          iconVariant="warning"
        />
        <SimpleStatCard
          title="Pending"
          value={stages.filter(s => getDerivedStatus(s.startDate, s.endDate) === 'pending').length}
          icon={AlertCircle}
          iconVariant="muted"
        />
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
            .sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0))
            .map((stage, index) => {
              const status = getDerivedStatus(stage.startDate, stage.endDate);
              return (
              <div
                key={stage.id}
                className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedStage(stage);
                  setDetailsOpen(true);
                }}
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
                    <h4 className="font-medium text-foreground">{stage.stageName || `Stage ${stage.stageIndex}`}</h4>
                    <span className={cn('fv-badge capitalize', getStatusBadge(stage.startDate, stage.endDate))}>
                      {status.replace('-', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {(() => {
                      const start = toDate(stage.startDate);
                      const end = toDate(stage.endDate);
                      return (
                        <>
                          {start && (
                            <span>
                              Started: {formatDate(start)}
                            </span>
                          )}
                          {end && (
                            <span>
                              Completed: {formatDate(end)}
                            </span>
                          )}
                          {!start && !end && (
                            <span className="text-muted-foreground">No dates set</span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <button 
                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                  onClick={() => {
                    setSelectedStage(stage);
                    setDetailsOpen(true);
                  }}
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              );
            })}
        </div>
      </div>

      {/* Stage Details Modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Stage Details: {selectedStage?.stageName}</span>
              <button
                onClick={() => setDetailsOpen(false)}
                className="p-1 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          
          {selectedStage && activeProject && (
            <div className="space-y-6">
              {/* Stage Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <span className={cn('fv-badge capitalize', getStatusBadge(selectedStage.startDate, selectedStage.endDate))}>
                    {getDerivedStatus(selectedStage.startDate, selectedStage.endDate).replace('-', ' ')}
                  </span>
                </div>
                {(() => {
                  const start = toDate(selectedStage.startDate);
                  const end = toDate(selectedStage.endDate);
                  return (
                    <>
                      {start && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                          <p className="text-sm font-medium">
                            {formatDate(start)}
                          </p>
                        </div>
                      )}
                      {end && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">End Date</p>
                          <p className="text-sm font-medium">
                            {formatDate(end)}
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
                {selectedStage.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{selectedStage.notes}</p>
                  </div>
                )}
              </div>

              {/* Challenges Encountered */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-fv-warning" />
                  Challenges Encountered
                </h3>
                {(() => {
                  // Filter challenges for this project (stageIndex may not exist on all challenges)
                  const stageChallenges = allChallenges.filter(
                    c => c.projectId === activeProject.id && (c as any).stageIndex === selectedStage.stageIndex
                  );
                  
                  if (stageChallenges.length === 0) {
                    return <p className="text-sm text-muted-foreground">No challenges recorded for this stage.</p>;
                  }
                  
                  return (
                    <div className="space-y-2">
                      {stageChallenges.map((challenge) => (
                        <div key={challenge.id} className="fv-card p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-foreground">{challenge.title}</h4>
                              <p className="text-sm text-muted-foreground mt-1">{challenge.description}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className={cn('fv-badge text-xs', 
                                  challenge.severity === 'high' && 'bg-destructive/20 text-destructive',
                                  challenge.severity === 'medium' && 'fv-badge--warning',
                                  challenge.severity === 'low' && 'fv-badge--info'
                                )}>
                                  {challenge.severity}
                                </span>
                                <span className={cn('fv-badge text-xs',
                                  challenge.status === 'resolved' && 'fv-badge--active',
                                  challenge.status === 'mitigating' && 'fv-badge--warning',
                                  challenge.status === 'identified' && 'bg-muted text-muted-foreground'
                                )}>
                                  {challenge.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Chemicals & Inputs Used */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Chemicals & Inputs Used
                </h3>
                {(() => {
                  const stageUsage = allInventoryUsage.filter(
                    u => u.projectId === activeProject.id && u.stageIndex === selectedStage.stageIndex
                  );
                  
                  if (stageUsage.length === 0) {
                    return <p className="text-sm text-muted-foreground">No inputs recorded for this stage.</p>;
                  }
                  
                  const usageByCategory = stageUsage.reduce<Record<string, typeof stageUsage>>((acc, usage) => {
                    const cat = usage.category || 'other';
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(usage);
                    return acc;
                  }, {});
                  
                  return (
                    <div className="space-y-3">
                      {Object.entries(usageByCategory).map(([category, usages]) => {
                        const totalQty = usages.reduce((sum, u) => sum + u.quantity, 0);
                        const items = usages.map(u => {
                          const item = allInventoryItems.find(i => i.id === u.inventoryItemId);
                          return item ? { ...u, itemName: item.name, unit: u.unit } : null;
                        }).filter(Boolean);
                        
                        return (
                          <div key={category} className="fv-card p-3">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-foreground capitalize">{category}</h4>
                              <span className="text-sm text-muted-foreground">
                                {items.length} {items.length === 1 ? 'item' : 'items'}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {items.map((usage: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">{usage.itemName}</span>
                                  <span className="font-medium">
                                    {usage.quantity} {usage.unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Work Logs */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-fv-info" />
                  Work Done
                </h3>
                {(() => {
                  const stageWorkLogs = allWorkLogs.filter(
                    w => w.projectId === activeProject.id && w.stageIndex === selectedStage.stageIndex
                  ).sort((a, b) => {
                    const dateA = toDate(a.date);
                    const dateB = toDate(b.date);
                    if (!dateA || !dateB) return 0;
                    return dateB.getTime() - dateA.getTime();
                  });
                  
                  if (stageWorkLogs.length === 0) {
                    return <p className="text-sm text-muted-foreground">No work logs recorded for this stage.</p>;
                  }
                  
                  return (
                    <div className="space-y-2">
                      {stageWorkLogs.map((log) => {
                        const logDate = toDate(log.date);
                        return (
                          <div key={log.id} className="fv-card p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium text-foreground">{log.workCategory}</h4>
                                  <span className={cn('fv-badge text-xs', log.paid ? 'fv-badge--active' : 'fv-badge--warning')}>
                                    {log.paid ? 'Paid' : 'Unpaid'}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {log.numberOfPeople} {log.numberOfPeople === 1 ? 'person' : 'people'}
                                  {log.ratePerPerson && ` @ KES ${log.ratePerPerson.toLocaleString()}`}
                                </p>
                                {log.notes && (
                                  <p className="text-sm text-muted-foreground mt-1">{log.notes}</p>
                                )}
                                {logDate && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {formatDate(logDate)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
