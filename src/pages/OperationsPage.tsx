import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Wrench, MoreHorizontal, CheckCircle, Clock, CalendarDays, X, Banknote } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { WorkLog, Employee, CropStage, InventoryItem, InventoryCategory, User, Expense, ExpenseCategory, OperationsWorkCard } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentStageForProject } from '@/services/stageService';
import { useWorkCardsForCompany, useInvalidateWorkCards } from '@/hooks/useWorkCards';
import {
  createWorkCard,
  updateWorkCard,
  approveWorkCard,
  rejectWorkCard,
  canAdminApproveOrReject,
} from '@/services/operationsWorkCardService';
import { recordInventoryUsage } from '@/services/inventoryService';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { getCompany } from '@/services/companyService';
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
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { toDate, formatDate } from '@/lib/dateUtils';

export default function OperationsPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allWorkLogs = [], isLoading } = useCollection<WorkLog>('workLogs', 'workLogs');
  const { data: allEmployees = [] } = useCollection<Employee>('employees', 'employees');
  const { data: allUsers = [] } = useCollection<User>('users', 'users');
  const { data: allStages = [] } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allInventoryItems = [] } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');
  // Available categories = only those that exist in company inventory (for plan work / inputs)
  const availableCategories = useMemo(() => {
    const inv = activeProject
      ? allInventoryItems.filter((i) => i.companyId === activeProject.companyId)
      : allInventoryItems;
    const cats = new Set<string>();
    inv.forEach((i) => cats.add(i.category));
    return Array.from(cats).sort();
  }, [allInventoryItems, activeProject]);

  const [search, setSearch] = useState('');

  const workLogs = useMemo(() => {
    const scoped = activeProject
      ? allWorkLogs.filter((w) => w.projectId === activeProject.id)
      : allWorkLogs;

    if (!search) return scoped;
    return scoped.filter((w) =>
      w.workCategory.toLowerCase().includes(search.toLowerCase()) ||
      (w.notes ?? '').toLowerCase().includes(search.toLowerCase()),
    );
  }, [allWorkLogs, activeProject, search]);

  const getPaidBadge = (paid?: boolean) =>
    paid ? 'fv-badge--active' : 'fv-badge--warning';

  const getPaidIcon = (paid?: boolean) =>
    paid ? <CheckCircle className="h-5 w-5 text-fv-success" /> : <Clock className="h-5 w-5 text-fv-warning" />;

  const getWorkTypeIcon = (workType?: string) => {
    if (!workType) return '🧑‍🌾';
    const map: Record<string, string> = {
      'Spraying': '💦',
      'Fertilizer application': '🌾',
      'Watering': '💧',
      'Weeding': '🌱',
      'Tying of crops': '🪢',
    };
    return map[workType] || '🧑‍🌾';
  };

  const getAssigneeName = (id?: string) => {
    if (!id) return 'Unassigned';
    const employee = allEmployees.find(e => e.id === id);
    const userMatch = allUsers.find(u => u.id === id);
    return employee?.name || userMatch?.name || 'Unknown';
  };

  const getAssignedEmployeeName = (log: WorkLog) => {
    if (log.employeeName) return log.employeeName;
    if (log.employeeId) return getAssigneeName(log.employeeId);
    return 'Unassigned';
  };

  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<WorkLog | null>(null);
  const [editLog, setEditLog] = useState<WorkLog | null>(null);
  const [previousWorkData, setPreviousWorkData] = useState<any>(null);
  const [date, setDate] = useState<Date | undefined>(() => {
    const today = new Date();
    return today;
  });
  const [workCategory, setWorkCategory] = useState('');
  const [workType, setWorkType] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState('');
  const [ratePerPerson, setRatePerPerson] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedStageIndex, setSelectedStageIndex] = useState<number | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [dateInput, setDateInput] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Sync dateInput when date changes from calendar
  useEffect(() => {
    if (date && date instanceof Date) {
      setDateInput(date.toISOString().split('T')[0]);
    }
  }, [date]);
  const [notes, setNotes] = useState('');
  const [changeReason, setChangeReason] = useState('');

  const BASE_WORK_TYPES = ['Spraying', 'Fertilizer application', 'Watering', 'Weeding', 'Tying of crops'];
  const { data: company } = useQuery({
    queryKey: ['company', user?.companyId],
    queryFn: () => getCompany(user!.companyId!),
    enabled: !!user?.companyId,
  });
  const workTypesList = useMemo(() => {
    const custom = (company as { customWorkTypes?: string[] } | undefined)?.customWorkTypes ?? [];
    return [...BASE_WORK_TYPES, ...custom];
  }, [company]);
  const [saving, setSaving] = useState(false);
  const [wateringContainers, setWateringContainers] = useState('');
  const [tyingUsedType, setTyingUsedType] = useState<'ropes' | 'sacks'>('ropes');
  const [markingPaid, setMarkingPaid] = useState(false);

  // Work cards (operationsWorkCards): Admin creates; Admin views Planned vs Actual and approves/rejects
  const companyIdForCards = activeProject?.companyId ?? user?.companyId ?? null;
  const { data: workCards = [] } = useWorkCardsForCompany(companyIdForCards);
  const invalidateWorkCards = useInvalidateWorkCards();
  const workCardsForProject = useMemo(() => {
    if (!activeProject) return workCards;
    return workCards.filter((c) => c.projectId === activeProject.id);
  }, [workCards, activeProject]);

  /** Cards still in progress: planned, submitted, or rejected (shown in Work Cards grid). */
  const workCardsInProgress = useMemo(() => {
    return workCardsForProject.filter(
      (c) => c.status === 'planned' || c.status === 'submitted' || c.status === 'rejected'
    );
  }, [workCardsForProject]);

  /** Approved or paid cards (shown in Work Logs section). */
  const approvedOrPaidWorkCards = useMemo(() => {
    return workCardsForProject.filter(
      (c) => c.status === 'approved' || c.status === 'paid' || c.payment?.isPaid
    );
  }, [workCardsForProject]);

  /** Combined list for Work Logs section: work logs + approved/paid work cards, sorted by date (newest first). */
  const combinedWorkEntries = useMemo(() => {
    const toTime = (d: unknown) => {
      if (!d) return 0;
      const date = (d as { toDate?: () => Date })?.toDate?.() ?? new Date(d as Date);
      return date.getTime();
    };
    const logEntries = workLogs.map((log) => ({ type: 'workLog' as const, log, sortTime: toTime(log.date) }));
    const cardEntries = approvedOrPaidWorkCards.map((card) => {
      const t = toTime(card.actual?.actualDate ?? card.approvedAt ?? card.createdAt);
      return { type: 'workCard' as const, card, sortTime: t };
    });
    return [...logEntries, ...cardEntries].sort((a, b) => b.sortTime - a.sortTime);
  }, [workLogs, approvedOrPaidWorkCards]);

  const totalLabourFromWorkCards = useMemo(() => {
    return workCardsForProject.reduce((sum, card) => {
      const w = card.actual?.actualWorkers ?? 0;
      const r = card.actual?.ratePerPerson ?? 0;
      return sum + w * r;
    }, 0);
  }, [workCardsForProject]);

  const operationsStats = useMemo(() => {
    const paidLogs = workLogs.filter((w) => w.paid).length;
    const paidCards = workCardsForProject.filter((c) => c.payment?.isPaid || c.status === 'paid').length;
    const unpaidLogs = workLogs.filter((w) => !w.paid).length;
    const unpaidCards = workCardsForProject.filter((c) => !(c.payment?.isPaid || c.status === 'paid')).length;
    const labourFromLogs = workLogs.reduce((sum, log) => sum + (log.totalPrice ?? log.managerSubmittedTotalPrice ?? 0), 0);
    return {
      paid: paidLogs + paidCards,
      unpaid: unpaidLogs + unpaidCards,
      total: workLogs.length + workCardsForProject.length,
      totalLabour: totalLabourFromWorkCards + labourFromLogs,
    };
  }, [workLogs, workCardsForProject, totalLabourFromWorkCards]);

  const [addCardOpen, setAddCardOpen] = useState(false);
  const [selectedWorkCard, setSelectedWorkCard] = useState<OperationsWorkCard | null>(null);
  const [workCardModalOpen, setWorkCardModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [savingCard, setSavingCard] = useState(false);
  const [savingCardUpdate, setSavingCardUpdate] = useState(false);
  const [approvingCard, setApprovingCard] = useState(false);
  const [rejectingCard, setRejectingCard] = useState(false);
  const [workCardEditMode, setWorkCardEditMode] = useState(false);
  // Create card form state
  const [cardWorkTitle, setCardWorkTitle] = useState('');
  const [cardWorkCategory, setCardWorkCategory] = useState('');
  const [cardPlannedWorkers, setCardPlannedWorkers] = useState('');
  /** Single planned resource: item + quantity (and optional secondary e.g. kg/litres). Cleared when work category changes. */
  const [cardPlannedItemId, setCardPlannedItemId] = useState('');
  const [cardPlannedQuantity, setCardPlannedQuantity] = useState('');
  const [cardPlannedQuantitySecondary, setCardPlannedQuantitySecondary] = useState('');
  const [cardEstimatedCost, setCardEstimatedCost] = useState('');
  const [cardAllocatedManagerId, setCardAllocatedManagerId] = useState('');
  const [cardStageId, setCardStageId] = useState('');
  const [cardStageName, setCardStageName] = useState('');

  /** Build planned resource string from selected item + quantity for the current work category */
  const buildPlannedResourceString = (): { inputs?: string; fuel?: string; chemicals?: string; fertilizer?: string } => {
    const item = selectedPlannedItem;
    if (!item || !cardPlannedItemId) return {};
    const q = cardPlannedQuantity?.trim();
    const q2 = cardPlannedQuantitySecondary?.trim();
    let str = item.name;
    if (q) {
      const unitLabel = item.category === 'fertilizer' ? 'bags' : item.category === 'fuel' || item.category === 'diesel' ? 'containers' : item.unit || '';
      str += ` - ${q}${unitLabel ? ` ${unitLabel}` : ''}`;
      if (q2) {
        if (item.category === 'fertilizer') str += `, ${q2} kg`;
        else if (item.category === 'fuel' || item.category === 'diesel') str += `, ${q2} L`;
      }
    }
    switch (cardWorkCategory) {
      case 'Fertilizer application':
        return { fertilizer: str };
      case 'Spraying':
        return { chemicals: str };
      case 'Watering':
        return { fuel: str };
      case 'Tying of crops':
      case 'Weeding':
      default:
        return { inputs: str };
    }
  };

  const handleCreateWorkCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !user?.companyId || !user?.email) return;
    const stage = projectStages.find((s) => s.id === cardStageId) ?? projectStages.find((s) => s.stageName === cardStageName);
    if (!stage) return;
    const resource = buildPlannedResourceString();
    setSavingCard(true);
    try {
      await createWorkCard({
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        stageId: stage.id,
        stageName: stage.stageName,
        workTitle: cardWorkTitle || cardWorkCategory,
        workCategory: cardWorkCategory,
        planned: {
          date: date,
          workers: Number(cardPlannedWorkers || '0'),
          inputs: resource.inputs,
          fuel: resource.fuel,
          chemicals: resource.chemicals,
          fertilizer: resource.fertilizer,
          estimatedCost: cardEstimatedCost ? Number(cardEstimatedCost) : undefined,
        },
        allocatedManagerId: (cardAllocatedManagerId && cardAllocatedManagerId !== '__unassigned__') ? cardAllocatedManagerId : null,
        createdByAdminId: user.id,
        actorEmail: user.email,
        actorUid: user.id,
      });
      invalidateWorkCards();
      setAddCardOpen(false);
      setCardWorkTitle('');
      setCardWorkCategory('');
      setCardPlannedWorkers('');
      setCardPlannedItemId('');
      setCardPlannedQuantity('');
      setCardPlannedQuantitySecondary('');
      setCardEstimatedCost('');
      setCardAllocatedManagerId('');
      setCardStageId('');
      setCardStageName('');
    } finally {
      setSavingCard(false);
    }
  };

  const handleApproveWorkCard = async () => {
    if (!selectedWorkCard || !user) return;
    setApprovingCard(true);
    try {
      await approveWorkCard({
        cardId: selectedWorkCard.id,
        approvedBy: user.id,
        actorEmail: user.email,
        actorUid: user.id,
      });
      invalidateWorkCards();
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryUsage'] });
      setSelectedWorkCard({ ...selectedWorkCard, status: 'approved' });
    } finally {
      setApprovingCard(false);
    }
  };

  const handleRejectWorkCard = async () => {
    if (!selectedWorkCard || !user || !rejectReason.trim()) return;
    setRejectingCard(true);
    try {
      await rejectWorkCard({
        cardId: selectedWorkCard.id,
        rejectionReason: rejectReason.trim(),
        actorEmail: user.email,
        actorUid: user.id,
      });
      invalidateWorkCards();
      setSelectedWorkCard({ ...selectedWorkCard, status: 'rejected', rejectionReason: rejectReason.trim() });
      setRejectReason('');
    } finally {
      setRejectingCard(false);
    }
  };

  const startEditWorkCard = () => {
    if (!selectedWorkCard) return;
    setCardWorkTitle(selectedWorkCard.workTitle ?? '');
    setCardWorkCategory(selectedWorkCard.workCategory ?? '');
    setCardPlannedWorkers(String(selectedWorkCard.planned?.workers ?? ''));
    setCardPlannedItemId('');
    setCardPlannedQuantity('');
    setCardPlannedQuantitySecondary('');
    setCardEstimatedCost(selectedWorkCard.planned?.estimatedCost != null ? String(selectedWorkCard.planned.estimatedCost) : '');
    setCardAllocatedManagerId(selectedWorkCard.allocatedManagerId ?? '');
    setCardStageId(selectedWorkCard.stageId ?? '');
    setCardStageName(selectedWorkCard.stageName ?? '');
    setWorkCardEditMode(true);
  };

  const handleUpdateWorkCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkCard || !user?.email) return;
    const resource = cardPlannedItemId ? buildPlannedResourceString() : {};
    const planned = {
      date: selectedWorkCard.planned?.date,
      workers: Number(cardPlannedWorkers || '0'),
      inputs: resource.inputs ?? selectedWorkCard.planned?.inputs,
      fuel: resource.fuel ?? selectedWorkCard.planned?.fuel,
      chemicals: resource.chemicals ?? selectedWorkCard.planned?.chemicals,
      fertilizer: resource.fertilizer ?? selectedWorkCard.planned?.fertilizer,
      estimatedCost: cardEstimatedCost ? Number(cardEstimatedCost) : undefined,
    };
    setSavingCardUpdate(true);
    try {
      await updateWorkCard({
        cardId: selectedWorkCard.id,
        workTitle: cardWorkTitle || cardWorkCategory,
        workCategory: cardWorkCategory,
        stageId: cardStageId || undefined,
        stageName: cardStageName || undefined,
        planned,
        allocatedManagerId: (cardAllocatedManagerId && cardAllocatedManagerId !== '__unassigned__') ? cardAllocatedManagerId : null,
        actorEmail: user.email,
        actorUid: user.id,
      });
      invalidateWorkCards();
      setSelectedWorkCard({
        ...selectedWorkCard,
        workTitle: cardWorkTitle || cardWorkCategory,
        workCategory: cardWorkCategory,
        stageId: cardStageId || selectedWorkCard.stageId,
        stageName: cardStageName || selectedWorkCard.stageName,
        planned: { ...selectedWorkCard.planned, ...planned } as typeof selectedWorkCard.planned,
        allocatedManagerId: (cardAllocatedManagerId && cardAllocatedManagerId !== '__unassigned__') ? cardAllocatedManagerId : null,
      });
      setWorkCardEditMode(false);
    } finally {
      setSavingCardUpdate(false);
    }
  };

  /** Variance display: Match = green, slight = yellow, large = red */
  const getVarianceClass = (planned: number, actual: number | undefined): string => {
    if (actual == null) return 'text-muted-foreground';
    const diff = actual - planned;
    if (diff === 0) return 'text-green-600';
    const pct = planned === 0 ? (diff > 0 ? 100 : 0) : Math.abs((diff / planned) * 100);
    if (pct <= 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Auto-calculate total price
  const totalPrice = useMemo(() => {
    const people = Number(numberOfPeople || '0');
    const rate = Number(ratePerPerson || '0');
    return people * rate;
  }, [numberOfPeople, ratePerPerson]);

  // Filter employees by company
  const companyEmployees = useMemo(() => {
    if (!activeProject) return allEmployees;
    return allEmployees.filter(e => e.companyId === activeProject.companyId && e.status === 'active');
  }, [allEmployees, activeProject]);

  type InputUsageItem = {
    id: string;
    type: InventoryCategory;
    itemId: string;
    quantity: string;
    drumsSprayed?: string;
  };

  const [inputUsages, setInputUsages] = useState<InputUsageItem[]>([]);

  const currentStage = useMemo(() => {
    if (!activeProject) return null;
    const stages = allStages.filter(
      (s) =>
        s.projectId === activeProject.id &&
        s.companyId === activeProject.companyId &&
        s.cropType === activeProject.cropType,
    );
    return getCurrentStageForProject(stages);
  }, [allStages, activeProject]);

  // Get all stages for the project (sorted by stageIndex)
  const projectStages = useMemo(() => {
    if (!activeProject) return [];
    return allStages
      .filter(
        (s) =>
          s.projectId === activeProject.id &&
          s.companyId === activeProject.companyId &&
          s.cropType === activeProject.cropType,
      )
      .sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0));
  }, [allStages, activeProject]);

  // Get managers (users with manager or company-admin role, or employees with operations-manager role).
  // Dedupe by auth identity: same person can be both a user (manager) and an employee (operations-manager) — show once.
  const managers = useMemo(() => {
    if (!activeProject) return [];
    const companyId = activeProject.companyId;

    const managerUsers = allUsers
      .filter(u => u.companyId === companyId && (u.role === 'manager' || u.role === 'company-admin'))
      .map(u => ({ id: u.id, name: u.name, role: u.role, type: 'user' as const, authId: u.id }));

    const managerEmployees = companyEmployees
      .filter(e => e.role === 'operations-manager' || e.role.includes('manager'))
      .map(e => ({
        id: e.id,
        name: e.name,
        role: 'operations-manager' as const,
        type: 'employee' as const,
        authId: (e as Employee & { authUserId?: string }).authUserId ?? e.id,
      }));

    // One entry per person by authId; prefer employee entry so label is "Operations (Manager)" and we store employee id for allocation
    const byAuthId = new Map<string, { id: string; name: string; role: string; type: 'user' | 'employee' }>();
    managerUsers.forEach(m => byAuthId.set(m.authId, { id: m.id, name: m.name, role: m.role, type: 'user' }));
    managerEmployees.forEach(m => {
      byAuthId.set(m.authId, { id: m.id, name: m.name, role: m.role, type: 'employee' });
    });

    let uniqueManagers = Array.from(byAuthId.values());

    if (user && (user.role === 'manager' || user.role === 'company-admin') && user.companyId === companyId) {
      const userExists = uniqueManagers.some(m => m.id === user.id || (m.type === 'employee' && (allEmployees.find(e => e.id === m.id) as Employee & { authUserId?: string })?.authUserId === user.id));
      if (!userExists) {
        uniqueManagers = [{ id: user.id, name: user.name, role: user.role, type: 'user' as const }, ...uniqueManagers];
      }
    }

    return uniqueManagers;
  }, [allUsers, companyEmployees, allEmployees, activeProject, user]);

  // Get the selected stage or default to current stage
  const selectedStage = useMemo(() => {
    if (selectedStageIndex !== null) {
      return projectStages.find(s => s.stageIndex === selectedStageIndex) || currentStage;
    }
    return currentStage;
  }, [selectedStageIndex, projectStages, currentStage]);

  // Handle date input changes (flexible: typed or selected)
  const handleDateChange = (value: string | Date | undefined) => {
    if (typeof value === 'string') {
      setDateInput(value);
      // Try to parse the string as a date
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        setDate(parsed);
      }
    } else if (value instanceof Date) {
      setDate(value);
      setDateInput(value.toISOString().split('T')[0]); // Format as YYYY-MM-DD
    } else {
      setDate(undefined);
      setDateInput('');
    }
  };

  const companyInventory = useMemo(
    () =>
      activeProject
        ? allInventoryItems.filter((i) => i.companyId === activeProject.companyId)
        : allInventoryItems,
    [allInventoryItems, activeProject],
  );

  const chemicalItems = useMemo(
    () => companyInventory.filter((i) => i.category === 'chemical'),
    [companyInventory],
  );
  const fertilizerItems = useMemo(
    () => companyInventory.filter((i) => i.category === 'fertilizer'),
    [companyInventory],
  );
  const fuelItems = useMemo(
    () => companyInventory.filter((i) => i.category === 'diesel' || i.category === 'fuel'),
    [companyInventory],
  );

  /** Inventory items for "Planned inputs" (materials, ropes, sacks) - used in work card form */
  const inputsItems = useMemo(
    () => companyInventory.filter((i) => ['materials', 'ropes', 'sacks'].includes(i.category)),
    [companyInventory],
  );

  /** Which inventory list to show for planned resource based on work category */
  const plannedResourceItems = useMemo(() => {
    if (!cardWorkCategory) return [];
    switch (cardWorkCategory) {
      case 'Fertilizer application':
        return fertilizerItems;
      case 'Spraying':
        return chemicalItems;
      case 'Watering':
        return fuelItems;
      case 'Tying of crops':
        return inputsItems.filter((i) => i.category === 'ropes' || i.category === 'sacks');
      case 'Weeding':
        return inputsItems;
      default:
        return inputsItems;
    }
  }, [cardWorkCategory, fertilizerItems, chemicalItems, fuelItems, inputsItems]);

  const selectedPlannedItem = useMemo(
    () => (cardPlannedItemId ? companyInventory.find((i) => i.id === cardPlannedItemId) : null),
    [cardPlannedItemId, companyInventory],
  );

  const handleWorkCategoryChange = (value: string) => {
    setCardWorkCategory(value);
    setCardPlannedItemId('');
    setCardPlannedQuantity('');
    setCardPlannedQuantitySecondary('');
  };

  const addInputUsage = (type?: InventoryCategory) => {
    setInputUsages([
      ...inputUsages,
      { id: Date.now().toString(), type: type || 'fertilizer', itemId: '', quantity: '' },
    ]);
  };

  const removeInputUsage = (id: string) => {
    setInputUsages(inputUsages.filter((item) => item.id !== id));
  };

  const updateInputUsage = (id: string, field: keyof InputUsageItem, value: string) => {
    setInputUsages(
      inputUsages.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // If category changes, clear the selected item
          if (field === 'type') {
            updated.itemId = '';
          }
          return updated;
        }
        return item;
      }),
    );
  };

  const getItemsForCategory = (category: InventoryCategory) => {
    return companyInventory.filter(
      (i) => i.category === category || (category === 'diesel' && i.category === 'fuel'),
    );
  };

  const handleAddWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    if (!date || !selectedStage) return;
    setSaving(true);
    try {
      const numPeople = Number(numberOfPeople || '0');
      const rate = ratePerPerson ? Number(ratePerPerson) : undefined;
      const calculatedTotal = numPeople * (rate || 0);
      
      const selectedEmployees = selectedEmployeeIds
        .map(id => companyEmployees.find(e => e.id === id))
        .filter(Boolean);
      const employeeNames = selectedEmployees.map(e => e?.name).filter(Boolean).join(', ');

      const finalManagerId = selectedManagerId || user?.id || undefined;
      const selectedManager = finalManagerId 
        ? (managers.find(m => m.id === finalManagerId) || (user && finalManagerId === user.id ? { id: user.id, name: user.name, role: user.role } : null))
        : null;
      const finalManagerName = selectedManager?.name || (finalManagerId === user?.id ? user?.name : undefined);

      const workLogData: any = {
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        cropType: activeProject.cropType,
        stageIndex: selectedStage.stageIndex,
        stageName: selectedStage.stageName,
        date,
        workCategory,
        workType: workType || undefined,
        numberOfPeople: numPeople,
        ratePerPerson: rate,
        totalPrice: calculatedTotal > 0 ? calculatedTotal : undefined,
        employeeId: selectedEmployeeIds[0] || undefined, // Keep for backward compatibility
        employeeName: employeeNames || undefined,
        notes: notes || undefined,
        wateringContainersUsed: workType === 'Watering' && wateringContainers ? parseQuantityOrFraction(wateringContainers) : undefined,
        tyingUsedType: workType === 'Tying of crops' ? tyingUsedType : undefined,
        changeReason: changeReason || undefined,
        managerId: finalManagerId,
        managerName: finalManagerName,
        adminName: user?.name,
        paid: false,
        createdAt: serverTimestamp(),
      };

      // Only include employeeIds if it has values (Firestore doesn't allow undefined)
      if (selectedEmployeeIds.length > 0) {
        workLogData.employeeIds = selectedEmployeeIds;
      }

      // Remove undefined values to avoid Firestore errors
      Object.keys(workLogData).forEach(key => {
        if (workLogData[key] === undefined) {
          delete workLogData[key];
        }
      });

      const workLogRef = await addDoc(collection(db, 'workLogs'), workLogData);
      const workLogId = workLogRef.id;

      const usageDate = date instanceof Date ? date : new Date(date);

      const recordIfNeeded = async (
        category: InventoryCategory,
        inventoryItemId: string,
        quantityStr: string,
        extra?: { drumsSprayed?: number },
      ) => {
        const quantityVal = parseQuantityOrFraction(quantityStr || '0');
        if (!inventoryItemId || quantityVal <= 0) return;
        const item = companyInventory.find((i) => i.id === inventoryItemId);
        if (!item) return;
        await recordInventoryUsage({
          companyId: activeProject.companyId,
          projectId: activeProject.id,
          inventoryItemId,
          category,
          quantity: quantityVal,
          unit: item.unit,
          source: 'workLog',
          workLogId,
          stageIndex: selectedStage.stageIndex,
          stageName: selectedStage.stageName,
          date: usageDate,
        });
      };

      await Promise.all(
        inputUsages
          .filter((usage) => usage.itemId && usage.quantity)
          .map((usage) =>
            recordIfNeeded(
              usage.type,
              usage.itemId,
              usage.quantity,
              usage.type === 'chemical' && usage.drumsSprayed
                ? { drumsSprayed: Number(usage.drumsSprayed || '0') || undefined }
                : undefined,
            ),
          ),
      );

      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryUsage'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });

      // Clear form but keep modal open for multiple entries
      setWorkCategory('');
      setWorkType('');
      setNumberOfPeople('');
      setRatePerPerson('');
      setWateringContainers('');
      setTyingUsedType('ropes');
      setSelectedEmployeeIds([]);
      setSelectedStageIndex(null);
      setSelectedManagerId('');
      setNotes('');
      setChangeReason('');
      setInputUsages([]);
      const today = new Date();
      setDate(today);
      setDateInput(today.toISOString().split('T')[0]);
      setEditLog(null);
      setPreviousWorkData(null);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleEditWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !editLog || !editLog.id) return;
    if (!date || !selectedStage) return;
    setSaving(true);
    try {
      const numPeople = Number(numberOfPeople || '0');
      const rate = ratePerPerson ? Number(ratePerPerson) : undefined;
      const calculatedTotal = numPeople * (rate || 0);
      
      const selectedEmployees = selectedEmployeeIds
        .map(id => companyEmployees.find(e => e.id === id))
        .filter(Boolean);
      const employeeNames = selectedEmployees.map(e => e?.name).filter(Boolean).join(', ');

      const finalManagerId = selectedManagerId || user?.id || undefined;
      const selectedManager = finalManagerId 
        ? (managers.find(m => m.id === finalManagerId) || (user && finalManagerId === user.id ? { id: user.id, name: user.name, role: user.role } : null))
        : null;
      const finalManagerName = selectedManager?.name || (finalManagerId === user?.id ? user?.name : undefined);

      const updateData: any = {
        stageIndex: selectedStage.stageIndex,
        stageName: selectedStage.stageName,
        date,
        workCategory,
        workType: workType || undefined,
        numberOfPeople: numPeople,
        ratePerPerson: rate,
        totalPrice: calculatedTotal > 0 ? calculatedTotal : undefined,
        employeeId: selectedEmployeeIds[0] || undefined,
        employeeName: employeeNames || undefined,
        notes: notes || undefined,
        changeReason: changeReason || undefined,
        managerId: finalManagerId,
        managerName: finalManagerName,
      };

      if (selectedEmployeeIds.length > 0) {
        updateData.employeeIds = selectedEmployeeIds;
      }

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const workLogRef = doc(db, 'workLogs', editLog.id);
      await updateDoc(workLogRef, updateData);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });

      // Reset form
      setWorkCategory('');
      setNumberOfPeople('');
      setRatePerPerson('');
      setWateringContainers('');
      setTyingUsedType('ropes');
      setSelectedEmployeeIds([]);
      setSelectedStageIndex(null);
      setSelectedManagerId('');
      setNotes('');
      setChangeReason('');
      setInputUsages([]);
      const today = new Date();
      setDate(today);
      setDateInput(today.toISOString().split('T')[0]);
      setEditLog(null);
      setPreviousWorkData(null);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsPaid = async (log: WorkLog) => {
    if (!user || !log.id) return;
    setMarkingPaid(true);
    try {
      // Use manager submitted values if approved, otherwise use original values
      const finalNumberOfPeople = log.managerSubmissionStatus === 'approved' && log.managerSubmittedNumberOfPeople !== undefined
        ? log.managerSubmittedNumberOfPeople
        : log.numberOfPeople;
      
      const finalRatePerPerson = log.managerSubmissionStatus === 'approved' && log.managerSubmittedRatePerPerson !== undefined
        ? log.managerSubmittedRatePerPerson
        : log.ratePerPerson;
      
      const finalTotalPrice = log.managerSubmissionStatus === 'approved' && log.managerSubmittedTotalPrice !== undefined
        ? log.managerSubmittedTotalPrice
        : log.totalPrice;

      const amount = finalTotalPrice || (finalNumberOfPeople * (finalRatePerPerson || 0));

      // Update work log
      const logRef = doc(db, 'workLogs', log.id);
      await updateDoc(logRef, {
        paid: true,
        paidAt: serverTimestamp(),
        paidBy: user.id,
        paidByName: user.name,
      });

      // Create expense entry if there's an amount
      if (amount > 0) {
        const logDate = toDate(log.date) || new Date();
        const expenseRef = doc(collection(db, 'expenses'));
        const expense: Omit<Expense, 'id'> = {
          companyId: log.companyId,
          projectId: log.projectId,
          cropType: log.cropType,
          category: 'labour' as ExpenseCategory,
          description: `Labour - ${log.workCategory} on ${logDate.toLocaleDateString()}`,
          amount,
          date: logDate,
          stageIndex: log.stageIndex,
          stageName: log.stageName,
          syncedFromWorkLogId: log.id,
          synced: true,
          paid: true,
          paidAt: new Date(),
          paidBy: user.id,
          paidByName: user.name,
          createdAt: new Date(),
        };

        await addDoc(collection(db, 'expenses'), {
          ...expense,
          date: expense.date,
          createdAt: serverTimestamp(),
          paidAt: serverTimestamp(),
        });
      }

      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      if (selectedLog?.id === log.id) {
        setSelectedLog({ ...selectedLog, paid: true });
      }
    } catch (error) {
      console.error('Failed to mark as paid:', error);
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleApproveManagerSubmission = async (log: WorkLog) => {
    if (!user || !log.id) return;
    const logRef = doc(db, 'workLogs', log.id);
    // When approving, copy manager-submitted numeric fields into the main fields
    const update: any = {
      managerSubmissionStatus: 'approved' as const,
      approvedBy: user.id,
      approvedByName: user.name,
    };
    if (log.managerSubmittedNumberOfPeople !== undefined) {
      update.numberOfPeople = log.managerSubmittedNumberOfPeople;
    }
    if (log.managerSubmittedRatePerPerson !== undefined) {
      update.ratePerPerson = log.managerSubmittedRatePerPerson;
    }
    if (log.managerSubmittedTotalPrice !== undefined) {
      update.totalPrice = log.managerSubmittedTotalPrice;
    }
    try {
      await updateDoc(logRef, update);
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      if (selectedLog?.id === log.id) {
        setSelectedLog({ ...selectedLog, ...update });
      }
    } catch (error) {
      console.error('Failed to approve manager submission:', error);
    }
  };

  const handleRejectManagerSubmission = async (log: WorkLog) => {
    if (!user || !log.id) return;
    const logRef = doc(db, 'workLogs', log.id);
    try {
      await updateDoc(logRef, {
        managerSubmissionStatus: 'rejected',
        approvedBy: user.id,
        approvedByName: user.name,
      });
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      if (selectedLog?.id === log.id) {
        setSelectedLog({
          ...selectedLog,
          managerSubmissionStatus: 'rejected',
          approvedBy: user.id,
          approvedByName: user.name,
        });
      }
    } catch (error) {
      console.error('Failed to reject manager submission:', error);
    }
  };

  const handleViewLog = (log: WorkLog) => {
    setSelectedLog(log);
    setViewOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Daily Work Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Capture daily work for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'Record labour and input usage per day'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
            <DialogTrigger asChild>
              <button className="fv-btn fv-btn--primary" type="button">
                <Plus className="h-4 w-4" />
                Plan Today&apos;s Work
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg sm:max-w-2xl md:max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] md:w-full">
              <DialogHeader>
                <DialogTitle>Plan Today&apos;s Work</DialogTitle>
              </DialogHeader>
              {!activeProject ? (
                <p className="text-sm text-muted-foreground">Select a project first.</p>
              ) : (
                <form onSubmit={handleCreateWorkCard} className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                    <div className="col-span-1">
                      <label className="text-sm font-medium text-foreground">Work title / category</label>
                      <input
                        type="text"
                        className="fv-input w-full mt-1"
                        value={cardWorkTitle}
                        onChange={(e) => setCardWorkTitle(e.target.value)}
                        placeholder="e.g. Spraying"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="text-sm font-medium text-foreground">Work type</label>
                      <Select value={cardWorkCategory} onValueChange={handleWorkCategoryChange}>
                        <SelectTrigger className="w-full mt-1">
                          <SelectValue placeholder="Select work type first" />
                        </SelectTrigger>
                        <SelectContent>
                          {workTypesList.map((wt) => (
                            <SelectItem key={wt} value={wt}>{wt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1">
                      <label className="text-sm font-medium text-foreground">Stage</label>
                      <Select
                        value={cardStageId || cardStageName}
                        onValueChange={(val) => {
                          const s = projectStages.find((st) => st.id === val || st.stageName === val);
                          if (s) {
                            setCardStageId(s.id);
                            setCardStageName(s.stageName);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full mt-1">
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                        <SelectContent>
                          {projectStages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.stageName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1">
                      <label className="text-sm font-medium text-foreground">Planned workers</label>
                      <input
                        type="number"
                        min={0}
                        className="fv-input w-full mt-1"
                        value={cardPlannedWorkers}
                        onChange={(e) => setCardPlannedWorkers(e.target.value)}
                      />
                    </div>
                    {cardWorkCategory && (
                      <>
                        <div className="col-span-1">
                          <label className="text-sm font-medium text-foreground">
                            {cardWorkCategory === 'Fertilizer application' && 'Planned fertilizer'}
                            {cardWorkCategory === 'Spraying' && 'Planned chemical'}
                            {cardWorkCategory === 'Watering' && 'Planned fuel'}
                            {(cardWorkCategory === 'Tying of crops' || cardWorkCategory === 'Weeding') && 'Planned inputs (ropes/sacks/materials)'}
                            {!['Fertilizer application', 'Spraying', 'Watering', 'Tying of crops', 'Weeding'].includes(cardWorkCategory) && 'Planned resource'}
                          </label>
                          <Select value={cardPlannedItemId || '__none__'} onValueChange={(v) => { setCardPlannedItemId(v === '__none__' ? '' : v); setCardPlannedQuantity(''); setCardPlannedQuantitySecondary(''); }}>
                            <SelectTrigger className="w-full mt-1">
                              <SelectValue placeholder="Select from inventory" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {plannedResourceItems.map((item) => (
                                <SelectItem key={item.id} value={item.id}>{item.name} ({item.unit})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {selectedPlannedItem && (
                          <>
                            <div className="col-span-1">
                              <label className="text-sm font-medium text-foreground">
                                {selectedPlannedItem.category === 'fertilizer' && 'Bags'}
                                {(selectedPlannedItem.category === 'fuel' || selectedPlannedItem.category === 'diesel') && 'Containers'}
                                {selectedPlannedItem.category === 'chemical' && (selectedPlannedItem.packagingType === 'box' ? 'Boxes' : 'Units')}
                                {(selectedPlannedItem.category === 'ropes' || selectedPlannedItem.category === 'sacks' || selectedPlannedItem.category === 'materials') && `Amount (${selectedPlannedItem.unit})`}
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="fv-input w-full mt-1"
                                placeholder={selectedPlannedItem.category === 'fertilizer' ? 'e.g. 2' : selectedPlannedItem.category === 'chemical' ? 'e.g. 1' : 'e.g. 2'}
                                value={cardPlannedQuantity}
                                onChange={(e) => setCardPlannedQuantity(e.target.value)}
                              />
                            </div>
                            {(selectedPlannedItem.category === 'fertilizer' || selectedPlannedItem.category === 'fuel' || selectedPlannedItem.category === 'diesel') && (
                              <div className="col-span-1">
                                <label className="text-sm font-medium text-foreground">
                                  {selectedPlannedItem.category === 'fertilizer' ? 'Kgs (optional)' : 'Litres (optional)'}
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="fv-input w-full mt-1"
                                  placeholder={selectedPlannedItem.category === 'fertilizer' ? 'e.g. 50' : 'e.g. 20'}
                                  value={cardPlannedQuantitySecondary}
                                  onChange={(e) => setCardPlannedQuantitySecondary(e.target.value)}
                                />
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                    <div className="col-span-1">
                      <label className="text-sm font-medium text-foreground">Estimated cost (optional)</label>
                      <input type="number" min={0} className="fv-input w-full mt-1" value={cardEstimatedCost} onChange={(e) => setCardEstimatedCost(e.target.value)} />
                    </div>
                    <div className="col-span-1">
                      <label className="text-sm font-medium text-foreground">Allocate manager</label>
                      <Select
                        value={cardAllocatedManagerId || '__unassigned__'}
                        onValueChange={(val) => setCardAllocatedManagerId(val === '__unassigned__' ? '' : val)}
                      >
                        <SelectTrigger className="w-full mt-1">
                          <SelectValue placeholder="Select manager" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {user && <SelectItem value={user.id}>{user.name} (You)</SelectItem>}
                          {managers.filter((m) => m.id !== user?.id).map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter className="border-t pt-4 mt-2">
                    <button type="button" className="fv-btn fv-btn--secondary" onClick={() => setAddCardOpen(false)}>Cancel</button>
                    <button type="submit" disabled={savingCard} className="fv-btn fv-btn--primary">{savingCard ? 'Saving…' : 'Save Work Card'}</button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats: include both work logs and work cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Paid"
          value={operationsStats.paid}
          icon={CheckCircle}
          iconVariant="success"
        />
        <SimpleStatCard
          title="Unpaid"
          value={operationsStats.unpaid}
          icon={Clock}
          iconVariant="warning"
        />
        <SimpleStatCard
          title="Total logs & cards"
          value={operationsStats.total}
          icon={CalendarDays}
          iconVariant="info"
        />
        <SimpleStatCard
          title="Total labour"
          value={`KES ${operationsStats.totalLabour.toLocaleString()}`}
          icon={Banknote}
          iconVariant="primary"
        />
      </div>

      {/* Work Cards (in progress only: planned, submitted, rejected) */}
      {workCardsInProgress.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-heading font-semibold text-foreground text-lg">Work cards</h2>
          <p className="text-sm text-muted-foreground">
            Cards awaiting action. Compare <span className="font-medium text-foreground">Planned vs Actual</span> and
            {' '}<span className="font-medium text-foreground">Approve / Reject</span>. Approved and paid cards appear in the Work logs section below.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {workCardsInProgress.map((card) => (
              <div
                key={card.id}
                className={cn(
                  'fv-card p-4 cursor-pointer hover:shadow-md hover:-translate-y-[1px] transition-all relative overflow-hidden border border-border/70 bg-card',
                  card.status === 'submitted' && 'bg-amber-50/60',
                  card.status === 'rejected' && 'bg-destructive/5',
                  card.status === 'planned' && 'bg-card',
                )}
                onClick={() => {
                  setSelectedWorkCard(card);
                  setWorkCardModalOpen(true);
                  setWorkCardEditMode(false);
                  setRejectReason('');
                }}
              >
                {/* Status watermark */}
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 text-4xl md:text-5xl font-bold rotate-[-22deg] opacity-[0.09]',
                    (card.status === 'paid' || card.payment?.isPaid) && 'text-emerald-600',
                    card.status === 'approved' && 'text-emerald-600',
                    card.status === 'rejected' && 'text-destructive',
                    card.status === 'submitted' && 'text-amber-600',
                    card.status === 'planned' && 'text-muted-foreground',
                  )}
                  aria-hidden
                >
                  {(card.status === 'paid' || card.payment?.isPaid) ? 'PAID' : card.status.toUpperCase()}
                </span>
                <div className="relative z-10 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {getWorkTypeIcon(card.workTitle || card.workCategory)}
                        </span>
                        <p className="font-medium text-foreground truncate">
                          {card.workTitle || card.workCategory}
                        </p>
                        <span className={cn(
                          'fv-badge capitalize text-[11px]',
                          card.status === 'paid' && 'fv-badge--active',
                          card.status === 'approved' && 'bg-emerald-100 text-emerald-800',
                          card.status === 'submitted' && 'bg-amber-100 text-amber-800',
                          card.status === 'rejected' && 'bg-destructive/10 text-destructive',
                          card.status === 'planned' && 'bg-muted text-muted-foreground',
                        )}>
                          {card.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Stage: <span className="font-medium text-foreground">{card.stageName || card.stageId || '—'}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Workers planned:{' '}
                        <span className="font-medium text-foreground">
                          {card.planned?.workers ?? 0}
                        </span>
                        {card.allocatedManagerId && (
                          <>
                            {' '}• Manager:{' '}
                            <span className="font-medium text-foreground">
                              {getAssigneeName(card.allocatedManagerId)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Quick status summary strip */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 border border-border/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="capitalize font-medium">{card.status}</span>
                    </span>
                    {card.payment?.isPaid && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 border border-emerald-200">
                        Paid
                      </span>
                    )}
                    {!card.payment?.isPaid && (card.status === 'approved' || card.status === 'submitted') && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 border border-amber-200">
                        Pending payment
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search work logs..."
            className="fv-input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Work Logs & completed work cards (approved/paid) */}
      <div className="space-y-2">
        <h2 className="font-heading font-semibold text-foreground text-lg">Work logs & completed cards</h2>
        <p className="text-sm text-muted-foreground">
          Work logs and approved or paid work cards. Click to view details or mark as paid.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isLoading && (
          <div className="col-span-full fv-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}
        {combinedWorkEntries.map((entry) =>
          entry.type === 'workLog' ? (
            <div
              key={`log-${entry.log.id}`}
              className={cn(
                "fv-card relative flex items-start gap-4 p-4 cursor-pointer overflow-hidden hover:shadow-md transition-shadow",
                entry.log.paid && "after:content-['PAID'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-7xl after:font-bold after:text-red-500/15 after:rotate-[-35deg] after:pointer-events-none after:select-none after:z-0"
              )}
              onClick={() => handleViewLog(entry.log)}
            >
              <div className="shrink-0 mt-1 relative z-10">
                {getPaidIcon(entry.log.paid)}
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {getWorkTypeIcon(entry.log.workCategory)}
                      </span>
                      <h3 className="font-semibold text-foreground">{entry.log.workCategory}</h3>
                      <span className={cn('fv-badge capitalize text-xs', getPaidBadge(entry.log.paid))}>
                        {entry.log.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                    {entry.log.adminName && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Planned by admin: {entry.log.adminName}
                      </p>
                    )}
                    {entry.log.managerSubmittedAt && (
                      <p className="text-[11px] text-fv-info mt-0.5">
                        Manager {entry.log.managerName || getAssigneeName(entry.log.managerId)} submitted values
                        {entry.log.managerSubmissionStatus &&
                          ` • ${String(entry.log.managerSubmissionStatus).toUpperCase()}`}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">
                      {entry.log.numberOfPeople} people
                      {entry.log.ratePerPerson ? ` @ KES ${entry.log.ratePerPerson.toLocaleString()}` : ''}
                      {entry.log.totalPrice && (
                        <span className="ml-2 font-semibold text-foreground">
                          • Total: KES {entry.log.totalPrice.toLocaleString()}
                        </span>
                      )}
                    </p>
                    {entry.log.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {entry.log.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span>{formatDate(entry.log.date)}</span>
                  <span>•</span>
                  <span>Stage: {entry.log.stageName}</span>
                  {(entry.log.employeeId || (entry.log as any).employeeIds) && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-foreground">
                        Assigned: {(() => {
                          if ((entry.log as any).employeeIds && Array.isArray((entry.log as any).employeeIds)) {
                            const names = (entry.log as any).employeeIds
                              .map((id: string) => allEmployees.find(e => e.id === id)?.name)
                              .filter(Boolean);
                            return names.length > 0 ? names.join(', ') : 'Multiple employees';
                          }
                          return getAssignedEmployeeName(entry.log);
                        })()}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span>Manager: {getAssigneeName(entry.log.managerId)}</span>
                </div>
                {entry.log.managerSubmittedNumberOfPeople && (
                  <div className="mt-2 p-2 rounded-md bg-muted/40 border border-dashed border-muted-foreground/30 text-[11px] text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground text-xs">
                      Manager submission ({entry.log.managerSubmissionStatus?.toUpperCase() || 'PENDING'})
                    </p>
                    <p>
                      People: <span className="font-medium text-foreground">{entry.log.managerSubmittedNumberOfPeople}</span>
                      {entry.log.managerSubmittedRatePerPerson && (
                        <> @ KES <span className="font-medium text-foreground">{entry.log.managerSubmittedRatePerPerson.toLocaleString()}</span></>
                      )}
                    </p>
                    {entry.log.managerSubmittedTotalPrice && (
                      <p>Total: <span className="font-semibold text-foreground">KES {entry.log.managerSubmittedTotalPrice.toLocaleString()}</span></p>
                    )}
                    {entry.log.managerSubmittedInputsUsed && (
                      <p className="line-clamp-2">Inputs: <span className="font-medium text-foreground">{entry.log.managerSubmittedInputsUsed}</span></p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              key={`card-${entry.card.id}`}
              className={cn(
                "fv-card relative flex items-start gap-4 p-4 cursor-pointer overflow-hidden hover:shadow-md transition-shadow",
                (entry.card.payment?.isPaid || entry.card.status === 'paid') && "after:content-['PAID'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-7xl after:font-bold after:text-red-500/15 after:rotate-[-35deg] after:pointer-events-none after:select-none after:z-0"
              )}
              onClick={() => {
                setSelectedWorkCard(entry.card);
                setWorkCardModalOpen(true);
                setWorkCardEditMode(false);
                setRejectReason('');
              }}
            >
              <div className="shrink-0 mt-1 relative z-10">
                {(entry.card.payment?.isPaid || entry.card.status === 'paid')
                  ? <CheckCircle className="h-5 w-5 text-fv-success" />
                  : <Clock className="h-5 w-5 text-fv-warning" />}
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {getWorkTypeIcon(entry.card.workTitle || entry.card.workCategory)}
                      </span>
                      <h3 className="font-semibold text-foreground">{entry.card.workTitle || entry.card.workCategory}</h3>
                      <span className={cn(
                        'fv-badge capitalize text-xs',
                        (entry.card.payment?.isPaid || entry.card.status === 'paid') ? 'fv-badge--active' : 'bg-emerald-100 text-emerald-800'
                      )}>
                        {(entry.card.payment?.isPaid || entry.card.status === 'paid') ? 'Paid' : 'Approved'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {entry.card.actual?.actualWorkers ?? 0} people
                      {entry.card.actual?.ratePerPerson != null ? ` @ KES ${Number(entry.card.actual.ratePerPerson).toLocaleString()}` : ''}
                      {(entry.card.actual?.actualWorkers != null && entry.card.actual?.ratePerPerson != null) && (
                        <span className="ml-2 font-semibold text-foreground">
                          • Total: KES {(entry.card.actual.actualWorkers * entry.card.actual.ratePerPerson).toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span>
                    {formatDate(
                      (entry.card.actual?.actualDate as any)?.toDate?.() ?? (entry.card.approvedAt as any)?.toDate?.() ?? (entry.card as any).createdAt?.toDate?.() ?? new Date()
                    )}
                  </span>
                  <span>•</span>
                  <span>Stage: {entry.card.stageName || entry.card.stageId || '—'}</span>
                  <span>•</span>
                  <span>Manager: {entry.card.allocatedManagerId ? getAssigneeName(entry.card.allocatedManagerId) : (entry.card.actual?.managerName ?? '—')}</span>
                </div>
              </div>
            </div>
          )
        )}

        {combinedWorkEntries.length === 0 && !isLoading && (
          <div className="col-span-full fv-card text-center py-12">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No work logs or completed cards</h3>
            <p className="text-sm text-muted-foreground">
              Plan work with &quot;Plan Today&apos;s Work&quot;, or approved/paid work cards will appear here.
            </p>
          </div>
        )}
      </div>

      {/* Admin Work Card Modal: Planned vs Actual comparison + Edit + Approve/Reject */}
      <Dialog open={workCardModalOpen} onOpenChange={(open) => { setWorkCardModalOpen(open); if (!open) setWorkCardEditMode(false); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{workCardEditMode ? 'Edit Work Card (Planned)' : 'Work Card: Planned vs Actual'}</DialogTitle>
          </DialogHeader>
          {selectedWorkCard && (
            <div className="space-y-4">
              {workCardEditMode ? (
                <form onSubmit={handleUpdateWorkCard} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Work title</label>
                      <input type="text" className="fv-input w-full mt-1" value={cardWorkTitle} onChange={(e) => setCardWorkTitle(e.target.value)} placeholder={cardWorkCategory} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Work category</label>
                      <Select value={cardWorkCategory} onValueChange={handleWorkCategoryChange}>
                        <SelectTrigger className="w-full mt-1"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          {workTypesList.map((w) => (<SelectItem key={w} value={w}>{w}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Stage</label>
                      <Select value={cardStageId || '__none__'} onValueChange={(v) => { const s = projectStages.find((x) => x.id === v); setCardStageId(v === '__none__' ? '' : v); setCardStageName(s?.stageName ?? ''); }}>
                        <SelectTrigger className="w-full mt-1"><SelectValue placeholder="Stage" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {projectStages.map((s) => (<SelectItem key={s.id} value={s.id}>{s.stageName}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Planned workers</label>
                      <input type="number" min={0} className="fv-input w-full mt-1" value={cardPlannedWorkers} onChange={(e) => setCardPlannedWorkers(e.target.value)} />
                    </div>
                    {cardWorkCategory && (
                      <>
                        <div className="col-span-1">
                          <label className="text-sm font-medium text-foreground">Planned resource</label>
                          <Select value={cardPlannedItemId || '__none__'} onValueChange={(v) => { setCardPlannedItemId(v === '__none__' ? '' : v); setCardPlannedQuantity(''); setCardPlannedQuantitySecondary(''); }}>
                            <SelectTrigger className="w-full mt-1"><SelectValue placeholder="From inventory" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {plannedResourceItems.map((item) => (<SelectItem key={item.id} value={item.id}>{item.name} ({item.unit})</SelectItem>))}
                            </SelectContent>
                          </Select>
                          {!cardPlannedItemId && (selectedWorkCard.planned?.inputs || selectedWorkCard.planned?.fuel || selectedWorkCard.planned?.chemicals || selectedWorkCard.planned?.fertilizer) && (
                            <p className="text-xs text-muted-foreground mt-1">Current: {selectedWorkCard.planned?.inputs || selectedWorkCard.planned?.fuel || selectedWorkCard.planned?.chemicals || selectedWorkCard.planned?.fertilizer}</p>
                          )}
                        </div>
                        {selectedPlannedItem && (
                          <>
                            <div>
                              <label className="text-sm font-medium text-foreground">Qty</label>
                              <input type="text" inputMode="decimal" className="fv-input w-full mt-1" value={cardPlannedQuantity} onChange={(e) => setCardPlannedQuantity(e.target.value)} />
                            </div>
                            {(selectedPlannedItem.category === 'fertilizer' || selectedPlannedItem.category === 'fuel' || selectedPlannedItem.category === 'diesel') && (
                              <div>
                                <label className="text-sm font-medium text-foreground">Secondary (kg/L)</label>
                                <input type="text" inputMode="decimal" className="fv-input w-full mt-1" value={cardPlannedQuantitySecondary} onChange={(e) => setCardPlannedQuantitySecondary(e.target.value)} />
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                    <div>
                      <label className="text-sm font-medium text-foreground">Estimated cost (optional)</label>
                      <input type="number" min={0} className="fv-input w-full mt-1" value={cardEstimatedCost} onChange={(e) => setCardEstimatedCost(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Allocate manager</label>
                      <Select value={cardAllocatedManagerId || '__unassigned__'} onValueChange={(v) => setCardAllocatedManagerId(v === '__unassigned__' ? '' : v)}>
                        <SelectTrigger className="w-full mt-1"><SelectValue placeholder="Manager" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {user && <SelectItem value={user.id}>{user.name} (You)</SelectItem>}
                          {managers.filter((m) => m.id !== user?.id).map((m) => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    <button type="button" className="fv-btn fv-btn--secondary" onClick={() => setWorkCardEditMode(false)}>Cancel</button>
                    <button type="submit" disabled={savingCardUpdate} className="fv-btn fv-btn--primary">{savingCardUpdate ? 'Updating…' : 'Update planned'}</button>
                  </div>
                </form>
              ) : (
                <>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg text-foreground">
                  {selectedWorkCard.workTitle || selectedWorkCard.workCategory}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={startEditWorkCard}
                    className={cn(
                      'fv-btn fv-btn--secondary text-sm',
                      selectedWorkCard.status !== 'planned' && 'opacity-60 cursor-not-allowed'
                    )}
                    disabled={selectedWorkCard.status !== 'planned'}
                    title={selectedWorkCard.status !== 'planned' ? 'Edit is disabled after manager has submitted' : undefined}
                  >
                    Edit planned
                  </button>
                  <span className={cn('fv-badge capitalize', selectedWorkCard.status === 'submitted' && 'bg-amber-100 text-amber-800')}>
                    {selectedWorkCard.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border bg-muted/20">
                  <h4 className="font-semibold text-foreground mb-3">Planned (Admin)</h4>
                  <ul className="space-y-1 text-sm">
                    <li>Workers: {selectedWorkCard.planned?.workers ?? '—'}</li>
                    {selectedWorkCard.planned?.inputs != null && String(selectedWorkCard.planned.inputs).trim() !== '' && <li>Inputs: {selectedWorkCard.planned.inputs}</li>}
                    {selectedWorkCard.planned?.fuel != null && String(selectedWorkCard.planned.fuel).trim() !== '' && <li>Fuel: {selectedWorkCard.planned.fuel}</li>}
                    {selectedWorkCard.planned?.chemicals != null && String(selectedWorkCard.planned.chemicals).trim() !== '' && <li>Chemicals: {selectedWorkCard.planned.chemicals}</li>}
                    {selectedWorkCard.planned?.fertilizer != null && String(selectedWorkCard.planned.fertilizer).trim() !== '' && <li>Fertilizer: {selectedWorkCard.planned.fertilizer}</li>}
                    {selectedWorkCard.planned?.estimatedCost != null && (
                      <li>Est. cost: KES {Number(selectedWorkCard.planned.estimatedCost).toLocaleString()}</li>
                    )}
                  </ul>
                </div>
                <div className="p-4 rounded-lg border bg-muted/20">
                  <h4 className="font-semibold text-foreground mb-3">Actual (Manager)</h4>
                  {selectedWorkCard.actual?.submitted ? (
                    <ul className="space-y-1 text-sm">
                      <li className={getVarianceClass(selectedWorkCard.planned?.workers ?? 0, selectedWorkCard.actual?.actualWorkers)}>
                        Workers: {selectedWorkCard.actual?.actualWorkers ?? '—'}
                        {selectedWorkCard.actual?.actualWorkers != null && selectedWorkCard.planned?.workers != null && (
                          <span className="ml-1">
                            (Δ {selectedWorkCard.actual.actualWorkers - selectedWorkCard.planned.workers})
                          </span>
                        )}
                      </li>
                      {selectedWorkCard.actual?.ratePerPerson != null && (
                        <li>Price per person: KES {selectedWorkCard.actual.ratePerPerson.toLocaleString()}</li>
                      )}
                      {selectedWorkCard.actual?.actualWorkers != null && selectedWorkCard.actual?.ratePerPerson != null && selectedWorkCard.actual.actualWorkers > 0 && selectedWorkCard.actual.ratePerPerson > 0 && (
                        <li className="font-medium">Total labour: KES {(selectedWorkCard.actual.actualWorkers * selectedWorkCard.actual.ratePerPerson).toLocaleString()} (expense when marked paid)</li>
                      )}
                      {selectedWorkCard.actual?.actualInputsUsed != null && String(selectedWorkCard.actual.actualInputsUsed).trim() !== '' && <li>Inputs: {selectedWorkCard.actual.actualInputsUsed}</li>}
                      {selectedWorkCard.actual?.actualFuelUsed != null && String(selectedWorkCard.actual.actualFuelUsed).trim() !== '' && <li>Fuel: {selectedWorkCard.actual.actualFuelUsed}</li>}
                      {selectedWorkCard.actual?.actualChemicalsUsed != null && String(selectedWorkCard.actual.actualChemicalsUsed).trim() !== '' && <li>Chemicals: {selectedWorkCard.actual.actualChemicalsUsed}</li>}
                      {selectedWorkCard.actual?.actualFertilizerUsed != null && String(selectedWorkCard.actual.actualFertilizerUsed).trim() !== '' && <li>Fertilizer: {selectedWorkCard.actual.actualFertilizerUsed}</li>}
                      {selectedWorkCard.actual?.notes != null && String(selectedWorkCard.actual.notes).trim() !== '' && <li>Notes: {selectedWorkCard.actual.notes}</li>}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">Not yet submitted by manager.</p>
                  )}
                </div>
              </div>

              {selectedWorkCard.status === 'rejected' && selectedWorkCard.rejectionReason && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  Rejection reason: {selectedWorkCard.rejectionReason}
                </div>
              )}

              {canAdminApproveOrReject(selectedWorkCard) && (
                <div className="flex flex-wrap gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={handleApproveWorkCard}
                    disabled={approvingCard}
                    className="fv-btn fv-btn--primary"
                  >
                    {approvingCard ? 'Approving…' : 'Approve'}
                  </button>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      className="fv-input flex-1 min-w-[160px]"
                      placeholder="Rejection reason"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleRejectWorkCard}
                      disabled={rejectingCard || !rejectReason.trim()}
                      className="fv-btn fv-btn--secondary"
                    >
                      {rejectingCard ? 'Rejecting…' : 'Reject'}
                    </button>
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View/Edit Work Log Modal */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Work Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              {/* Summary + match status */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Work Category</p>
                  <p className="font-medium">{selectedLog.workCategory}</p>
                  {selectedLog.workType && (
                    <p className="text-xs text-muted-foreground">
                      Work Type: {selectedLog.workType}
                    </p>
                  )}
                </div>
                {selectedLog.managerSubmittedNumberOfPeople && (
                  <div className="text-right text-xs">
                    <p className="text-muted-foreground mb-1">Manager Submission</p>
                    {(() => {
                      const mismatches: string[] = [];
                      if (
                        selectedLog.managerSubmittedNumberOfPeople !==
                        selectedLog.numberOfPeople
                      ) {
                        mismatches.push('people');
                      }
                      if (
                        selectedLog.managerSubmittedRatePerPerson &&
                        selectedLog.ratePerPerson &&
                        selectedLog.managerSubmittedRatePerPerson !==
                          selectedLog.ratePerPerson
                      ) {
                        mismatches.push('rate');
                      }
                      if (
                        selectedLog.managerSubmittedTotalPrice &&
                        selectedLog.totalPrice &&
                        selectedLog.managerSubmittedTotalPrice !== selectedLog.totalPrice
                      ) {
                        mismatches.push('total');
                      }
                      const hasMismatch = mismatches.length > 0;
                      return (
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                            hasMismatch
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-emerald-100 text-emerald-800',
                          )}
                        >
                          {hasMismatch
                            ? `Mismatches: ${mismatches.join(', ')}`
                            : 'Manager values match yours'}
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Date</p>
                  <p className="font-medium">
                    {formatDate(selectedLog.date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Stage</p>
                  <p className="font-medium">{selectedLog.stageName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <span className={cn('fv-badge capitalize text-xs', getPaidBadge(selectedLog.paid))}>
                    {selectedLog.paid ? 'Paid' : 'Unpaid'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Number of People</p>
                  <p className="font-medium">{selectedLog.numberOfPeople}</p>
                  {selectedLog.managerSubmittedNumberOfPeople !== undefined && (
                    <p
                      className={cn(
                        'text-[11px] mt-0.5',
                        selectedLog.managerSubmittedNumberOfPeople ===
                          selectedLog.numberOfPeople
                          ? 'text-emerald-700'
                          : 'text-destructive',
                      )}
                    >
                      Manager: {selectedLog.managerSubmittedNumberOfPeople}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Rate per Person</p>
                  <p className="font-medium">
                    {selectedLog.ratePerPerson ? `KES ${selectedLog.ratePerPerson.toLocaleString()}` : 'N/A'}
                  </p>
                  {selectedLog.managerSubmittedRatePerPerson !== undefined && (
                    <p
                      className={cn(
                        'text-[11px] mt-0.5',
                        selectedLog.managerSubmittedRatePerPerson ===
                          selectedLog.ratePerPerson
                          ? 'text-emerald-700'
                          : 'text-destructive',
                      )}
                    >
                      Manager:{' '}
                      {`KES ${selectedLog.managerSubmittedRatePerPerson.toLocaleString()}`}
                    </p>
                  )}
                </div>
                {selectedLog.totalPrice && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Total Price</p>
                    <p className="font-semibold text-lg text-primary">
                      KES {selectedLog.totalPrice.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedLog.numberOfPeople} people × KES {selectedLog.ratePerPerson?.toLocaleString() || '0'} = KES {selectedLog.totalPrice.toLocaleString()}
                    </p>
                    {selectedLog.managerSubmittedTotalPrice && (
                      <p
                        className={cn(
                          'text-[11px] mt-1',
                          selectedLog.managerSubmittedTotalPrice ===
                            selectedLog.totalPrice
                            ? 'text-emerald-700'
                            : 'text-destructive',
                        )}
                      >
                        Manager total: KES{' '}
                        {selectedLog.managerSubmittedTotalPrice.toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
                {((selectedLog as any).employeeIds || selectedLog.employeeId) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Assigned Employee{((selectedLog as any).employeeIds?.length || 0) > 1 ? 's' : ''}
                    </p>
                    <p className="font-medium">
                      {(() => {
                        if ((selectedLog as any).employeeIds && Array.isArray((selectedLog as any).employeeIds)) {
                          const names = (selectedLog as any).employeeIds
                            .map((id: string) => allEmployees.find(e => e.id === id)?.name)
                            .filter(Boolean);
                          return names.length > 0 ? names.join(', ') : 'Multiple employees';
                        }
                        return getAssignedEmployeeName(selectedLog);
                      })()}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Manager</p>
                  <p className="font-medium">{getAssigneeName(selectedLog.managerId)}</p>
                </div>
              </div>
              {selectedLog.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm bg-muted/50 p-3 rounded-lg">{selectedLog.notes}</p>
                </div>
              )}
              {selectedLog.managerSubmittedNotes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Manager Notes</p>
                  <p className="text-sm bg-muted/30 p-3 rounded-lg whitespace-pre-wrap">
                    {selectedLog.managerSubmittedNotes}
                  </p>
                </div>
              )}
              {selectedLog.managerSubmittedInputsUsed && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Manager Inputs Used</p>
                  <p className="text-sm bg-muted/30 p-3 rounded-lg whitespace-pre-wrap">
                    {selectedLog.managerSubmittedInputsUsed}
                  </p>
                </div>
              )}
              {(selectedLog as any).changeReason && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reason for Change</p>
                  <p className="text-sm bg-warning/10 border border-warning/20 p-3 rounded-lg">{(selectedLog as any).changeReason}</p>
                </div>
              )}
              {!selectedLog.paid && (
                <div className="flex justify-between items-center gap-2 pt-4 border-t">
                  <div className="flex gap-2">
                    {selectedLog.managerSubmittedNumberOfPeople && (
                      <>
                        <button
                          onClick={() => handleApproveManagerSubmission(selectedLog)}
                          className="fv-btn fv-btn--primary"
                        >
                          Approve Manager Submission
                        </button>
                        <button
                          onClick={() => handleRejectManagerSubmission(selectedLog)}
                          className="fv-btn fv-btn--secondary"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                      setEditLog(selectedLog);
                      setPreviousWorkData({
                        workCategory: selectedLog.workCategory,
                        numberOfPeople: selectedLog.numberOfPeople,
                        ratePerPerson: selectedLog.ratePerPerson,
                        totalPrice: selectedLog.totalPrice,
                        notes: selectedLog.notes,
                        stageName: selectedLog.stageName,
                        date: selectedLog.date,
                      });
                      // Populate form with current values
                      const wt = selectedLog.workType || selectedLog.workCategory || '';
                      setWorkType(wt);
                      setWorkCategory(wt);
                      setNumberOfPeople(String(selectedLog.numberOfPeople));
                      setRatePerPerson(selectedLog.ratePerPerson ? String(selectedLog.ratePerPerson) : '');
                      setNotes(selectedLog.notes || '');
                      setChangeReason('');
                      const logDate = toDate(selectedLog.date);
                      if (logDate) {
                        setDate(logDate);
                        setDateInput(logDate.toISOString().split('T')[0]);
                      }
                      const stage = projectStages.find(s => s.stageIndex === selectedLog.stageIndex);
                      if (stage) {
                        setSelectedStageIndex(stage.stageIndex);
                      }
                      if (selectedLog.managerId) {
                        setSelectedManagerId(selectedLog.managerId);
                      }
                      if ((selectedLog as any).employeeIds) {
                        setSelectedEmployeeIds((selectedLog as any).employeeIds);
                      } else if (selectedLog.employeeId) {
                        setSelectedEmployeeIds([selectedLog.employeeId]);
                      }
                      setViewOpen(false);
                      setEditOpen(true);
                    }}
                      className="fv-btn fv-btn--secondary"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleMarkAsPaid(selectedLog)}
                      disabled={markingPaid}
                      className="fv-btn fv-btn--primary"
                    >
                      {markingPaid ? 'Marking...' : 'Mark as Paid'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Work Log Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Work Log</DialogTitle>
          </DialogHeader>
          {!activeProject || !editLog ? (
            <p className="text-sm text-muted-foreground">
              No work log selected for editing.
            </p>
          ) : (
            <>
              {/* Previous Work Data */}
              {previousWorkData && (
                <div className="mb-4 p-3 bg-muted/30 border border-muted rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Previous Work (Before Change):</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Category:</span> {previousWorkData.workCategory}
                    </div>
                    <div>
                      <span className="text-muted-foreground">People:</span> {previousWorkData.numberOfPeople}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Rate:</span> {previousWorkData.ratePerPerson ? `KES ${previousWorkData.ratePerPerson.toLocaleString()}` : 'N/A'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total:</span> {previousWorkData.totalPrice ? `KES ${previousWorkData.totalPrice.toLocaleString()}` : 'N/A'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Stage:</span> {previousWorkData.stageName}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date:</span> {formatDate(previousWorkData.date)}
                    </div>
                    {previousWorkData.notes && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Notes:</span> {previousWorkData.notes}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Edit Form */}
              <form onSubmit={handleEditWorkLog} className="space-y-4">
                <div className="text-sm text-warning bg-warning/10 p-3 rounded-lg border border-warning/20">
                  <p className="font-semibold">Note: Editing work logs requires a reason for the change.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Stage</label>
                    <Select
                      value={
                        selectedStageIndex !== null 
                          ? String(selectedStageIndex) 
                          : (currentStage ? String(currentStage.stageIndex) : projectStages[0] ? String(projectStages[0].stageIndex) : '')
                      }
                      onValueChange={(val) => {
                        if (val) {
                          const index = Number(val);
                          setSelectedStageIndex(index);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectStages.map((stage) => (
                          <SelectItem key={stage.id} value={String(stage.stageIndex)}>
                            {stage.stageName} {stage.stageIndex === currentStage?.stageIndex && '(Current)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Manager</label>
                    <Select
                      value={selectedManagerId || (user?.id || '')}
                      onValueChange={(val) => {
                        setSelectedManagerId(val === user?.id ? '' : val);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select manager" />
                      </SelectTrigger>
                      <SelectContent>
                        {user && (
                          <SelectItem value={user.id}>
                            {user.name} (You) {user.role === 'company-admin' || user.role === 'manager' ? `- ${user.role.replace('-', ' ')}` : ''}
                          </SelectItem>
                        )}
                        {managers
                          .filter(m => m.id !== user?.id)
                          .map((manager) => (
                            <SelectItem key={manager.id} value={manager.id}>
                              {manager.name} - {manager.role.replace('-', ' ')}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Date</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        className="fv-input flex-1"
                        value={dateInput}
                        onChange={(e) => handleDateChange(e.target.value)}
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="fv-btn fv-btn--secondary px-3"
                          >
                            <CalendarDays className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={(selectedDate) => {
                              if (selectedDate) {
                                handleDateChange(selectedDate);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Work type</label>
                    <Select
                      value={workType}
                      onValueChange={(val) => {
                        setWorkType(val);
                        setWorkCategory(val);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select work type" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set([...workTypesList, workType].filter(Boolean))].map((wt) => (
                          <SelectItem key={wt} value={wt}>
                            {wt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Number of people</label>
                    <input
                      type="number"
                      min={0}
                      className="fv-input"
                      value={numberOfPeople}
                      onChange={(e) => setNumberOfPeople(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Rate per person (optional)</label>
                    <input
                      type="number"
                      min={0}
                      className="fv-input"
                      value={ratePerPerson}
                      onChange={(e) => setRatePerPerson(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Total Amount</label>
                    <div className="fv-input bg-primary/10 border-primary/20 font-semibold text-lg text-primary flex items-center justify-center">
                      {totalPrice > 0 ? `KES ${totalPrice.toLocaleString()}` : 'KES 0'}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Notes</label>
                  <textarea
                    className="fv-input resize-none"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    Reason for Change <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    className="fv-input resize-none"
                    rows={3}
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="Required: Explain why the work is being changed..."
                    required
                  />
                </div>

                <DialogFooter>
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary"
                    onClick={() => {
                      setEditOpen(false);
                      setEditLog(null);
                      setPreviousWorkData(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !changeReason.trim()}
                    className="fv-btn fv-btn--primary"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
