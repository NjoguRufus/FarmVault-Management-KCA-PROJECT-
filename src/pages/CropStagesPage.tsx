import React, { useState, useMemo } from 'react';
import { Search, MoreHorizontal, AlertCircle, CheckCircle, Clock, X, Package, Wrench, AlertTriangle, Plus, Cloud, Bug, DollarSign, Users, Wrench as WrenchIcon, Droplets } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { useCollection } from '@/hooks/useCollection';
import { CropStage, WorkLog, SeasonChallenge, InventoryUsage, InventoryItem, ChallengeType } from '@/types';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { getCropStages } from '@/lib/cropStageConfig';
import { addDays } from 'date-fns';
import { toDate, formatDate } from '@/lib/dateUtils';
import { db } from '@/lib/firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function CropStagesPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allStages = [], isLoading } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allWorkLogs = [] } = useCollection<WorkLog>('workLogs', 'workLogs');
  const { data: allChallenges = [] } = useCollection<SeasonChallenge>('seasonChallenges', 'seasonChallenges');
  const { data: allInventoryUsage = [] } = useCollection<InventoryUsage>('inventoryUsage', 'inventoryUsage');
  const { data: allInventoryItems = [] } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');

  const [selectedStage, setSelectedStage] = useState<CropStage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [addChallengeOpen, setAddChallengeOpen] = useState(false);
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDescription, setChallengeDescription] = useState('');
  const [challengeType, setChallengeType] = useState<ChallengeType>('other');
  const [challengeSeverity, setChallengeSeverity] = useState<'low' | 'medium' | 'high'>('medium');

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

  // Current stage = first that is not completed (by stored status or dates). All previous stages show as complete.
  const currentStageIndex = useMemo(() => {
    const sorted = [...stages].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0));
    const idx = sorted.findIndex(
      (s) => s.status !== 'completed' && getDerivedStatus(s.startDate, s.endDate) !== 'completed'
    );
    return idx === -1 ? sorted.length : sorted[idx].stageIndex ?? idx;
  }, [stages]);

  const getDisplayStatus = (stage: CropStage): 'pending' | 'in-progress' | 'completed' => {
    if (stage.status === 'completed') return 'completed';
    if ((stage.stageIndex ?? 0) < currentStageIndex) return 'completed';
    return getDerivedStatus(stage.startDate, stage.endDate);
  };

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

  const getChallengeTypeIcon = (type: ChallengeType) => {
    // 3D colored emoji icons
    const icons: Record<ChallengeType, string> = {
      weather: '🌦️',
      pests: '🐛',
      diseases: '🦠',
      prices: '💰',
      labor: '👷',
      equipment: '🔧',
      other: '⚠️',
    };
    return <span className="text-2xl">{icons[type] || icons.other}</span>;
  };

  const handleMarkStageComplete = async () => {
    if (!selectedStage || !activeProject || selectedStage.id?.startsWith('placeholder-')) return;
    setMarkingComplete(true);
    try {
      const today = new Date();
      const stageRef = doc(db, 'projectStages', selectedStage.id);
      await updateDoc(stageRef, {
        endDate: today,
        status: 'completed',
        updatedAt: serverTimestamp(),
      });

      // Start the next stage automatically (current becomes next)
      const nextStageIndex = selectedStage.stageIndex + 1;
      const nextStage = projectStages.find((s) => s.stageIndex === nextStageIndex);
      const stageDefs = getCropStages(activeProject.cropType);
      const nextDef = stageDefs.find((d) => d.order === nextStageIndex);

      if (nextDef) {
        const endDate = addDays(today, nextDef.expectedDurationDays);
        if (nextStage && !nextStage.id.startsWith('placeholder-')) {
          await updateDoc(doc(db, 'projectStages', nextStage.id), {
            startDate: today,
            endDate,
            status: 'in-progress',
            updatedAt: serverTimestamp(),
          });
        } else {
          await addDoc(collection(db, 'projectStages'), {
            projectId: activeProject.id,
            companyId: activeProject.companyId,
            cropType: activeProject.cropType,
            stageName: nextDef.name,
            stageIndex: nextDef.order,
            startDate: today,
            endDate,
            status: 'in-progress',
            createdAt: serverTimestamp(),
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['projectStages'] });
      setDetailsOpen(false);
    } catch (error) {
      console.error('Error marking stage complete:', error);
    } finally {
      setMarkingComplete(false);
    }
  };

  const handleAddChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStage || !activeProject || !user) return;
    try {
      await addDoc(collection(db, 'seasonChallenges'), {
        title: challengeTitle,
        description: challengeDescription,
        challengeType,
        severity: challengeSeverity,
        status: 'identified',
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        stageIndex: selectedStage.stageIndex,
        stageName: selectedStage.stageName,
        dateIdentified: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      queryClient.invalidateQueries({ queryKey: ['seasonChallenges'] });
      setAddChallengeOpen(false);
      setChallengeTitle('');
      setChallengeDescription('');
      setChallengeType('other');
      setChallengeSeverity('medium');
    } catch (error) {
      console.error('Error adding challenge:', error);
    }
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
          value={stages.filter(s => getDisplayStatus(s) === 'completed').length}
          icon={CheckCircle}
          iconVariant="success"
        />
        <SimpleStatCard
          title="In Progress"
          value={stages.filter(s => getDisplayStatus(s) === 'in-progress').length}
          icon={Clock}
          iconVariant="warning"
        />
        <SimpleStatCard
          title="Pending"
          value={stages.filter(s => getDisplayStatus(s) === 'pending').length}
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
              const status = getDisplayStatus(stage);
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
                    <span className={cn(
                        'fv-badge capitalize',
                        status === 'completed' && 'fv-badge--active',
                        status === 'in-progress' && 'fv-badge--warning',
                        status === 'pending' && 'bg-muted text-muted-foreground'
                      )}>
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
              {/* Stage Actions */}
              <div className="flex flex-wrap gap-2 pb-4 border-b">
                {getDisplayStatus(selectedStage) !== 'completed' && 
                 !selectedStage.id?.startsWith('placeholder-') && (
                  <button
                    onClick={handleMarkStageComplete}
                    disabled={markingComplete}
                    className="fv-btn fv-btn--primary"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {markingComplete ? 'Marking...' : 'Mark as Complete'}
                  </button>
                )}
                <button
                  onClick={() => setAddChallengeOpen(true)}
                  className="fv-btn fv-btn--secondary"
                >
                  <Plus className="h-4 w-4" />
                  Add Challenge
                </button>
              </div>

              {/* Stage Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <span className={cn(
                    'fv-badge capitalize',
                    getDisplayStatus(selectedStage) === 'completed' && 'fv-badge--active',
                    getDisplayStatus(selectedStage) === 'in-progress' && 'fv-badge--warning',
                    getDisplayStatus(selectedStage) === 'pending' && 'bg-muted text-muted-foreground'
                  )}>
                    {getDisplayStatus(selectedStage).replace('-', ' ')}
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
                  // Filter challenges for this project and stage
                  const stageChallenges = allChallenges.filter(
                    c => c.projectId === activeProject.id && c.stageIndex === selectedStage.stageIndex
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
                              <div className="flex items-center gap-2 mb-1">
                                {challenge.challengeType && (
                                  <div className="text-muted-foreground">
                                    {getChallengeTypeIcon(challenge.challengeType)}
                                  </div>
                                )}
                                <h4 className="font-medium text-foreground">{challenge.title}</h4>
                              </div>
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
                                {challenge.challengeType && (
                                  <span className="fv-badge text-xs bg-muted text-muted-foreground capitalize">
                                    {challenge.challengeType}
                                  </span>
                                )}
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

      {/* Add Challenge Modal */}
      <Dialog open={addChallengeOpen} onOpenChange={setAddChallengeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Season Challenge</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddChallenge} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Challenge Type</label>
              <Select value={challengeType} onValueChange={(value) => setChallengeType(value as ChallengeType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weather">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4" />
                      Weather
                    </div>
                  </SelectItem>
                  <SelectItem value="pests">
                    <div className="flex items-center gap-2">
                      <Bug className="h-4 w-4" />
                      Pests
                    </div>
                  </SelectItem>
                  <SelectItem value="diseases">
                    <div className="flex items-center gap-2">
                      <Droplets className="h-4 w-4" />
                      Diseases
                    </div>
                  </SelectItem>
                  <SelectItem value="prices">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Prices
                    </div>
                  </SelectItem>
                  <SelectItem value="labor">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Labor
                    </div>
                  </SelectItem>
                  <SelectItem value="equipment">
                    <div className="flex items-center gap-2">
                      <WrenchIcon className="h-4 w-4" />
                      Equipment
                    </div>
                  </SelectItem>
                  <SelectItem value="other">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Other
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Title</label>
              <input
                className="fv-input"
                value={challengeTitle}
                onChange={(e) => setChallengeTitle(e.target.value)}
                required
                placeholder="e.g., Heavy rainfall affecting irrigation"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                className="fv-input resize-none"
                rows={4}
                value={challengeDescription}
                onChange={(e) => setChallengeDescription(e.target.value)}
                required
                placeholder="Describe the challenge in detail..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Severity</label>
              <Select value={challengeSeverity} onValueChange={(value) => setChallengeSeverity(value as 'low' | 'medium' | 'high')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <button
                type="button"
                className="fv-btn fv-btn--secondary"
                onClick={() => setAddChallengeOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="fv-btn fv-btn--primary"
              >
                Add Challenge
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
