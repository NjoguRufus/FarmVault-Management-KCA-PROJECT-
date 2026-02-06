import React, { useState } from 'react';
import { Plus, AlertTriangle, CheckCircle, Clock, MoreHorizontal, Edit, ChevronDown, ChevronUp, Cloud, Bug, DollarSign, Users, Wrench as WrenchIcon, Droplets, Package, X } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { SeasonChallenge, ChallengeType, InventoryItem, InventoryCategory, NeededItem } from '@/types';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@/lib/dateUtils';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogTrigger,
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

export default function SeasonChallengesPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allChallenges = [], isLoading } = useCollection<SeasonChallenge>('seasonChallenges', 'seasonChallenges');
  const { data: allInventoryItems = [] } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');

  const challenges = activeProject
    ? allChallenges.filter(c => c.projectId === activeProject.id)
    : allChallenges;

  const [expandedChallenges, setExpandedChallenges] = useState<Set<string>>(new Set());
  const [editingChallenge, setEditingChallenge] = useState<SeasonChallenge | null>(null);
  const [editOpen, setEditOpen] = useState(false);

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

  const getChallengeTypeIcon = (type?: ChallengeType) => {
    if (!type) return null;
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

  const toggleExpand = (challengeId: string) => {
    const newExpanded = new Set(expandedChallenges);
    if (newExpanded.has(challengeId)) {
      newExpanded.delete(challengeId);
    } else {
      newExpanded.add(challengeId);
    }
    setExpandedChallenges(newExpanded);
  };

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [challengeType, setChallengeType] = useState<ChallengeType>('other');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editChallengeType, setEditChallengeType] = useState<ChallengeType>('other');
  const [editSeverity, setEditSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [editStatus, setEditStatus] = useState<'identified' | 'mitigating' | 'resolved'>('identified');
  const [editWhatWasDone, setEditWhatWasDone] = useState('');
  const [editPlan2IfFails, setEditPlan2IfFails] = useState('');
  const [editItemsUsed, setEditItemsUsed] = useState<Array<{ inventoryItemId?: string; itemName: string; category: InventoryCategory; quantity?: number; unit: string; needsPurchase?: boolean }>>([]);
  const [editingSaving, setEditingSaving] = useState(false);

  const handleReportChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'seasonChallenges'), {
        title,
        description,
        challengeType,
        severity,
        status: 'identified',
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        stageIndex: activeProject.startingStageIndex || 0,
        dateIdentified: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      
      queryClient.invalidateQueries({ queryKey: ['seasonChallenges'] });
      
      setAddOpen(false);
      setTitle('');
      setDescription('');
      setChallengeType('other');
      setSeverity('medium');
    } finally {
      setSaving(false);
    }
  };

  const handleEditChallenge = (challenge: SeasonChallenge) => {
    setEditingChallenge(challenge);
    setEditTitle(challenge.title);
    setEditDescription(challenge.description);
    setEditChallengeType(challenge.challengeType || 'other');
    setEditSeverity(challenge.severity);
    setEditStatus(challenge.status);
    setEditWhatWasDone(challenge.whatWasDone || '');
    setEditPlan2IfFails(challenge.plan2IfFails || '');
    // Support both old chemicalsUsed and new itemsUsed format
    if (challenge.itemsUsed) {
      setEditItemsUsed(challenge.itemsUsed);
    } else if ((challenge as any).chemicalsUsed) {
      // Migrate old format to new format
      const migrated = (challenge as any).chemicalsUsed.map((chem: any) => ({
        inventoryItemId: chem.inventoryItemId,
        itemName: chem.inventoryItemName || allInventoryItems.find(i => i.id === chem.inventoryItemId)?.name || 'Unknown',
        category: 'chemical' as InventoryCategory,
        quantity: chem.quantity,
        unit: chem.unit,
        needsPurchase: !chem.inventoryItemId,
      }));
      setEditItemsUsed(migrated);
    } else {
      setEditItemsUsed([]);
    }
    setEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editingChallenge || !user || !activeProject) {
      console.error('Missing required data:', { editingChallenge, user, activeProject });
      return;
    }
    setEditingSaving(true);
    try {
      // Process items: check if they exist in inventory, mark needsPurchase, create NeededItems
      const processedItems = await Promise.all(editItemsUsed.map(async (item) => {
        if (!item.itemName.trim()) {
          // Skip empty items
          return null;
        }
        
        // Check if item exists in inventory by name (case-insensitive)
        const existingItem = allInventoryItems.find(
          inv => inv.name.toLowerCase() === item.itemName.toLowerCase() && inv.category === item.category
        );
        
        const needsPurchase = !existingItem;
        
        // If item doesn't exist, create NeededItem
        if (needsPurchase) {
          const neededItemData: any = {
            companyId: activeProject.companyId,
            projectId: activeProject.id,
            itemName: item.itemName,
            category: item.category,
            unit: item.unit,
            sourceChallengeId: editingChallenge.id,
            sourceChallengeTitle: editTitle,
            status: 'pending' as const,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          
          // Only include quantity if provided
          if (item.quantity !== undefined && item.quantity !== null && item.quantity > 0) {
            neededItemData.quantity = item.quantity;
          }
          
          await addDoc(collection(db, 'neededItems'), neededItemData);
        }
        
        const itemData: any = {
          itemName: item.itemName,
          category: item.category,
          unit: item.unit,
          needsPurchase,
        };
        
        // Only include inventoryItemId if it exists
        if (existingItem?.id) {
          itemData.inventoryItemId = existingItem.id;
        }
        
        // Only include quantity if it's provided
        if (item.quantity !== undefined && item.quantity !== null && item.quantity > 0) {
          itemData.quantity = item.quantity;
        }
        
        return itemData;
      }));
      
      // Filter out null items and clean undefined values from each item
      const validItems = processedItems
        .filter(item => item !== null)
        .map(item => {
          const cleaned: any = {};
          if (item) {
            Object.keys(item).forEach(key => {
              if (item[key as keyof typeof item] !== undefined) {
                cleaned[key] = item[key as keyof typeof item];
              }
            });
          }
          return cleaned;
        })
        .filter(item => Object.keys(item).length > 0);

      const updateData: any = {
        title: editTitle,
        description: editDescription,
        challengeType: editChallengeType,
        severity: editSeverity,
        status: editStatus,
        updatedAt: serverTimestamp(),
      };

      // Only include optional fields if they have values
      if (editWhatWasDone && editWhatWasDone.trim()) {
        updateData.whatWasDone = editWhatWasDone.trim();
      }
      if (editPlan2IfFails && editPlan2IfFails.trim()) {
        updateData.plan2IfFails = editPlan2IfFails.trim();
      }
      if (validItems.length > 0) {
        updateData.itemsUsed = validItems;
      }

      if (editStatus === 'resolved' && editingChallenge.status !== 'resolved') {
        updateData.dateResolved = serverTimestamp();
      }

      // Recursively remove any undefined values before sending to Firestore
      const cleanUndefined = (obj: any): any => {
        if (obj === null || obj === undefined) {
          return null;
        }
        if (Array.isArray(obj)) {
          return obj.map(cleanUndefined).filter(item => item !== null && item !== undefined);
        }
        if (typeof obj === 'object') {
          const cleaned: any = {};
          Object.keys(obj).forEach(key => {
            const value = cleanUndefined(obj[key]);
            if (value !== undefined && value !== null) {
              cleaned[key] = value;
            }
          });
          return cleaned;
        }
        return obj;
      };

      const cleanedUpdateData = cleanUndefined(updateData);

      await updateDoc(doc(db, 'seasonChallenges', editingChallenge.id), cleanedUpdateData);
      
      queryClient.invalidateQueries({ queryKey: ['seasonChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['neededItems'] });
      
      // Reset form state
      setEditOpen(false);
      setEditingChallenge(null);
      setEditTitle('');
      setEditDescription('');
      setEditChallengeType('other');
      setEditSeverity('medium');
      setEditStatus('identified');
      setEditWhatWasDone('');
      setEditPlan2IfFails('');
      setEditItemsUsed([]);
    } catch (error) {
      console.error('Error saving challenge:', error);
      alert('Failed to save challenge. Please try again.');
    } finally {
      setEditingSaving(false);
    }
  };

  const addItemToEdit = () => {
    setEditItemsUsed([...editItemsUsed, { itemName: '', category: 'chemical', quantity: undefined, unit: 'L' }]);
  };

  const removeItemFromEdit = (index: number) => {
    setEditItemsUsed(editItemsUsed.filter((_, i) => i !== index));
  };

  const updateItemInEdit = (index: number, field: 'itemName' | 'category' | 'quantity' | 'unit' | 'inventoryItemId', value: string | number | undefined) => {
    const updated = [...editItemsUsed];
    updated[index] = { ...updated[index], [field]: value };
    setEditItemsUsed(updated);
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
            <button className="fv-btn fv-btn--primary">
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
                  <label className="text-sm font-medium text-foreground">Challenge Type</label>
                  <Select value={challengeType} onValueChange={(value) => setChallengeType(value as ChallengeType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select challenge type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weather">Weather</SelectItem>
                      <SelectItem value="pests">Pests</SelectItem>
                      <SelectItem value="diseases">Diseases</SelectItem>
                      <SelectItem value="prices">Prices</SelectItem>
                      <SelectItem value="labor">Labour / People</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="other">Custom (not listed)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Severity</label>
                  <Select value={severity} onValueChange={(value) => setSeverity(value as 'low' | 'medium' | 'high')}>
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
        <SimpleStatCard
          title="High Severity"
          value={challenges.filter(c => c.severity === 'high').length}
          icon={AlertTriangle}
          iconVariant="destructive"
        />
        <SimpleStatCard
          title="In Progress"
          value={challenges.filter(c => c.status === 'mitigating').length}
          icon={Clock}
          iconVariant="warning"
        />
        <SimpleStatCard
          title="Resolved"
          value={challenges.filter(c => c.status === 'resolved').length}
          icon={CheckCircle}
          iconVariant="success"
        />
      </div>

      {/* Challenges List */}
      <div className="space-y-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading challenges…</p>
        )}
        {challenges.map((challenge) => {
          const isExpanded = expandedChallenges.has(challenge.id);
          return (
            <div key={challenge.id} className="fv-card p-3 sm:p-4">
              <div 
                className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 cursor-pointer"
                onClick={() => toggleExpand(challenge.id)}
              >
                <div className="shrink-0">
                  {challenge.challengeType ? getChallengeTypeIcon(challenge.challengeType) : getStatusIcon(challenge.status)}
                </div>
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-2 sm:gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-sm sm:text-base">{challenge.title}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">{challenge.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {challenge.challengeType && (
                        <span className="fv-badge text-xs bg-muted text-muted-foreground capitalize">
                          {challenge.challengeType}
                        </span>
                      )}
                      <span className={cn('fv-badge text-xs capitalize', getSeverityBadge(challenge.severity))}>
                        {challenge.severity}
                      </span>
                      <span className={cn('fv-badge text-xs capitalize', getStatusBadge(challenge.status))}>
                        {challenge.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                    <span>
                      Identified: {formatDate(challenge.dateIdentified)}
                    </span>
                    {challenge.dateResolved && (
                      <span>
                        Resolved: {formatDate(challenge.dateResolved)}
                      </span>
                    )}
                    {challenge.stageName && (
                      <span className="text-xs">
                        Stage: {challenge.stageName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditChallenge(challenge);
                    }}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                    title="Edit challenge"
                  >
                    <Edit className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button 
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(challenge.id);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t space-y-3 sm:space-y-4">
                  {challenge.whatWasDone && (
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                        <WrenchIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                        What Was Done
                      </h4>
                      <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap break-words">{challenge.whatWasDone}</p>
                    </div>
                  )}

                  {(challenge.itemsUsed && challenge.itemsUsed.length > 0) || ((challenge as any).chemicalsUsed && (challenge as any).chemicalsUsed.length > 0) ? (
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                        <Package className="h-3 w-3 sm:h-4 sm:w-4" />
                        Items Used
                      </h4>
                      <div className="space-y-2">
                        {(challenge.itemsUsed || (challenge as any).chemicalsUsed || []).map((item: any, idx: number) => {
                          const itemName = item.itemName || item.inventoryItemName || allInventoryItems.find(i => i.id === item.inventoryItemId)?.name || 'Unknown Item';
                          const needsPurchase = item.needsPurchase || !item.inventoryItemId;
                          return (
                            <div key={idx} className={cn("fv-card p-2 sm:p-3 text-xs sm:text-sm", needsPurchase && "border-fv-warning/50 bg-fv-warning/5")}>
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium break-words">{itemName}</span>
                                  <span className="text-muted-foreground ml-2">
                                    {item.quantity ? `${item.quantity} ` : ''}{item.unit}
                                  </span>
                                  <span className="text-xs text-muted-foreground ml-2 capitalize">
                                    ({item.category || 'chemical'})
                                  </span>
                                </div>
                                {needsPurchase && (
                                  <span className="fv-badge fv-badge--warning text-xs shrink-0">Needs Purchase</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {challenge.plan2IfFails && (
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-fv-warning" />
                        Plan 2 (If Current Solution Fails)
                      </h4>
                      <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap break-words">{challenge.plan2IfFails}</p>
                    </div>
                  )}

                  {!challenge.whatWasDone && !challenge.itemsUsed?.length && !(challenge as any).chemicalsUsed?.length && !challenge.plan2IfFails && (
                    <p className="text-xs sm:text-sm text-muted-foreground italic">No additional details recorded. Click Edit to add details.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

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

      {/* Edit Challenge Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-[90vw] md:w-full max-w-[95vw] sm:max-w-4xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Edit Challenge</DialogTitle>
          </DialogHeader>
          {editingChallenge && (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Title</label>
                <input
                  className="fv-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Description</label>
                <textarea
                  className="fv-input resize-none"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Challenge Type</label>
                  <Select value={editChallengeType} onValueChange={(value) => setEditChallengeType(value as ChallengeType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select challenge type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weather">Weather</SelectItem>
                      <SelectItem value="pests">Pests</SelectItem>
                      <SelectItem value="diseases">Diseases</SelectItem>
                      <SelectItem value="prices">Prices</SelectItem>
                      <SelectItem value="labor">Labour / People</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="other">Custom (not listed)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Severity</label>
                  <Select value={editSeverity} onValueChange={(value) => setEditSeverity(value as 'low' | 'medium' | 'high')}>
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
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={editStatus} onValueChange={(value) => setEditStatus(value as 'identified' | 'mitigating' | 'resolved')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="identified">Identified</SelectItem>
                    <SelectItem value="mitigating">Mitigating</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">What Was Done</label>
                <textarea
                  className="fv-input resize-none"
                  rows={4}
                  value={editWhatWasDone}
                  onChange={(e) => setEditWhatWasDone(e.target.value)}
                  placeholder="Describe the actions taken to address this challenge..."
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Items Used</label>
                  <button
                    type="button"
                    onClick={addItemToEdit}
                    className="fv-btn fv-btn--secondary text-xs py-1 px-2"
                  >
                    <Plus className="h-3 w-3" />
                    Add Item
                  </button>
                </div>
                {editItemsUsed.map((item, idx) => {
                  // Check if item exists in inventory
                  const existingItem = allInventoryItems.find(
                    inv => inv.name.toLowerCase() === item.itemName.toLowerCase() && inv.category === item.category
                  );
                  const needsPurchase = !existingItem && item.itemName.trim() !== '';
                  
                  return (
                    <div key={idx} className={cn("fv-card p-3 space-y-2", needsPurchase && "border-fv-warning/50 bg-fv-warning/5")}>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="col-span-1 sm:col-span-4">
                          <label className="text-xs text-muted-foreground mb-1 block">Item (from inventory)</label>
                          <Select
                            value={item.inventoryItemId || ''}
                            onValueChange={(value) => {
                              const inv = allInventoryItems.find(i => i.id === value);
                              if (inv) {
                                updateItemInEdit(idx, 'inventoryItemId', inv.id);
                                updateItemInEdit(idx, 'itemName', inv.name);
                                updateItemInEdit(idx, 'category', inv.category);
                                updateItemInEdit(idx, 'unit', inv.unit);
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select item from inventory" />
                            </SelectTrigger>
                            <SelectContent>
                              {allInventoryItems.map((inv) => (
                                <SelectItem key={inv.id} value={inv.id}>
                                  {inv.name} ({inv.category})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-1 sm:col-span-3">
                          <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                          <Select
                            value={item.category}
                            onValueChange={(value) => updateItemInEdit(idx, 'category', value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="chemical">Chemical</SelectItem>
                              <SelectItem value="fertilizer">Fertilizer</SelectItem>
                              <SelectItem value="diesel">Diesel</SelectItem>
                              <SelectItem value="materials">Materials</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                          <label className="text-xs text-muted-foreground mb-1 block">Quantity (optional)</label>
                          <input
                            type="number"
                            className="fv-input w-full"
                            value={item.quantity !== undefined && item.quantity !== null ? item.quantity : ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                              updateItemInEdit(idx, 'quantity', value !== undefined && !isNaN(value) ? value : undefined);
                            }}
                            placeholder="Qty (optional)"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                          <label className="text-xs text-muted-foreground mb-1 block">Unit</label>
                          <input
                            className="fv-input w-full"
                            value={item.unit}
                            onChange={(e) => updateItemInEdit(idx, 'unit', e.target.value)}
                            placeholder="Unit"
                          />
                        </div>
                        <div className="col-span-1 sm:col-span-1">
                          <button
                            type="button"
                            onClick={() => removeItemFromEdit(idx)}
                            className="fv-btn fv-btn--secondary w-full p-2"
                            title="Remove item"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {needsPurchase && (
                        <div className="flex items-center gap-2 text-xs text-fv-warning">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Item not in inventory - will be marked for purchase</span>
                        </div>
                      )}
                      {existingItem && (
                        <div className="flex items-center gap-2 text-xs text-fv-success">
                          <CheckCircle className="h-3 w-3" />
                          <span>Item found in inventory</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Plan 2 (If Current Solution Fails)</label>
                <textarea
                  className="fv-input resize-none"
                  rows={3}
                  value={editPlan2IfFails}
                  onChange={(e) => setEditPlan2IfFails(e.target.value)}
                  placeholder="Describe the backup plan if the current solution doesn't work..."
                />
              </div>
              <DialogFooter>
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingSaving || !editTitle.trim() || !editDescription.trim()}
                  className="fv-btn fv-btn--primary"
                  onClick={(e) => {
                    // Ensure form submission isn't blocked
                    if (!editTitle.trim() || !editDescription.trim()) {
                      e.preventDefault();
                      alert('Please fill in the title and description fields.');
                      return;
                    }
                  }}
                >
                  {editingSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
