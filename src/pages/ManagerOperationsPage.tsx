import React, { useState, useMemo } from 'react';
import { Search, CheckCircle, Clock, CalendarDays, Eye, Filter, Download, Banknote, List, Grid, Plus } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn, parseQuantityOrFraction } from '@/lib/utils';
import { useCollection } from '@/hooks/useCollection';
import { WorkLog, Employee, CropStage, InventoryItem, InventoryCategory, Expense, ExpenseCategory, OperationsWorkCard } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkCardsForCompany, useWorkCardsForManager, useInvalidateWorkCards } from '@/hooks/useWorkCards';
import {
  submitExecution,
  markWorkCardPaid,
  canManagerSubmit,
  canMarkAsPaid,
} from '@/services/operationsWorkCardService';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { getCurrentStageForProject } from '@/services/stageService';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toDate } from '@/lib/dateUtils';
import { exportToExcel } from '@/lib/exportUtils';
import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp, updateDoc, doc, writeBatch, increment } from 'firebase/firestore';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { recordInventoryUsage } from '@/services/inventoryService';
import { getCompany, updateCompany } from '@/services/companyService';

const BASE_WORK_TYPES = [
  'Spraying',
  'Fertilizer application',
  'Watering',
  'Weeding',
  'Tying of crops',
] as const;

export default function ManagerOperationsPage() {
  const { activeProject, setActiveProject, projects } = useProject();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Fetch data from Firestore
  const { data: allWorkLogs = [], isLoading } = useCollection<WorkLog>('workLogs', 'workLogs', { refetchInterval: 3000 });
  const { data: allEmployees = [] } = useCollection<Employee>('employees', 'employees');
  const { data: allStages = [] } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allInventoryItems = [] } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');
  const { data: company } = useQuery({
    queryKey: ['company', user?.companyId],
    queryFn: () => getCompany(user!.companyId!),
    enabled: !!user?.companyId,
  });
  const workTypesList = useMemo(() => {
    const custom = (company as { customWorkTypes?: string[] } | undefined)?.customWorkTypes ?? [];
    return [...BASE_WORK_TYPES, ...custom];
  }, [company]);
  
  // State for filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<WorkLog | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<'total' | 'paid' | 'unpaid' | 'amount' | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Check if filters are active
  const hasActiveFilters = useMemo(() => {
    return search || statusFilter !== 'all' || stageFilter !== 'all' || dateRangeFilter !== 'all';
  }, [search, statusFilter, stageFilter, dateRangeFilter]);

  // Current user can be a manager by platform role (user.role === 'manager') or by employee role (operations-manager).
  // When work is allocated from Operations, managerId can be either user.id (auth uid) or employee doc id.
  const managerIdsForCurrentUser = useMemo(() => {
    if (!user) return new Set<string>();
    const ids = new Set<string>();
    ids.add(user.id);
    const myEmployee = allEmployees.find((e) => (e as Employee & { authUserId?: string }).authUserId === user.id);
    if (myEmployee) ids.add(myEmployee.id);
    return ids;
  }, [user, allEmployees]);

  const managerIdsArray = useMemo(() => Array.from(managerIdsForCurrentUser), [managerIdsForCurrentUser]);
  const { data: managerWorkCards = [], isLoading: managerCardsLoading } = useWorkCardsForManager(managerIdsArray);
  const { data: companyWorkCards = [], isLoading: companyCardsLoading } = useWorkCardsForCompany(user?.companyId ?? null, { refetchInterval: 5000 });
  const workCards = useMemo(() => {
    const fromManager = managerIdsArray.length > 0 ? managerWorkCards : [];
    const fromCompany =
      companyWorkCards.filter(
        (card) => card.allocatedManagerId != null && managerIdsForCurrentUser.has(card.allocatedManagerId),
      );
    const byId = new Map<string, OperationsWorkCard>();
    fromManager.forEach((c) => byId.set(c.id, c));
    fromCompany.forEach((c) => byId.set(c.id, c));
    return Array.from(byId.values());
  }, [managerWorkCards, companyWorkCards, managerIdsForCurrentUser, managerIdsArray.length]);

  // Separate work cards into in‑progress vs completed (approved/paid)
  const workCardsInProgress = useMemo(
    () => workCards.filter((c) => c.status === 'planned' || c.status === 'submitted' || c.status === 'rejected'),
    [workCards],
  );
  const workCardsCompleted = useMemo(
    () => workCards.filter((c) => c.status === 'approved' || c.status === 'paid' || c.payment?.isPaid),
    [workCards],
  );
  const invalidateWorkCards = useInvalidateWorkCards();

  const isManagerOrAdmin = useMemo(() => {
    if (!user) return false;
    if (user.role === 'company-admin') return true;
    if (user.role === 'manager') return true;
    if ((user as { employeeRole?: string }).employeeRole === 'operations-manager') return true;
    return false;
  }, [user]);

  const showPeopleSection = user?.role === 'company-admin';

  // Get work logs for the current manager's projects
  const managerWorkLogs = useMemo(() => {
    if (!user) return [];

    // Company admins: show all logs for their company
    if (user.role === 'company-admin') {
      return allWorkLogs.filter((log) => log.companyId === user.companyId);
    }

    // Managers (platform or employee role): show logs where they are the assigned manager (by user id or employee id)
    if (isManagerOrAdmin) {
      return allWorkLogs.filter(
        (log) =>
          log.companyId === user.companyId &&
          log.managerId != null &&
          managerIdsForCurrentUser.has(log.managerId),
      );
    }

    return [];
  }, [allWorkLogs, user, isManagerOrAdmin, managerIdsForCurrentUser]);

  // Admin-planned work assigned to this manager that still needs a manager submission.
  // If the manager has already created their own daily work log for the same stage/date,
  // we hide the assigned card – they're just waiting for approval/mark-as-paid.
  const assignedPlans = useMemo(() => {
    if (!user) return [];

    return allWorkLogs.filter((plan) => {
      if (
        plan.companyId !== user.companyId ||
        plan.managerId == null ||
        !managerIdsForCurrentUser.has(plan.managerId) ||
        plan.managerSubmittedAt
      ) {
        return false;
      }

      // Treat only admin-created items as "plans"
      if (!plan.adminName) return false;

      const planDate = toDate(plan.date);

      // If there's already a manager work log for this plan (same project, stage, date & manager),
      // then we shouldn't show this assigned card anymore.
      const hasManagerLogged = managerWorkLogs.some((log) => {
        const logDate = toDate(log.date);
        const sameDay =
          logDate && planDate && logDate.toDateString() === planDate.toDateString();

        return (
          sameDay &&
          log.projectId === plan.projectId &&
          log.stageIndex === plan.stageIndex &&
          log.managerId != null &&
          managerIdsForCurrentUser.has(log.managerId)
        );
      });

      return !hasManagerLogged;
    });
  }, [allWorkLogs, managerWorkLogs, user, managerIdsForCurrentUser]);

  // Work category options (from existing logs)
  const workCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    allWorkLogs.forEach((log) => {
      if (log.workCategory) set.add(log.workCategory);
    });
    return Array.from(set).sort();
  }, [allWorkLogs]);

  // Apply filters
  const filteredWorkLogs = useMemo(() => {
    let logs = managerWorkLogs;
    
    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter((log) =>
        log.workCategory.toLowerCase().includes(searchLower) ||
        (log.notes ?? '').toLowerCase().includes(searchLower) ||
        (log.employeeName ?? '').toLowerCase().includes(searchLower) ||
        (log.managerName ?? '').toLowerCase().includes(searchLower)
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      logs = logs.filter((log) => 
        statusFilter === 'paid' ? log.paid : !log.paid
      );
    }
    
    // Apply stage filter
    if (stageFilter !== 'all') {
      logs = logs.filter((log) => log.stageName === stageFilter);
    }
    
    // Apply date range filter
    if (dateRangeFilter !== 'all') {
      const today = new Date();
      const logDate = (date: any) => toDate(date);
      
      switch (dateRangeFilter) {
        case 'today':
          logs = logs.filter((log) => {
            const date = logDate(log.date);
            return date && date.toDateString() === today.toDateString();
          });
          break;
        case 'thisWeek':
          const weekAgo = new Date();
          weekAgo.setDate(today.getDate() - 7);
          logs = logs.filter((log) => {
            const date = logDate(log.date);
            return date && date >= weekAgo;
          });
          break;
        case 'thisMonth':
          const monthAgo = new Date();
          monthAgo.setMonth(today.getMonth() - 1);
          logs = logs.filter((log) => {
            const date = logDate(log.date);
            return date && date >= monthAgo;
          });
          break;
      }
    }
    
    return logs.sort((a, b) => {
      const dateA = toDate(a.date);
      const dateB = toDate(b.date);
      return dateB.getTime() - dateA.getTime(); // Newest first
    });
  }, [managerWorkLogs, search, statusFilter, stageFilter, dateRangeFilter]);

  // Combined list for Work Logs cards view: filtered work logs + completed work cards, sorted by date (newest first).
  const combinedManagerEntries = useMemo(() => {
    const toTime = (d: unknown) => {
      if (!d) return 0;
      const date = (d as { toDate?: () => Date })?.toDate?.() ?? new Date(d as Date);
      return date.getTime();
    };

    const logEntries = filteredWorkLogs.map((log) => ({
      type: 'workLog' as const,
      log,
      sortTime: toTime(log.date),
    }));

    const cardEntries = workCardsCompleted.map((card) => {
      const t = toTime(card.actual?.actualDate ?? card.approvedAt ?? card.createdAt);
      return { type: 'workCard' as const, card, sortTime: t };
    });

    return [...logEntries, ...cardEntries].sort((a, b) => b.sortTime - a.sortTime);
  }, [filteredWorkLogs, workCardsCompleted]);

  // Get unique stages for filter dropdown
  const uniqueStages = useMemo(() => {
    const stages = new Set<string>();
    managerWorkLogs.forEach((log) => {
      if (log.stageName) stages.add(log.stageName);
    });
    return Array.from(stages).sort();
  }, [managerWorkLogs]);

  // Get stats: include both work logs and work cards so numbers reflect real work
  const stats = useMemo(() => {
    const logTotal = managerWorkLogs.length;
    const logPaid = managerWorkLogs.filter((log) => log.paid).length;
    const cardTotal = workCards.length;
    const cardPaid = workCards.filter((c) => c.payment?.isPaid || c.status === 'paid').length;
    const totalLogs = logTotal + cardTotal;
    const paidLogs = logPaid + cardPaid;
    const unpaidLogs = totalLogs - paidLogs;
    const totalLabour = workCards.reduce((sum, card) => {
      const w = card.actual?.actualWorkers ?? 0;
      const r = card.actual?.ratePerPerson ?? 0;
      return sum + w * r;
    }, 0);
    const unpaidAmount = managerWorkLogs
      .filter((log) => !log.paid)
      .reduce((sum, log) => sum + (log.totalPrice || 0), 0);
    
    return {
      totalLogs,
      paidLogs,
      unpaidLogs,
      totalLabour,
      unpaidAmount,
    };
  }, [managerWorkLogs, workCards]);

  // Helper functions
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

  const getAssigneeName = (employeeId?: string) => {
    if (!employeeId) return 'Unassigned';
    const employee = allEmployees.find(e => e.id === employeeId);
    return employee?.name || 'Unknown';
  };

  const getAssignedEmployeeName = (log: WorkLog) => {
    if (log.employeeName) return log.employeeName;
    if (log.employeeId) return getAssigneeName(log.employeeId);
    if ((log as any).employeeIds) {
      const names = (log as any).employeeIds
        .map((id: string) => allEmployees.find(e => e.id === id)?.name)
        .filter(Boolean);
      return names.length > 0 ? names.join(', ') : 'Multiple employees';
    }
    return 'Unassigned';
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString()}`;
  };

  const formatLogDate = (date: any) => {
    const d = toDate(date);
    return d ? format(d, 'PPp') : 'Invalid date';
  };

  // State for creating manager work log from an admin plan
  const [fillOpen, setFillOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<WorkLog | null>(null);
  const [formWorkType, setFormWorkType] = useState('');
  const [formPeople, setFormPeople] = useState('');
  const [formRate, setFormRate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formInputs, setFormInputs] = useState<
    { id: string; category: InventoryCategory; itemId: string; quantity: string; litres?: string; kgs?: string }[]
  >([]);
  const [submittingPlanLog, setSubmittingPlanLog] = useState(false);

  // State for "Log Daily Work" (manager creating their own work log)
  const [logDailyWorkOpen, setLogDailyWorkOpen] = useState(false);
  const [logDate, setLogDate] = useState<Date | undefined>(() => new Date());
  const [logWorkType, setLogWorkType] = useState('');
  const [logNumberOfPeople, setLogNumberOfPeople] = useState('');
  const [logRatePerPerson, setLogRatePerPerson] = useState('');
  const [logDrumsSprayed, setLogDrumsSprayed] = useState(''); // For spraying
  const [logWateringContainers, setLogWateringContainers] = useState(''); // For watering
  const [logTyingUsedType, setLogTyingUsedType] = useState<'ropes' | 'sacks'>('ropes'); // For tying of crops
  const [logNotes, setLogNotes] = useState('');
  const [customWorkTypeName, setCustomWorkTypeName] = useState('');
  const [addCustomWorkTypeOpen, setAddCustomWorkTypeOpen] = useState(false);
  const [savingCustomWorkType, setSavingCustomWorkType] = useState(false);
  type LogInputUsage = {
    id: string;
    category: InventoryCategory;
    itemId: string;
    quantity: string;
    litres?: string;
    kgs?: string;
  };
  const [logInputs, setLogInputs] = useState<LogInputUsage[]>([]);
  const [savingDailyWork, setSavingDailyWork] = useState(false);

  // Get current stage for the project
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


  // Get company inventory items
  const companyInventory = useMemo(
    () =>
      activeProject
        ? allInventoryItems.filter((i) => i.companyId === activeProject.companyId)
        : allInventoryItems,
    [allInventoryItems, activeProject],
  );

  // Categories that actually exist in company inventory (for dropdowns when recording work)
  const inventoryCategoriesFromStock = useMemo(() => {
    const cats = new Set<InventoryCategory>();
    companyInventory.forEach((i) => cats.add(i.category));
    return Array.from(cats).sort();
  }, [companyInventory]);

  // Categories from inventory for the selected plan's company (Log in Work dialog)
  const inventoryCategoriesForPlan = useMemo(() => {
    if (!selectedPlan?.companyId) return [];
    const items = allInventoryItems.filter((i) => i.companyId === selectedPlan.companyId);
    const cats = new Set<InventoryCategory>();
    items.forEach((i) => cats.add(i.category));
    return Array.from(cats).sort();
  }, [allInventoryItems, selectedPlan?.companyId]);

  const getInventoryCategoryLabel = (cat: string) =>
    ({ fertilizer: 'Fertilizer', chemical: 'Chemical', fuel: 'Fuel', diesel: 'Diesel', materials: 'Materials', sacks: 'Sacks', ropes: 'Ropes', 'wooden-crates': 'Wooden crates' }[cat] || cat);

  // When changing work type, optionally seed inputs and clear when not needed
  const handleChangeLogWorkType = (value: string) => {
    setLogWorkType(value);

    // For spraying, fertilizer application, or tying of crops, ensure at least one input row exists
    if ((value === 'Spraying' || value === 'Fertilizer application' || value === 'Tying of crops') && logInputs.length === 0) {
      let preferred: InventoryCategory = 'fertilizer';
      if (value === 'Spraying') preferred = 'chemical';
      else if (value === 'Fertilizer application') preferred = 'fertilizer';
      else if (value === 'Tying of crops') preferred = inventoryCategoriesFromStock.includes('ropes') ? 'ropes' : inventoryCategoriesFromStock.includes('sacks') ? 'sacks' : 'ropes';
      const defaultCategory = inventoryCategoriesFromStock.includes(preferred)
        ? preferred
        : (inventoryCategoriesFromStock[0] ?? preferred);
      setLogInputs([
        {
          id: Date.now().toString(),
          category: defaultCategory,
          itemId: '',
          quantity: '',
          litres: '',
          kgs: '',
        },
      ]);
    }
    if (value === 'Tying of crops') {
      setLogTyingUsedType(inventoryCategoriesFromStock.includes('ropes') ? 'ropes' : 'sacks');
    }

    // For work types that don't use inputs, clear them
    if (value === 'Watering' || value === 'Weeding') {
      setLogInputs([]);
    }

    // Reset drums when not spraying
    if (value !== 'Spraying') {
      setLogDrumsSprayed('');
    }
    if (value !== 'Watering') {
      setLogWateringContainers('');
    }
  };

  const openFillDialog = (plan: WorkLog) => {
    setSelectedPlan(plan);

    // Try to find a manager-created work log that matches this plan
    // Match by company, manager, stage and calendar day
    let prefillWorkType = '';
    let prefillPeople = '';
    let prefillRate = '';
    let prefillNotes = '';

    if (user) {
      const planDate = toDate(plan.date);
      const matchingManagerLog = managerWorkLogs.find((log) => {
        const logDate = toDate(log.date);
        const sameDay =
          logDate && planDate && logDate.toDateString() === planDate.toDateString();

        return (
          sameDay &&
          log.companyId === plan.companyId &&
          log.projectId === plan.projectId &&
          log.managerId === user.id &&
          log.stageIndex === plan.stageIndex
        );
      });

      if (matchingManagerLog) {
        prefillWorkType = matchingManagerLog.workType || matchingManagerLog.workCategory || '';
        prefillPeople =
          typeof matchingManagerLog.numberOfPeople === 'number'
            ? String(matchingManagerLog.numberOfPeople)
            : '';
        prefillRate =
          typeof matchingManagerLog.ratePerPerson === 'number'
            ? String(matchingManagerLog.ratePerPerson)
            : '';
        prefillNotes = matchingManagerLog.notes || '';
      }
    }

    setFormWorkType(prefillWorkType);
    setFormPeople(prefillPeople);
    setFormRate(prefillRate);
    setFormNotes(prefillNotes);
    setFormInputs([]);
    setFillOpen(true);
  };

  const handleSubmitPlanLog = async () => {
    if (!user || !selectedPlan) return;

    const numberOfPeople = Number(formPeople || '0');
    const ratePerPerson = formRate ? Number(formRate) : undefined;
    const totalPrice =
      ratePerPerson && numberOfPeople ? numberOfPeople * ratePerPerson : undefined;

    const inputSummary =
      formInputs.length === 0
        ? ''
        : formInputs
            .map((usage) => {
              const item = allInventoryItems.find((i) => i.id === usage.itemId);
              const name = item?.name || 'Unknown item';
              if (usage.category === 'fuel' || usage.category === 'diesel') {
                const parts = [usage.quantity ? `${usage.quantity} containers` : ''];
                if (usage.litres?.trim()) parts.push(`${usage.litres} L`);
                return `${usage.category}: ${name} - ${parts.filter(Boolean).join(', ') || usage.quantity}`;
              }
              if (usage.category === 'fertilizer') {
                const parts = [usage.quantity ? `${usage.quantity} bags` : ''];
                if (usage.kgs?.trim()) parts.push(`${usage.kgs} kg`);
                return `fertilizer: ${name} - ${parts.filter(Boolean).join(', ') || usage.quantity}`;
              }
              const chemUnit = item?.packagingType === 'box' ? 'boxes' : 'units';
              return `${usage.category}: ${name} - ${usage.quantity} ${chemUnit}`;
            })
            .join('; ');

    const update: Partial<WorkLog> = {
      projectId: selectedPlan.projectId,
      companyId: selectedPlan.companyId,
      cropType: selectedPlan.cropType,
      stageIndex: selectedPlan.stageIndex,
      stageName: selectedPlan.stageName,
      date: selectedPlan.date,
      workType: formWorkType || undefined,
      managerSubmittedNumberOfPeople: numberOfPeople,
      managerSubmittedRatePerPerson: ratePerPerson,
      managerSubmittedTotalPrice: totalPrice,
      managerSubmittedNotes: formNotes || '',
      managerSubmittedInputsUsed: inputSummary || '',
      managerSubmittedWorkType: formWorkType || undefined,
      managerSubmissionStatus: 'pending',
    };

    // Prepare managerSubmittedAt safely
    const submittedAt = serverTimestamp();

    setSubmittingPlanLog(true);
    try {
      await updateDoc(doc(db, 'workLogs', selectedPlan.id), {
        ...update,
        managerSubmittedAt: submittedAt,
      });

      setFillOpen(false);
      setSelectedPlan(null);
    } finally {
      setSubmittingPlanLog(false);
    }
  };

  // Handle submitting daily work log (manager creating their own work log)
  const handleSubmitDailyWork = async () => {
    if (!user || !activeProject || !logDate) return;
    if (!logWorkType || !logNumberOfPeople) {
      alert('Please fill in work type and number of people');
      return;
    }

    // Use current stage or default stage
    const stageToUse = currentStage || projectStages[0];
    if (!stageToUse) {
      alert('No crop stage available for this project');
      return;
    }

    // For spraying and fertilizer application, ensure at least one inventory item is selected
    if (logWorkType === 'Spraying') {
      const hasChemical = logInputs.some(
        (u) => u.category === 'chemical' && u.itemId,
      );
      if (!hasChemical) {
        alert('For spraying, please select at least one chemical from inventory.');
        return;
      }
    }

    if (logWorkType === 'Fertilizer application') {
      const hasFertilizer = logInputs.some(
        (u) => u.category === 'fertilizer' && u.itemId,
      );
      if (!hasFertilizer) {
        alert('For fertilizer application, please select at least one fertilizer from inventory.');
        return;
      }
    }

    setSavingDailyWork(true);
    try {
      const numPeople = Number(logNumberOfPeople || '0');
      const rate = logRatePerPerson ? Number(logRatePerPerson) : undefined;
      const calculatedTotal = numPeople * (rate || 0);

      const inputSummary =
        logInputs.length === 0
          ? ''
          : logInputs
              .map((usage) => {
                const item = companyInventory.find((i) => i.id === usage.itemId);
                const name = item?.name || 'Unknown item';
                if (usage.category === 'fuel' || usage.category === 'diesel') {
                  const parts = [usage.quantity ? `${usage.quantity} containers` : ''];
                  if (usage.litres?.trim()) parts.push(`${usage.litres} L`);
                  return `${usage.category}: ${name} - ${parts.filter(Boolean).join(', ') || usage.quantity}`;
                }
                if (usage.category === 'fertilizer') {
                  const parts = [usage.quantity ? `${usage.quantity} bags` : ''];
                  if (usage.kgs?.trim()) parts.push(`${usage.kgs} kg`);
                  return `fertilizer: ${name} - ${parts.filter(Boolean).join(', ') || usage.quantity}`;
                }
                const chemUnit = item?.packagingType === 'box' ? 'boxes' : 'units';
                return `${usage.category}: ${name} - ${usage.quantity} ${chemUnit}`;
              })
              .join('; ');

      const workLogData: any = {
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        cropType: activeProject.cropType,
        stageIndex: stageToUse.stageIndex,
        stageName: stageToUse.stageName,
        date: logDate,
        workCategory: logWorkType, // Use work type as category
        workType: logWorkType,
        numberOfPeople: numPeople,
        ratePerPerson: rate,
        totalPrice: calculatedTotal > 0 ? calculatedTotal : undefined,
        drumsSprayed: logDrumsSprayed || undefined,
        notes: logNotes || undefined,
        inputsUsed: inputSummary || undefined,
        managerId: user.id, // Auto-set to current manager
        managerName: user.name,
        paid: false,
        createdAt: serverTimestamp(),
      };

      // Remove undefined values to avoid Firestore errors
      Object.keys(workLogData).forEach(key => {
        if (workLogData[key] === undefined) {
          delete workLogData[key];
        }
      });

      // Use batch to create work log and deduct inventory atomically
      const batch = writeBatch(db);
      const workLogRef = doc(collection(db, 'workLogs'));
      batch.set(workLogRef, workLogData);

      // Deduct inventory items and record usage
      const usageDate = logDate instanceof Date ? logDate : new Date(logDate);
      
      for (const usage of logInputs) {
        if (!usage.itemId || !usage.quantity) continue;
        
        const item = companyInventory.find((i) => i.id === usage.itemId);
        if (!item) continue;

        const quantityValue = parseQuantityOrFraction(usage.quantity.toString());
        if (quantityValue > 0) {
          // Deduct from inventory
          const itemRef = doc(db, 'inventoryItems', usage.itemId);
          batch.update(itemRef, {
            quantity: increment(-quantityValue),
            lastUpdated: serverTimestamp(),
          });

          // Record inventory usage (will be committed after batch)
          // We'll do this after the batch commits to ensure workLogId is available
        }
      }

      // Commit batch (creates work log and deducts inventory)
      await batch.commit();
      const workLogId = workLogRef.id;

      // Record inventory usage after batch commit (so we have workLogId)
      await Promise.all(
        logInputs
          .filter((usage) => usage.itemId && usage.quantity)
          .map(async (usage) => {
            const item = companyInventory.find((i) => i.id === usage.itemId);
            if (!item) return;

            const quantityValue = parseQuantityOrFraction(usage.quantity.toString());
            if (quantityValue > 0) {
              await recordInventoryUsage({
                companyId: activeProject.companyId,
                projectId: activeProject.id,
                inventoryItemId: usage.itemId,
                category: usage.category,
                quantity: quantityValue,
                unit: item.unit,
                source: 'workLog',
                workLogId,
                stageIndex: stageToUse.stageIndex,
                stageName: stageToUse.stageName,
                date: usageDate,
              });
            }
          }),
      );

      // Reset form
      setLogDailyWorkOpen(false);
      setLogDate(new Date());
      setLogWorkType('');
      setLogNumberOfPeople('');
      setLogRatePerPerson('');
      setLogDrumsSprayed('');
      setLogWateringContainers('');
      setLogTyingUsedType('ropes');
      setLogNotes('');
      setLogInputs([]);

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryUsage'] });
    } catch (error) {
      console.error('Failed to log daily work:', error);
      alert('Failed to log daily work. Please try again.');
    } finally {
      setSavingDailyWork(false);
    }
  };

  // Handle export to Excel
  const handleExport = () => {
    const exportData = filteredWorkLogs.map((log) => ({
      Date: formatLogDate(log.date),
      'Work Category': log.workCategory,
      'Stage Name': log.stageName,
      'Number of People': log.numberOfPeople,
      'Rate per Person': log.ratePerPerson ? formatCurrency(log.ratePerPerson) : 'N/A',
      'Total Amount': log.totalPrice ? formatCurrency(log.totalPrice) : 'N/A',
      'Assigned Employees': getAssignedEmployeeName(log),
      'Manager': log.managerName || getAssigneeName(log.managerId),
      'Status': log.paid ? 'Paid' : 'Unpaid',
      'Notes': log.notes || '',
      'Paid By': (log as any).paidByName || '',
      'Paid At': (log as any).paidAt ? formatLogDate((log as any).paidAt) : '',
    }));
    
    exportToExcel(exportData, `work-logs-${new Date().toISOString().split('T')[0]}`);
  };

  const handleViewLog = (log: WorkLog) => {
    setSelectedLog(log);
    setViewOpen(true);
  };

  const [markingPaid, setMarkingPaid] = useState(false);

  // Work card (operationsWorkCards) state: View modal, Record modal, Mark Paid
  const [selectedWorkCard, setSelectedWorkCard] = useState<OperationsWorkCard | null>(null);
  const [workCardViewOpen, setWorkCardViewOpen] = useState(false);
  const [workCardRecordOpen, setWorkCardRecordOpen] = useState(false);
  const [recordActualWorkers, setRecordActualWorkers] = useState('');
  const [recordActualInputs, setRecordActualInputs] = useState('');
  const [recordActualFuel, setRecordActualFuel] = useState('');
  const [recordActualChemicals, setRecordActualChemicals] = useState('');
  const [recordActualFertilizer, setRecordActualFertilizer] = useState('');
  const [recordNotes, setRecordNotes] = useState('');
  const [recordResourceItemId, setRecordResourceItemId] = useState('');
  const [recordResourceQuantity, setRecordResourceQuantity] = useState('');
  const [recordResourceQuantitySecondary, setRecordResourceQuantitySecondary] = useState('');
  const [recordRatePerPerson, setRecordRatePerPerson] = useState('');
  const [submittingWorkCardRecord, setSubmittingWorkCardRecord] = useState(false);
  const [markingWorkCardPaid, setMarkingWorkCardPaid] = useState(false);

  const openWorkCardRecord = (card: OperationsWorkCard) => {
    setSelectedWorkCard(card);
    setRecordActualWorkers(card.actual?.actualWorkers != null ? String(card.actual.actualWorkers) : '');
    setRecordRatePerPerson(card.actual?.ratePerPerson != null ? String(card.actual.ratePerPerson) : '');
    setRecordActualInputs(card.actual?.actualInputsUsed ?? '');
    setRecordActualFuel(card.actual?.actualFuelUsed ?? '');
    setRecordActualChemicals(card.actual?.actualChemicalsUsed ?? '');
    setRecordActualFertilizer(card.actual?.actualFertilizerUsed ?? '');
    setRecordNotes(card.actual?.notes ?? '');
    setRecordResourceItemId('');
    setRecordResourceQuantity('');
    setRecordResourceQuantitySecondary('');
    setWorkCardRecordOpen(true);
  };

  /** Inventory for the Record Work modal (card's company) */
  const recordModalInventory = useMemo(
    () => (selectedWorkCard?.companyId ? allInventoryItems.filter((i) => i.companyId === selectedWorkCard.companyId) : []),
    [allInventoryItems, selectedWorkCard?.companyId],
  );
  /** Resource items to show in Record modal based on card's work category (same as admin plan) */
  const recordModalResourceItems = useMemo(() => {
    if (!selectedWorkCard?.workCategory) return [];
    const cat = selectedWorkCard.workCategory;
    if (cat === 'Fertilizer application') return recordModalInventory.filter((i) => i.category === 'fertilizer');
    if (cat === 'Spraying') return recordModalInventory.filter((i) => i.category === 'chemical');
    if (cat === 'Watering') return recordModalInventory.filter((i) => i.category === 'fuel' || i.category === 'diesel');
    if (cat === 'Tying of crops') return recordModalInventory.filter((i) => i.category === 'ropes' || i.category === 'sacks');
    if (cat === 'Weeding') return recordModalInventory.filter((i) => ['materials', 'ropes', 'sacks'].includes(i.category));
    return recordModalInventory.filter((i) => ['materials', 'ropes', 'sacks'].includes(i.category));
  }, [selectedWorkCard?.workCategory, recordModalInventory]);
  const recordModalSelectedItem = recordResourceItemId ? recordModalInventory.find((i) => i.id === recordResourceItemId) : null;

  const handleSubmitWorkCardRecord = async () => {
    if (!user || !selectedWorkCard) return;
    if (!canManagerSubmit(selectedWorkCard, managerIdsForCurrentUser)) return;
    const cat = selectedWorkCard.workCategory;
    const item = recordModalSelectedItem;
    let actualInputsUsed: string | undefined;
    let actualFuelUsed: string | undefined;
    let actualChemicalsUsed: string | undefined;
    let actualFertilizerUsed: string | undefined;
    if (item && recordResourceQuantity) {
      const q = recordResourceQuantity.trim();
      const q2 = recordResourceQuantitySecondary?.trim();
      const unitLabel = item.category === 'fertilizer' ? 'bags' : item.category === 'fuel' || item.category === 'diesel' ? 'containers' : item.unit || '';
      let str = `${item.name} - ${q}${unitLabel ? ` ${unitLabel}` : ''}`;
      if (q2) {
        if (item.category === 'fertilizer') str += `, ${q2} kg`;
        else if (item.category === 'fuel' || item.category === 'diesel') str += `, ${q2} L`;
      }
      if (cat === 'Fertilizer application') actualFertilizerUsed = str;
      else if (cat === 'Spraying') actualChemicalsUsed = str;
      else if (cat === 'Watering') actualFuelUsed = str;
      else actualInputsUsed = str;
    } else {
      if (cat === 'Fertilizer application') actualFertilizerUsed = recordActualFertilizer || undefined;
      else if (cat === 'Spraying') actualChemicalsUsed = recordActualChemicals || undefined;
      else if (cat === 'Watering') actualFuelUsed = recordActualFuel || undefined;
      else actualInputsUsed = recordActualInputs || undefined;
    }
    const resourceQty = item && recordResourceQuantity ? parseQuantityOrFraction(recordResourceQuantity) : 0;
    const resourceQtySecondary = item && recordResourceQuantitySecondary ? parseQuantityOrFraction(recordResourceQuantitySecondary) : undefined;

    setSubmittingWorkCardRecord(true);
    try {
      await submitExecution({
        cardId: selectedWorkCard.id,
        managerId: user.id,
        managerName: user.name,
        managerIds: Array.from(managerIdsForCurrentUser),
        actualWorkers: recordActualWorkers ? Number(recordActualWorkers) : undefined,
        ratePerPerson: recordRatePerPerson ? Number(recordRatePerPerson) : undefined,
        actualInputsUsed,
        actualFuelUsed,
        actualChemicalsUsed,
        actualFertilizerUsed,
        actualResourceItemId: item && resourceQty > 0 ? item.id : undefined,
        actualResourceQuantity: item && resourceQty > 0 ? resourceQty : undefined,
        actualResourceQuantitySecondary: resourceQtySecondary != null && resourceQtySecondary > 0 ? resourceQtySecondary : undefined,
        notes: recordNotes || undefined,
        actorEmail: user.email,
        actorUid: user.id,
      });
      invalidateWorkCards();
      setWorkCardRecordOpen(false);
      setSelectedWorkCard(null);
    } catch (e) {
      console.error(e);
      alert('Failed to submit work. Please try again.');
    } finally {
      setSubmittingWorkCardRecord(false);
    }
  };

  const handleMarkWorkCardPaid = async (card: OperationsWorkCard) => {
    if (!user || !canMarkAsPaid(card)) return;
    setMarkingWorkCardPaid(true);
    try {
      await markWorkCardPaid({
        cardId: card.id,
        paidBy: user.id,
        paidByName: user.name,
        actorEmail: user.email,
        actorUid: user.id,
      });
      invalidateWorkCards();
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
      if (selectedWorkCard?.id === card.id) setSelectedWorkCard({ ...card, status: 'paid', payment: { ...card.payment, isPaid: true } });
    } catch (e) {
      console.error(e);
      alert('Failed to mark as paid.');
    } finally {
      setMarkingWorkCardPaid(false);
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Monitoring work for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'View and monitor all work activities'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setLogDailyWorkOpen(true);
              setLogDate(new Date());
              setLogWorkType('');
              setLogNumberOfPeople('');
              setLogRatePerPerson('');
              setLogDrumsSprayed('');
              setLogNotes('');
              setLogInputs([]);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Log Daily Work
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={filteredWorkLogs.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          onClick={() => {
            setDrawerType('total');
            setDrawerOpen(true);
          }}
          className="cursor-pointer"
        >
          <SimpleStatCard
            title="Total Work Logs"
            value={stats.totalLogs}
            icon={CalendarDays}
            iconVariant="info"
            layout="mobile-compact"
          />
        </div>
        <div
          onClick={() => {
            setDrawerType('paid');
            setDrawerOpen(true);
          }}
          className="cursor-pointer"
        >
          <SimpleStatCard
            title="Paid Logs"
            value={stats.paidLogs}
            icon={CheckCircle}
            iconVariant="success"
            layout="mobile-compact"
          />
        </div>
        <div
          onClick={() => {
            setDrawerType('unpaid');
            setDrawerOpen(true);
          }}
          className="cursor-pointer"
        >
          <SimpleStatCard
            title="Unpaid Logs"
            value={stats.unpaidLogs}
            icon={Clock}
            iconVariant="warning"
            layout="mobile-compact"
          />
        </div>
        <div
          onClick={() => {
            setDrawerType('amount');
            setDrawerOpen(true);
          }}
          className="cursor-pointer"
        >
          <SimpleStatCard
            title="Total labour"
            value={formatCurrency(stats.totalLabour)}
            icon={Banknote}
            iconVariant="primary"
            layout="mobile-compact"
          />
        </div>
      </div>

      {/* Work Cards (Admin-created; Manager only submits execution — never creates) */}
      {user && (user.companyId || managerIdsArray.length > 0) && (
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold text-foreground mb-1">My Work Cards</h2>
            <p className="text-sm text-muted-foreground">
              Work cards created by Admin and assigned to you. Use <strong>Record Work</strong> to submit execution data into the same card (no new cards).
              Approved and paid cards will appear in your Work Logs &amp; Filters section.
            </p>
          </div>
          {workCardsInProgress.length === 0 ? (
            <div className="fv-card p-6 text-center text-muted-foreground">
              <p className="font-medium text-foreground">No active work cards assigned to you</p>
              <p className="text-sm mt-1">
                When an admin creates a new work card and allocates it to you, it will appear here until it is approved or paid.
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {workCardsInProgress.map((card) => (
              <div
                key={card.id}
                className={cn(
                  'fv-card p-4 hover:shadow-md transition-shadow relative overflow-hidden',
                )}
              >
                {/* Status watermark */}
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 text-4xl md:text-5xl font-bold rotate-[-22deg] opacity-[0.12]',
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
                <div className="space-y-2 relative z-10">
                  <p className="font-medium text-foreground flex items-center gap-2">
                    <span className="text-lg">
                      {getWorkTypeIcon(card.workTitle || card.workCategory)}
                    </span>
                    <span className="truncate">
                      {card.workTitle || card.workCategory}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {card.stageName || card.stageId} • Planned: {card.planned?.workers ?? 0} workers
                    {card.planned?.estimatedCost != null && ` • KES ${Number(card.planned.estimatedCost).toLocaleString()}`}
                  </p>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span>Status:</span>
                    <Badge variant="outline" className="capitalize">{card.status}</Badge>
                  </div>
                  {card.actual?.submitted && card.actual?.actualWorkers != null && card.actual?.ratePerPerson != null && card.actual.actualWorkers > 0 && card.actual.ratePerPerson > 0 && (
                    <p className="text-xs text-foreground">
                      Labour: {card.actual.actualWorkers} × KES {card.actual.ratePerPerson.toLocaleString()} = KES {(card.actual.actualWorkers * card.actual.ratePerPerson).toLocaleString()}
                      {card.payment?.isPaid && ' (expense recorded)'}
                    </p>
                  )}
                  <div className="flex gap-2 pt-2 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedWorkCard(card);
                        setWorkCardViewOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openWorkCardRecord(card)}
                      disabled={!canManagerSubmit(card, managerIdsForCurrentUser)}
                    >
                      Record Work
                    </Button>
                    {canMarkAsPaid(card) && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkWorkCardPaid(card)}
                        disabled={markingWorkCardPaid}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Assigned Work Plans from Admin (legacy workLogs) */}
      {user && assignedPlans.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold text-foreground mb-1">Assigned Work Plans</h2>
            <p className="text-sm text-muted-foreground">
              These are work plans created by admin and assigned to you. Fill in the
              actual work details below.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {assignedPlans.map((plan) => (
              <div
                key={plan.id}
                className="fv-card p-4 hover:shadow-md transition-shadow"
              >
                <div className="space-y-2">
                  <p className="font-medium text-foreground">{plan.workCategory}</p>
                  <p className="text-xs text-muted-foreground">
                    Stage: {plan.stageName} •{' '}
                    {plan.date ? formatLogDate(plan.date) : 'No date set'}
                  </p>
                  {plan.adminName && (
                    <p className="text-xs text-muted-foreground">
                      Planned by: {plan.adminName}
                    </p>
                  )}
                  <Button size="sm" className="w-full mt-3" onClick={() => openFillDialog(plan)}>
                    Log in Work
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Toggle Button */}
      <div className="flex items-center justify-between">
        <div />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {(search || statusFilter !== 'all' || stageFilter !== 'all' || dateRangeFilter !== 'all') && (
            <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>
      </div>

      {/* Filters Panel */}
      {filtersOpen && (
        <div className="space-y-0">
          <div className={cn(
            "fv-card p-2 sm:p-4 transition-all",
            hasActiveFilters && "rounded-b-none border-b-0"
          )}>
            <div className="flex flex-col md:flex-row md:items-center gap-2 sm:gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search work logs..."
                    className="fv-input pl-8 sm:pl-10 w-full h-8 sm:h-10 text-sm sm:text-base"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="w-full md:w-auto space-y-2">
                <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full h-8 text-xs sm:w-[140px] sm:h-10 sm:text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-full h-8 text-xs sm:w-[140px] sm:h-10 sm:text-sm">
                      <SelectValue placeholder="Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      {uniqueStages.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
                    <SelectTrigger className="w-full h-8 text-xs sm:w-[140px] sm:h-10 sm:text-sm">
                      <SelectValue placeholder="Date Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Dates</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="thisWeek">This Week</SelectItem>
                      <SelectItem value="thisMonth">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full sm:w-auto h-8 sm:h-10 text-xs sm:text-sm"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('all');
                      setStageFilter('all');
                      setDateRangeFilter('all');
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Filter Results Panel - Inline below filters */}
          {hasActiveFilters && (
            <div className="fv-card rounded-t-none border-t-0 p-4 max-h-[60vh] overflow-y-auto">
              <div className="mb-3">
                <h3 className="font-semibold text-foreground">Filtered Results</h3>
                <p className="text-sm text-muted-foreground">
                  Showing {filteredWorkLogs.length} result{filteredWorkLogs.length !== 1 ? 's' : ''}
                  {search && ` matching "${search}"`}
                  {statusFilter !== 'all' && ` • ${statusFilter === 'paid' ? 'Paid' : 'Unpaid'}`}
                  {stageFilter !== 'all' && ` • Stage: ${stageFilter}`}
                  {dateRangeFilter !== 'all' && ` • ${dateRangeFilter}`}
                </p>
              </div>
              <div className="space-y-2">
                {filteredWorkLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No work logs match your filters</p>
                  </div>
                ) : (
                  filteredWorkLogs.map((log) => (
                    <div
                      key={log.id}
                      className={cn(
                        "p-3 border rounded-lg hover:bg-muted/30 cursor-pointer relative overflow-hidden",
                        log.paid && "after:content-['PAID'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-5xl after:font-bold after:text-red-500/10 after:rotate-[-35deg] after:pointer-events-none after:select-none after:z-0"
                      )}
                      onClick={() => {
                        setSelectedLog(log);
                        setViewOpen(true);
                      }}
                    >
                      <div className="relative z-10 flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{log.workCategory}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatLogDate(log.date)} • {log.stageName}
                          </p>
                          <p className="text-sm mt-1">
                            {log.numberOfPeople} people
                            {log.ratePerPerson && ` @ KES ${log.ratePerPerson.toLocaleString()}`}
                            {log.totalPrice && (
                              <span className="ml-2 font-semibold text-foreground">
                                • Total: KES {log.totalPrice.toLocaleString()}
                              </span>
                            )}
                          </p>
                        </div>
                        <Badge
                          className={cn(
                            'capitalize shrink-0',
                            log.paid
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800',
                          )}
                        >
                          {log.paid ? 'Paid' : 'Unpaid'}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Work Logs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Work Logs</h3>
            <p className="text-sm text-muted-foreground">
              {combinedManagerEntries.length} entries found
              {statusFilter !== 'all' && ` • ${statusFilter === 'paid' ? 'Paid' : 'Unpaid'}`}
              {stageFilter !== 'all' && ` • Stage: ${stageFilter}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
            <Button
              variant={viewMode === 'cards' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('cards')}
            >
              <Grid className="h-4 w-4 mr-1" />
              Cards
            </Button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="fv-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading work logs...</p>
          </div>
        ) : combinedManagerEntries.length === 0 ? (
          <div className="fv-card p-8 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Work Logs Found</h3>
            <p className="text-sm text-muted-foreground">
              {search || statusFilter !== 'all' || stageFilter !== 'all' || dateRangeFilter !== 'all'
                ? 'Try changing your filters'
                : 'No work logs have been recorded yet'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="fv-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted-50">
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date & Time</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Work</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Stage</th>
                    {showPeopleSection && (
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">People</th>
                    )}
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedManagerEntries.map((entry) =>
                    entry.type === 'workLog' ? (
                      <tr
                        key={`log-${entry.log.id}`}
                        className={cn(
                          "border-b hover:bg-muted/30 relative",
                          entry.log.paid &&
                            "after:content-['PAID'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-6xl after:font-bold after:text-red-500/10 after:rotate-[-35deg] after:pointer-events-none after:select-none after:z-0"
                        )}
                      >
                        <td className="p-3 relative z-10">
                          <div className="text-sm font-medium text-foreground">
                            {formatLogDate(entry.log.date)}
                          </div>
                        </td>
                        <td className="p-3 relative z-10">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {getWorkTypeIcon(entry.log.workCategory)}
                            </span>
                            <div>
                              <div className="font-medium text-foreground">{entry.log.workCategory}</div>
                              {entry.log.notes && (
                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {entry.log.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 relative z-10">
                          <Badge variant="outline" className="text-xs">
                            {entry.log.stageName}
                          </Badge>
                        </td>
                        {showPeopleSection && (
                          <td className="p-3 relative z-10">
                            <div className="text-sm">
                              {entry.log.numberOfPeople} people
                              {entry.log.ratePerPerson && (
                                <div className="text-xs text-muted-foreground">
                                  @ {formatCurrency(entry.log.ratePerPerson)} each
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="p-3 relative z-10">
                          <div className="font-semibold text-foreground">
                            {entry.log.totalPrice ? formatCurrency(entry.log.totalPrice) : 'N/A'}
                          </div>
                        </td>
                        <td className="p-3 relative z-10">
                          <Badge
                            className={cn(
                              'capitalize',
                              entry.log.paid
                                ? 'bg-green-100 text-green-800 hover:bg-green-100'
                                : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                            )}
                          >
                            {entry.log.paid ? 'Paid' : 'Unpaid'}
                          </Badge>
                        </td>
                        <td className="p-3 relative z-10">
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewLog(entry.log);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const d = toDate(entry.log.date);
                                setLogDate(d || new Date());
                                setLogWorkType(entry.log.workType || entry.log.workCategory || '');
                                setLogNumberOfPeople('');
                                setLogRatePerPerson('');
                                setLogDrumsSprayed('');
                                setLogWateringContainers('');
                                setLogTyingUsedType('ropes');
                                setLogNotes('');
                                setLogInputs([]);
                                setLogDailyWorkOpen(true);
                              }}
                            >
                              Record work
                            </Button>
                            {!entry.log.paid && (entry.log.managerSubmittedAt != null || !entry.log.adminName) && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkAsPaid(entry.log);
                                }}
                                disabled={markingPaid}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Mark Paid
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={`card-${entry.card.id}`}
                        className={cn(
                          "border-b hover:bg-muted/30 relative",
                          (entry.card.payment?.isPaid || entry.card.status === 'paid') &&
                            "after:content-['PAID'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-6xl after:font-bold after:text-red-500/10 after:rotate-[-35deg] after:pointer-events-none after:select-none after:z-0"
                        )}
                      >
                        <td className="p-3 relative z-10">
                          <div className="text-sm font-medium text-foreground">
                            {formatLogDate(
                              (entry.card.actual?.actualDate as any) ??
                              (entry.card.approvedAt as any) ??
                              (entry.card.createdAt as any)
                            )}
                          </div>
                        </td>
                        <td className="p-3 relative z-10">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {getWorkTypeIcon(entry.card.workTitle || entry.card.workCategory)}
                            </span>
                            <div>
                              <div className="font-medium text-foreground">
                                {entry.card.workTitle || entry.card.workCategory}
                              </div>
                              {entry.card.actual?.notes && (
                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {entry.card.actual.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 relative z-10">
                          <Badge variant="outline" className="text-xs">
                            {entry.card.stageName || entry.card.stageId || '—'}
                          </Badge>
                        </td>
                        {showPeopleSection && (
                          <td className="p-3 relative z-10">
                            <div className="text-sm">
                              {(entry.card.actual?.actualWorkers ?? 0)} people
                              {entry.card.actual?.ratePerPerson != null && (
                                <div className="text-xs text-muted-foreground">
                                  @ {formatCurrency(entry.card.actual.ratePerPerson)} each
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="p-3 relative z-10">
                          <div className="font-semibold text-foreground">
                            {entry.card.actual?.actualWorkers != null &&
                            entry.card.actual?.ratePerPerson != null
                              ? formatCurrency(
                                  entry.card.actual.actualWorkers * entry.card.actual.ratePerPerson
                                )
                              : 'N/A'}
                          </div>
                        </td>
                        <td className="p-3 relative z-10">
                          <Badge
                            className={cn(
                              'capitalize',
                              (entry.card.payment?.isPaid || entry.card.status === 'paid')
                                ? 'bg-green-100 text-green-800 hover:bg-green-100'
                                : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                            )}
                          >
                            {(entry.card.payment?.isPaid || entry.card.status === 'paid') ? 'Paid' : 'Approved'}
                          </Badge>
                        </td>
                        <td className="p-3 relative z-10">
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedWorkCard(entry.card);
                                setWorkCardViewOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View card
                            </Button>
                            {canManagerSubmit(entry.card, managerIdsForCurrentUser) &&
                              !entry.card.payment?.isPaid && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openWorkCardRecord(entry.card);
                                  }}
                                >
                                  Record work
                                </Button>
                              )}
                            {canMarkAsPaid(entry.card) && !entry.card.payment?.isPaid && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkWorkCardPaid(entry.card);
                                }}
                                disabled={markingWorkCardPaid}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Mark Paid
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {combinedManagerEntries.map((entry) =>
              entry.type === 'workLog' ? (
                <div
                  key={`log-${entry.log.id}`}
                  className={cn(
                    "fv-card relative p-4 overflow-hidden",
                    entry.log.paid && "after:content-['PAID'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-6xl after:font-bold after:text-red-500/15 after:rotate-[-35deg] after:pointer-events-none after:select-none after:z-0"
                  )}
                >
                  <div className="relative z-10 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">
                            {getWorkTypeIcon(entry.log.workCategory)}
                          </span>
                          <h4 className="font-semibold text-foreground">{entry.log.workCategory}</h4>
                          <Badge
                            className={cn(
                              'capitalize text-xs',
                              entry.log.paid
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            )}
                          >
                            {entry.log.paid ? 'Paid' : 'Unpaid'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatLogDate(entry.log.date)} • {entry.log.stageName}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-sm">
                      {showPeopleSection && (
                        <p className="text-muted-foreground">
                          {entry.log.numberOfPeople} people
                          {entry.log.ratePerPerson && ` @ ${formatCurrency(entry.log.ratePerPerson)}`}
                        </p>
                      )}
                      {entry.log.totalPrice && (
                        <p className="font-semibold text-foreground">
                          Total: {formatCurrency(entry.log.totalPrice)}
                        </p>
                      )}
                    </div>

                    {entry.log.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {entry.log.notes}
                      </p>
                    )}

                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewLog(entry.log)}
                        className="flex-1 min-w-0"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const project = entry.log.projectId ? projects.find((p) => p.id === entry.log.projectId) : null;
                          if (project) setActiveProject(project);
                          const d = toDate(entry.log.date);
                          setLogDate(d || new Date());
                          setLogWorkType(entry.log.workType || entry.log.workCategory || '');
                          setLogNumberOfPeople('');
                          setLogRatePerPerson('');
                          setLogDrumsSprayed('');
                          setLogWateringContainers('');
                          setLogTyingUsedType('ropes');
                          setLogNotes('');
                          setLogInputs([]);
                          setLogDailyWorkOpen(true);
                        }}
                        className="flex-1 min-w-0"
                      >
                        Record work
                      </Button>
                      {!entry.log.paid && (entry.log.managerSubmittedAt != null || !entry.log.adminName) && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsPaid(entry.log);
                          }}
                          disabled={markingPaid}
                          className="flex-1 min-w-0"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Mark Paid
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={`card-${entry.card.id}`}
                  className={cn(
                    "fv-card relative p-4 overflow-hidden",
                    (entry.card.payment?.isPaid || entry.card.status === 'paid') && "after:content-['PAID'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-6xl after:font-bold after:text-red-500/15 after:rotate-[-35deg] after:pointer-events-none after:select-none after:z-0"
                  )}
                >
                  <div className="relative z-10 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">
                            {getWorkTypeIcon(entry.card.workTitle || entry.card.workCategory)}
                          </span>
                          <h4 className="font-semibold text-foreground">
                            {entry.card.workTitle || entry.card.workCategory}
                          </h4>
                          <Badge
                            className={cn(
                              'capitalize text-xs',
                              (entry.card.payment?.isPaid || entry.card.status === 'paid')
                                ? 'bg-green-100 text-green-800'
                                : 'bg-emerald-100 text-emerald-800'
                            )}
                          >
                            {(entry.card.payment?.isPaid || entry.card.status === 'paid') ? 'Paid' : 'Approved'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatLogDate(
                            (entry.card.actual?.actualDate as any) ??
                            (entry.card.approvedAt as any) ??
                            (entry.card.createdAt as any)
                          )}{' '}
                          • {entry.card.stageName || entry.card.stageId || '—'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1 text-sm">
                      <p className="text-muted-foreground">
                        {(entry.card.actual?.actualWorkers ?? 0)} people
                        {entry.card.actual?.ratePerPerson != null &&
                          ` @ ${formatCurrency(entry.card.actual.ratePerPerson)}`}
                      </p>
                      {(entry.card.actual?.actualWorkers != null &&
                        entry.card.actual?.ratePerPerson != null) && (
                        <p className="font-semibold text-foreground">
                          Total:{' '}
                          {formatCurrency(
                            entry.card.actual.actualWorkers * entry.card.actual.ratePerPerson
                          )}
                        </p>
                      )}
                    </div>

                    {entry.card.actual?.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {entry.card.actual.notes}
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* View Work Log Modal */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Work Log Details</DialogTitle>
            <DialogDescription>
              Full details of the work log
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              {/* Header with status */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg text-foreground">
                    {selectedLog.workCategory}
                  </h3>
                  {selectedLog.workType && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Work Type: {selectedLog.workType}
                    </p>
                  )}
                </div>
                <Badge
                  className={cn(
                    'capitalize',
                    selectedLog.paid
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  )}
                >
                  {selectedLog.paid ? 'Paid' : 'Unpaid'}
                </Badge>
              </div>
              
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Date & Time</p>
                  <p className="font-medium">{formatLogDate(selectedLog.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Stage</p>
                  <p className="font-medium">{selectedLog.stageName}</p>
                </div>
                {showPeopleSection && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Number of People</p>
                      <p className="font-medium">{selectedLog.numberOfPeople}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Rate per Person</p>
                      <p className="font-medium">
                        {selectedLog.ratePerPerson 
                          ? formatCurrency(selectedLog.ratePerPerson)
                          : 'N/A'}
                      </p>
                    </div>
                  </>
                )}
              </div>
              
              {/* Financial Information */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">Financial Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
                    <p className="text-lg font-bold text-primary">
                      {selectedLog.totalPrice 
                        ? formatCurrency(selectedLog.totalPrice)
                        : 'N/A'}
                    </p>
                  </div>
                  {selectedLog.paid && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Paid By</p>
                      <p className="font-medium">{(selectedLog as any).paidByName || 'N/A'}</p>
                      {(selectedLog as any).paidAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          on {formatLogDate((selectedLog as any).paidAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {showPeopleSection && selectedLog.totalPrice && selectedLog.numberOfPeople && selectedLog.ratePerPerson && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Calculation: {selectedLog.numberOfPeople} × {formatCurrency(selectedLog.ratePerPerson)} = {formatCurrency(selectedLog.totalPrice)}
                  </p>
                )}
              </div>
              
              {/* Assignment Information (admin sees full assignment; manager sees only managed-by) */}
              {showPeopleSection ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Assigned To</p>
                    <p className="font-medium">
                      {getAssignedEmployeeName(selectedLog)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Managed By</p>
                    <p className="font-medium">
                      {selectedLog.managerName || getAssigneeName(selectedLog.managerId)}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Managed By</p>
                  <p className="font-medium">
                    {selectedLog.managerName || getAssigneeName(selectedLog.managerId)}
                  </p>
                </div>
              )}
              
              {/* Additional Information */}
              {selectedLog.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <div className="p-3 bg-muted/20 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{selectedLog.notes}</p>
                  </div>
                </div>
              )}

              {(selectedLog as any).inputsUsed && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Inputs Used</p>
                  <div className="p-3 bg-muted/20 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">
                      {(selectedLog as any).inputsUsed}
                    </p>
                  </div>
                </div>
              )}
              
              {(selectedLog as any).changeReason && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reason for Change</p>
                  <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{(selectedLog as any).changeReason}</p>
                  </div>
                </div>
              )}
              
              {/* Project Information */}
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-1">Project Information</p>
                <p className="text-sm">
                  Log ID: {selectedLog.id?.substring(0, 8)}...
                  {selectedLog.cropType && (
                    <span className="ml-2">• Crop Type: {selectedLog.cropType}</span>
                  )}
                </p>
              </div>

              {/* Actions: Mark as Paid only when this work was logged by the manager */}
              {!selectedLog.paid && (selectedLog.managerSubmittedAt != null || !selectedLog.adminName) && (
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    onClick={() => handleMarkAsPaid(selectedLog)}
                    disabled={markingPaid}
                    className="fv-btn fv-btn--primary"
                  >
                    {markingPaid ? 'Marking...' : 'Mark as Paid'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Work Card (read-only) */}
      <Dialog open={workCardViewOpen} onOpenChange={setWorkCardViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Work Card Details</DialogTitle>
            <DialogDescription>Read-only view of the work card</DialogDescription>
          </DialogHeader>
          {selectedWorkCard && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg text-foreground">
                  {selectedWorkCard.workTitle || selectedWorkCard.workCategory}
                </h3>
                <Badge variant="outline" className="capitalize">{selectedWorkCard.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Stage</p>
                  <p className="font-medium">{selectedWorkCard.stageName || selectedWorkCard.stageId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Planned workers</p>
                  <p className="font-medium">{selectedWorkCard.planned?.workers ?? '—'}</p>
                </div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">Planned (Admin)</h4>
                {selectedWorkCard.planned?.inputs != null && String(selectedWorkCard.planned.inputs).trim() !== '' && <p className="text-sm text-muted-foreground">Inputs: {selectedWorkCard.planned.inputs}</p>}
                {selectedWorkCard.planned?.fuel != null && String(selectedWorkCard.planned.fuel).trim() !== '' && <p className="text-sm text-muted-foreground">Fuel: {selectedWorkCard.planned.fuel}</p>}
                {selectedWorkCard.planned?.chemicals != null && String(selectedWorkCard.planned.chemicals).trim() !== '' && <p className="text-sm text-muted-foreground">Chemicals: {selectedWorkCard.planned.chemicals}</p>}
                {selectedWorkCard.planned?.fertilizer != null && String(selectedWorkCard.planned.fertilizer).trim() !== '' && <p className="text-sm text-muted-foreground">Fertilizer: {selectedWorkCard.planned.fertilizer}</p>}
                {selectedWorkCard.planned?.estimatedCost != null && (
                  <p className="text-sm font-medium mt-1">Est. cost: KES {Number(selectedWorkCard.planned.estimatedCost).toLocaleString()}</p>
                )}
              </div>
              {selectedWorkCard.actual?.submitted && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-2">Actual (Your submission)</h4>
                  <p className="text-sm">Workers: {selectedWorkCard.actual?.actualWorkers ?? '—'}</p>
                  {selectedWorkCard.actual?.ratePerPerson != null && (
                    <p className="text-sm">Price per person: KES {selectedWorkCard.actual.ratePerPerson.toLocaleString()}</p>
                  )}
                  {selectedWorkCard.actual?.actualWorkers != null && selectedWorkCard.actual?.ratePerPerson != null && selectedWorkCard.actual.actualWorkers > 0 && selectedWorkCard.actual.ratePerPerson > 0 && (
                    <p className="text-sm font-medium mt-1">Total labour: KES {(selectedWorkCard.actual.actualWorkers * selectedWorkCard.actual.ratePerPerson).toLocaleString()}</p>
                  )}
                  {selectedWorkCard.actual?.actualInputsUsed != null && String(selectedWorkCard.actual.actualInputsUsed).trim() !== '' && <p className="text-sm">Inputs: {selectedWorkCard.actual.actualInputsUsed}</p>}
                  {selectedWorkCard.actual?.actualFuelUsed != null && String(selectedWorkCard.actual.actualFuelUsed).trim() !== '' && <p className="text-sm">Fuel: {selectedWorkCard.actual.actualFuelUsed}</p>}
                  {selectedWorkCard.actual?.actualChemicalsUsed != null && String(selectedWorkCard.actual.actualChemicalsUsed).trim() !== '' && <p className="text-sm">Chemicals: {selectedWorkCard.actual.actualChemicalsUsed}</p>}
                  {selectedWorkCard.actual?.actualFertilizerUsed != null && String(selectedWorkCard.actual.actualFertilizerUsed).trim() !== '' && <p className="text-sm">Fertilizer: {selectedWorkCard.actual.actualFertilizerUsed}</p>}
                  {selectedWorkCard.actual?.notes && (
                    <p className="text-sm mt-1">Notes: {selectedWorkCard.actual.notes}</p>
                  )}
                  {selectedWorkCard.payment?.isPaid && (
                    <p className="text-sm mt-2 text-green-600 font-medium">Paid — labour expense recorded.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Work (Manager submits execution into existing card — never creates) */}
      <Dialog open={workCardRecordOpen} onOpenChange={setWorkCardRecordOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Work</DialogTitle>
            <DialogDescription>
              Submit execution data for this work card. This updates the existing card; no new card is created.
            </DialogDescription>
          </DialogHeader>
          {selectedWorkCard && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="font-medium text-foreground">{selectedWorkCard.workTitle || selectedWorkCard.workCategory}</p>
                <p className="text-xs text-muted-foreground">Planned: {selectedWorkCard.planned?.workers ?? 0} workers</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Actual workers</label>
                <input
                  type="number"
                  min={0}
                  className="fv-input w-full"
                  value={recordActualWorkers}
                  onChange={(e) => setRecordActualWorkers(e.target.value)}
                  placeholder="Number of workers"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Price per person (KES)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="fv-input w-full"
                  value={recordRatePerPerson}
                  onChange={(e) => setRecordRatePerPerson(e.target.value)}
                  placeholder="e.g. 500"
                />
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="text-sm font-medium text-foreground">
                  Total labour: KES {(Number(recordActualWorkers) || 0) * (Number(recordRatePerPerson) || 0) ? ((Number(recordActualWorkers) || 0) * (Number(recordRatePerPerson) || 0)).toLocaleString() : '0'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {recordActualWorkers || '0'} × KES {(Number(recordRatePerPerson) || 0).toLocaleString()} (expense counted when marked as paid)
                </div>
              </div>
              {selectedWorkCard.workCategory && (
                recordModalResourceItems.length > 0 ? (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        {selectedWorkCard.workCategory === 'Fertilizer application' && 'Actual fertilizer used'}
                        {selectedWorkCard.workCategory === 'Spraying' && 'Actual chemical used'}
                        {selectedWorkCard.workCategory === 'Watering' && 'Actual fuel used'}
                        {(selectedWorkCard.workCategory === 'Tying of crops' || selectedWorkCard.workCategory === 'Weeding') && 'Actual inputs used'}
                        {!['Fertilizer application', 'Spraying', 'Watering', 'Tying of crops', 'Weeding'].includes(selectedWorkCard.workCategory) && 'Actual resource used'}
                      </label>
                      <Select value={recordResourceItemId || '__none__'} onValueChange={(v) => { setRecordResourceItemId(v === '__none__' ? '' : v); setRecordResourceQuantity(''); setRecordResourceQuantitySecondary(''); }}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select from inventory" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {recordModalResourceItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>{item.name} ({item.unit})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {recordModalSelectedItem && (
                      <>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            {recordModalSelectedItem.category === 'fertilizer' && 'Bags'}
                            {(recordModalSelectedItem.category === 'fuel' || recordModalSelectedItem.category === 'diesel') && 'Containers'}
                            {recordModalSelectedItem.category === 'chemical' && (recordModalSelectedItem.packagingType === 'box' ? 'Units (items used, e.g. 2 = 2 items from box)' : 'Units')}
                            {(recordModalSelectedItem.category === 'ropes' || recordModalSelectedItem.category === 'sacks' || recordModalSelectedItem.category === 'materials') && `Amount (${recordModalSelectedItem.unit})`}
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="fv-input w-full"
                            value={recordResourceQuantity}
                            onChange={(e) => setRecordResourceQuantity(e.target.value)}
                            placeholder={recordModalSelectedItem.category === 'fertilizer' ? 'e.g. 2' : 'e.g. 1'}
                          />
                        </div>
                        {(recordModalSelectedItem.category === 'fertilizer' || recordModalSelectedItem.category === 'fuel' || recordModalSelectedItem.category === 'diesel') && (
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              {recordModalSelectedItem.category === 'fertilizer' ? 'Kgs (optional)' : 'Litres (optional)'}
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="fv-input w-full"
                              value={recordResourceQuantitySecondary}
                              onChange={(e) => setRecordResourceQuantitySecondary(e.target.value)}
                              placeholder={recordModalSelectedItem.category === 'fertilizer' ? 'e.g. 50' : 'e.g. 20'}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Actual resource used (optional)</label>
                    <input
                      type="text"
                      className="fv-input w-full"
                      value={
                        selectedWorkCard.workCategory === 'Fertilizer application' ? recordActualFertilizer :
                        selectedWorkCard.workCategory === 'Spraying' ? recordActualChemicals :
                        selectedWorkCard.workCategory === 'Watering' ? recordActualFuel : recordActualInputs
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (selectedWorkCard.workCategory === 'Fertilizer application') setRecordActualFertilizer(v);
                        else if (selectedWorkCard.workCategory === 'Spraying') setRecordActualChemicals(v);
                        else if (selectedWorkCard.workCategory === 'Watering') setRecordActualFuel(v);
                        else setRecordActualInputs(v);
                      }}
                      placeholder="e.g. 2 bags NPK, 50 kg"
                    />
                  </div>
                )
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <textarea
                  className="fv-input w-full min-h-[80px]"
                  value={recordNotes}
                  onChange={(e) => setRecordNotes(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setWorkCardRecordOpen(false)} disabled={submittingWorkCardRecord}>
                  Cancel
                </Button>
                <Button onClick={handleSubmitWorkCardRecord} disabled={submittingWorkCardRecord}>
                  {submittingWorkCardRecord ? 'Submitting...' : 'Submit execution'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Log in Work: manager fills details for an assigned plan */}
      <Dialog open={fillOpen} onOpenChange={setFillOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log in Work</DialogTitle>
            <DialogDescription>
              Enter the actual work details for this assigned plan. After you submit, you can mark it as paid when ready.
            </DialogDescription>
          </DialogHeader>

          {selectedPlan && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">
                  Planned Work
                </p>
                <p className="font-medium text-foreground">
                  {selectedPlan.workCategory}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Stage: {selectedPlan.stageName} •{' '}
                  {selectedPlan.date ? formatLogDate(selectedPlan.date) : 'No date set'}
                </p>
              </div>

              {/* Work Type */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Work Type
                </label>
                <Select
                  value={formWorkType}
                  onValueChange={(val) => setFormWorkType(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select work type" />
                  </SelectTrigger>
                  <SelectContent>
                    {workTypesList.map((wt) => (
                      <SelectItem key={wt} value={wt}>
                        {wt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Number of People
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="fv-input w-full"
                    value={formPeople}
                    onChange={(e) => setFormPeople(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Rate per Person (KES)
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="fv-input w-full"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Notes (optional)
                </label>
                <textarea
                  className="fv-input w-full min-h-[80px]"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Inputs used (optional)
                </label>
                <div className="space-y-2">
                  {formInputs.map((usage) => {
                    const itemOptions = allInventoryItems.filter(
                      (i) =>
                        i.companyId === selectedPlan.companyId &&
                        (i.category === usage.category || (usage.category === 'diesel' && i.category === 'fuel')),
                    );
                    const selectedItem = usage.itemId ? allInventoryItems.find((i) => i.id === usage.itemId) : null;
                    return (
                      <div
                        key={usage.id}
                        className="flex flex-col sm:flex-row gap-2 p-2 border rounded-lg bg-muted/20"
                      >
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">
                              Category
                            </label>
                            <Select
                              value={usage.category}
                              onValueChange={(val) =>
                                setFormInputs((prev) =>
                                  prev.map((u) =>
                                    u.id === usage.id
                                      ? {
                                          ...u,
                                          category: val as InventoryCategory,
                                          itemId: '',
                                          litres: '',
                                          kgs: '',
                                        }
                                      : u,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger className="w-full h-8 text-xs">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                              <SelectContent>
                                {inventoryCategoriesForPlan.length === 0 ? (
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    No inventory categories for this plan
                                  </div>
                                ) : (
                                  inventoryCategoriesForPlan.map((cat) => (
                                    <SelectItem key={cat} value={cat}>
                                      {getInventoryCategoryLabel(cat)}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">
                              Item
                            </label>
                            <Select
                              value={usage.itemId}
                              onValueChange={(val) =>
                                setFormInputs((prev) =>
                                  prev.map((u) =>
                                    u.id === usage.id ? { ...u, itemId: val } : u,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger className="w-full h-8 text-xs">
                                <SelectValue placeholder="Select item" />
                              </SelectTrigger>
                              <SelectContent>
                                {itemOptions.map((item) => {
                                  const outOfStock = item.quantity <= 0;
                                  return (
                                    <SelectItem
                                      key={item.id}
                                      value={item.id}
                                      disabled={outOfStock}
                                    >
                                      {item.name}
                                      {outOfStock ? ' (Out of stock)' : ''}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 flex flex-col gap-1">
                            {(usage.category === 'fuel' || usage.category === 'diesel') && (
                              <>
                                <label className="text-[11px] text-muted-foreground">Containers</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="fv-input h-8 text-xs"
                                  value={usage.quantity}
                                  onChange={(e) =>
                                    setFormInputs((prev) =>
                                      prev.map((u) =>
                                        u.id === usage.id ? { ...u, quantity: e.target.value } : u,
                                      ),
                                    )
                                  }
                                  placeholder="e.g. 2, 0.5, 1/2"
                                />
                                <label className="text-[11px] text-muted-foreground">Litres (optional)</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="fv-input h-8 text-xs"
                                  value={usage.litres ?? ''}
                                  onChange={(e) =>
                                    setFormInputs((prev) =>
                                      prev.map((u) =>
                                        u.id === usage.id ? { ...u, litres: e.target.value } : u,
                                      ),
                                    )
                                  }
                                  placeholder="e.g. 20"
                                />
                              </>
                            )}
                            {usage.category === 'fertilizer' && (
                              <>
                                <label className="text-[11px] text-muted-foreground">Bags</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="fv-input h-8 text-xs"
                                  value={usage.quantity}
                                  onChange={(e) =>
                                    setFormInputs((prev) =>
                                      prev.map((u) =>
                                        u.id === usage.id ? { ...u, quantity: e.target.value } : u,
                                      ),
                                    )
                                  }
                                  placeholder="e.g. 2, 0.5, 1/2"
                                />
                                <label className="text-[11px] text-muted-foreground">Kgs (optional)</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="fv-input h-8 text-xs"
                                  value={usage.kgs ?? ''}
                                  onChange={(e) =>
                                    setFormInputs((prev) =>
                                      prev.map((u) =>
                                        u.id === usage.id ? { ...u, kgs: e.target.value } : u,
                                      ),
                                    )
                                  }
                                  placeholder="e.g. 50"
                                />
                              </>
                            )}
                            {(usage.category === 'chemical' || usage.category === 'materials') && (
                              <>
                                <label className="text-[11px] text-muted-foreground">
                                  {selectedItem?.packagingType === 'box' ? 'Units (items)' : 'Units'}
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="fv-input h-8 text-xs"
                                  value={usage.quantity}
                                  onChange={(e) =>
                                    setFormInputs((prev) =>
                                      prev.map((u) =>
                                        u.id === usage.id ? { ...u, quantity: e.target.value } : u,
                                      ),
                                    )
                                  }
                                  placeholder="e.g. 2, 0.5, 1/2"
                                />
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="fv-btn fv-btn--ghost self-start text-xs"
                          onClick={() =>
                            setFormInputs((prev) =>
                              prev.filter((u) => u.id !== usage.id),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary text-xs"
                    onClick={() =>
                      setFormInputs((prev) => [
                        ...prev,
                        {
                          id: Date.now().toString(),
                          category: (inventoryCategoriesForPlan[0] ?? 'fertilizer') as InventoryCategory,
                          itemId: '',
                          quantity: '',
                          litres: '',
                          kgs: '',
                        },
                      ])
                    }
                  >
                    Add input
                  </button>
                </div>
              </div>

              {/* Derived Total Amount */}
              <div className="text-sm text-muted-foreground">
                Total Amount:{' '}
                <span className="font-semibold text-foreground">
                  {formPeople && formRate
                    ? `KES ${(
                        Number(formPeople || '0') * Number(formRate || '0')
                      ).toLocaleString()}`
                    : '—'}
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setFillOpen(false)}
                  disabled={submittingPlanLog}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitPlanLog}
                  disabled={submittingPlanLog || !formPeople}
                >
                  {submittingPlanLog ? 'Submitting...' : 'Log in Work'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Log Daily Work Dialog */}
      <Dialog open={logDailyWorkOpen} onOpenChange={setLogDailyWorkOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Daily Work</DialogTitle>
            <DialogDescription>
              Create a new work log entry. You will be automatically assigned as the manager.
              {activeProject && (
                <span className="block mt-2 text-foreground font-medium">
                  Project: {activeProject.name}
                  {currentStage && ` · Stage: ${currentStage.stageName}`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {!activeProject && (
            <p className="text-sm text-muted-foreground py-4">
              Click &quot;Record work&quot; on a daily work card to log for that project (the card is already linked to a project).
            </p>
          )}
          {activeProject && (
            <div className="space-y-4">
              {/* Date and Work Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                  <input
                    type="date"
                    className="fv-input w-full"
                    value={logDate ? format(logDate, 'yyyy-MM-dd') : ''}
                    onChange={(e) => {
                      const parsed = new Date(e.target.value);
                      if (!isNaN(parsed.getTime())) {
                        setLogDate(parsed);
                      }
                    }}
                  />
                </div>

                {/* Work Type */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Work Type <span className="text-destructive">*</span>
                  </label>
                  <div className="flex gap-2">
                    <Select value={logWorkType} onValueChange={handleChangeLogWorkType}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select work type" />
                      </SelectTrigger>
                      <SelectContent>
                        {workTypesList.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setCustomWorkTypeName(''); setAddCustomWorkTypeOpen(true); }}
                      className="shrink-0"
                    >
                      Add new
                    </Button>
                  </div>
                </div>
              </div>

              {/* Number of People and Rate */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Number of People <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="fv-input w-full"
                    value={logNumberOfPeople}
                    onChange={(e) => setLogNumberOfPeople(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Rate per Person (KES)</label>
                  <input
                    type="number"
                    min="0"
                    className="fv-input w-full"
                    value={logRatePerPerson}
                    onChange={(e) => setLogRatePerPerson(e.target.value)}
                  />
                </div>
              </div>

              {/* Number of drums - only for spraying */}
              {logWorkType === 'Spraying' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Number of drums (sprayed)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="fv-input w-full"
                    value={logDrumsSprayed}
                    onChange={(e) => setLogDrumsSprayed(e.target.value)}
                    placeholder="e.g., 10"
                  />
                </div>
              )}

              {/* Containers used - only for watering */}
              {logWorkType === 'Watering' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Containers used (e.g. water containers)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="fv-input w-full"
                    value={logWateringContainers}
                    onChange={(e) => setLogWateringContainers(e.target.value)}
                    placeholder="e.g. 2, 0.5, 1/2"
                  />
                </div>
              )}

              {/* Tying of crops: used ropes or sacks */}
              {logWorkType === 'Tying of crops' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Used</label>
                  <Select value={logTyingUsedType} onValueChange={(v) => { setLogTyingUsedType(v as 'ropes' | 'sacks'); setLogInputs((prev) => prev.map((u) => ({ ...u, category: v as InventoryCategory, itemId: '' }))); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ropes">Ropes</SelectItem>
                      <SelectItem value="sacks">Sacks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Total Amount (auto-calculated) */}
              {logNumberOfPeople && logRatePerPerson && (
                <div className="text-sm text-muted-foreground">
                  Total Amount:{' '}
                  <span className="font-semibold text-foreground">
                    KES {(Number(logNumberOfPeople || '0') * Number(logRatePerPerson || '0')).toLocaleString()}
                  </span>
                </div>
              )}

              {/* Inputs Used - Show based on work type */}
              {(logWorkType === 'Spraying' || logWorkType === 'Fertilizer application' || logWorkType === 'Tying of crops' || logWorkType === 'Other') && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {logWorkType === 'Spraying' && 'Chemicals Used'}
                    {logWorkType === 'Fertilizer application' && 'Fertilizer Used'}
                    {logWorkType === 'Tying of crops' && (logTyingUsedType === 'ropes' ? 'Ropes Used' : 'Sacks Used')}
                    {logWorkType === 'Other' && 'Inputs Used'}
                    {' '}(optional)
                  </label>
                  <div className="space-y-2">
                    {logInputs.map((usage) => {
                      const categoryForFilter = logWorkType === 'Tying of crops' ? logTyingUsedType : usage.category;
                      const itemOptions = companyInventory.filter(
                        (i) =>
                          i.companyId === activeProject.companyId &&
                          (i.category === categoryForFilter || (categoryForFilter === 'diesel' && i.category === 'fuel')),
                      );
                      const selectedItem = usage.itemId ? companyInventory.find((i) => i.id === usage.itemId) : null;
                      return (
                        <div
                          key={usage.id}
                          className="flex flex-col sm:flex-row gap-2 p-2 border rounded-lg bg-muted/20"
                        >
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <label className="text-[11px] text-muted-foreground">Category</label>
                              <Select
                                value={usage.category}
                                onValueChange={(val) =>
                                  setLogInputs((prev) =>
                                    prev.map((u) =>
                                      u.id === usage.id
                                        ? {
                                            ...u,
                                            category: val as InventoryCategory,
                                            itemId: '',
                                            litres: '',
                                            kgs: '',
                                          }
                                        : u,
                                    ),
                                  )
                                }
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(() => {
                                    const categoriesToShow = logWorkType === 'Tying of crops'
                                      ? inventoryCategoriesFromStock.filter((c) => c === 'ropes' || c === 'sacks')
                                      : inventoryCategoriesFromStock;
                                    if (categoriesToShow.length === 0) {
                                      return (
                                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                          {logWorkType === 'Tying of crops' ? 'Add ropes or sacks in Inventory first' : 'No inventory categories yet'}
                                        </div>
                                      );
                                    }
                                    return categoriesToShow.map((cat) => (
                                      <SelectItem key={cat} value={cat}>
                                        {getInventoryCategoryLabel(cat)}
                                      </SelectItem>
                                    ));
                                  })()}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] text-muted-foreground">Item</label>
                              <Select
                                value={usage.itemId}
                                onValueChange={(val) =>
                                  setLogInputs((prev) =>
                                    prev.map((u) =>
                                      u.id === usage.id ? { ...u, itemId: val } : u,
                                    ),
                                  )
                                }
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue placeholder="Select item" />
                                </SelectTrigger>
                                <SelectContent>
                                  {itemOptions.map((item) => {
                                    const outOfStock = item.quantity <= 0;
                                    return (
                                      <SelectItem
                                        key={item.id}
                                        value={item.id}
                                        disabled={outOfStock}
                                      >
                                        {item.name}
                                        {outOfStock ? ' (Out of stock)' : ''}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1 flex flex-col gap-1">
                              {(usage.category === 'fuel' || usage.category === 'diesel') && (
                                <>
                                  <label className="text-[11px] text-muted-foreground">Containers</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="fv-input h-8 text-xs"
                                    value={usage.quantity}
                                    onChange={(e) =>
                                      setLogInputs((prev) =>
                                        prev.map((u) =>
                                          u.id === usage.id ? { ...u, quantity: e.target.value } : u,
                                        ),
                                      )
                                    }
                                    placeholder="e.g. 2, 0.5, 1/2"
                                  />
                                  <label className="text-[11px] text-muted-foreground">Litres (optional)</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="fv-input h-8 text-xs"
                                    value={usage.litres ?? ''}
                                    onChange={(e) =>
                                      setLogInputs((prev) =>
                                        prev.map((u) =>
                                          u.id === usage.id ? { ...u, litres: e.target.value } : u,
                                        ),
                                      )
                                    }
                                    placeholder="e.g. 20"
                                  />
                                </>
                              )}
                              {usage.category === 'fertilizer' && (
                                <>
                                  <label className="text-[11px] text-muted-foreground">Bags</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="fv-input h-8 text-xs"
                                    value={usage.quantity}
                                    onChange={(e) =>
                                      setLogInputs((prev) =>
                                        prev.map((u) =>
                                          u.id === usage.id ? { ...u, quantity: e.target.value } : u,
                                        ),
                                      )
                                    }
                                    placeholder="e.g. 2, 0.5, 1/2"
                                  />
                                  <label className="text-[11px] text-muted-foreground">Kgs (optional)</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="fv-input h-8 text-xs"
                                    value={usage.kgs ?? ''}
                                    onChange={(e) =>
                                      setLogInputs((prev) =>
                                        prev.map((u) =>
                                          u.id === usage.id ? { ...u, kgs: e.target.value } : u,
                                        ),
                                      )
                                    }
                                    placeholder="e.g. 50"
                                  />
                                </>
                              )}
                              {(usage.category === 'chemical' || usage.category === 'materials') && (
                                <>
                                  <label className="text-[11px] text-muted-foreground">
                                    {selectedItem?.packagingType === 'box'
                                      ? 'Units (items)'
                                      : 'Units'}
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="fv-input h-8 text-xs"
                                    value={usage.quantity}
                                    onChange={(e) =>
                                      setLogInputs((prev) =>
                                        prev.map((u) =>
                                          u.id === usage.id ? { ...u, quantity: e.target.value } : u,
                                        ),
                                      )
                                    }
                                    placeholder="e.g. 2, 0.5, 1/2"
                                  />
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setLogInputs((prev) => prev.filter((u) => u.id !== usage.id))}
                            className="text-destructive text-xs self-end sm:self-center px-2 py-1"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        const preferred =
                          logWorkType === 'Spraying' ? 'chemical'
                          : logWorkType === 'Fertilizer application' ? 'fertilizer'
                          : logWorkType === 'Tying of crops' ? logTyingUsedType
                          : 'fertilizer';
                        const defaultCategory = inventoryCategoriesFromStock.includes(preferred as InventoryCategory)
                          ? (preferred as InventoryCategory)
                          : (inventoryCategoriesFromStock[0] ?? preferred as InventoryCategory);
                        setLogInputs([
                          ...logInputs,
                          {
                            id: Date.now().toString(),
                            category: defaultCategory,
                            itemId: '',
                            quantity: '',
                            litres: '',
                            kgs: '',
                          },
                        ]);
                      }}
                      className="text-xs text-primary"
                    >
                      Add {logWorkType === 'Spraying' ? 'chemical' : logWorkType === 'Fertilizer application' ? 'fertilizer' : 'input'}
                    </button>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
                <textarea
                  className="fv-input w-full min-h-[80px]"
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setLogDailyWorkOpen(false)}
                  disabled={savingDailyWork}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitDailyWork}
                  disabled={savingDailyWork || !logWorkType || !logNumberOfPeople || !logDate}
                >
                  {savingDailyWork ? 'Saving...' : 'Log Work'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add new work type (custom category) */}
      <Dialog open={addCustomWorkTypeOpen} onOpenChange={setAddCustomWorkTypeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add new category</DialogTitle>
            <DialogDescription>
              Add a custom work category. It will appear in the Work Type list for everyone in your company.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="text"
              className="fv-input w-full"
              value={customWorkTypeName}
              onChange={(e) => setCustomWorkTypeName(e.target.value)}
              placeholder="e.g. Pruning, Staking"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddCustomWorkTypeOpen(false)}>Cancel</Button>
              <Button
                disabled={!customWorkTypeName.trim() || savingCustomWorkType}
                onClick={async () => {
                  const name = customWorkTypeName.trim();
                  if (!name || !user?.companyId) return;
                  setSavingCustomWorkType(true);
                  try {
                    const existing = (company as { customWorkTypes?: string[] } | undefined)?.customWorkTypes ?? [];
                    if (existing.includes(name)) {
                      setLogWorkType(name);
                      setAddCustomWorkTypeOpen(false);
                      return;
                    }
                    await updateCompany(user.companyId, { customWorkTypes: [...existing, name] });
                    queryClient.invalidateQueries({ queryKey: ['company', user.companyId] });
                    setLogWorkType(name);
                    setAddCustomWorkTypeOpen(false);
                    setCustomWorkTypeName('');
                  } finally {
                    setSavingCustomWorkType(false);
                  }
                }}
              >
                {savingCustomWorkType ? 'Adding...' : 'Add'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stat Card Drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[80vh]" resizable defaultHeightVh={50}>
          <DrawerHeader>
            <DrawerTitle>
              {drawerType === 'total' && 'All Work Logs'}
              {drawerType === 'paid' && 'Paid Work Logs'}
              {drawerType === 'unpaid' && 'Unpaid Work Logs'}
              {drawerType === 'amount' && 'All Work Logs by Amount'}
            </DrawerTitle>
            <DrawerDescription>
              {drawerType === 'total' && `Showing all ${stats.totalLogs} work logs`}
              {drawerType === 'paid' && `Showing ${stats.paidLogs} paid work logs`}
              {drawerType === 'unpaid' && `Showing ${stats.unpaidLogs} unpaid work logs`}
              {drawerType === 'amount' && `Total labour: ${formatCurrency(stats.totalLabour)}`}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto">
            <div className="space-y-2">
              {(() => {
                let drawerLogs = managerWorkLogs;
                if (drawerType === 'paid') {
                  drawerLogs = drawerLogs.filter((log) => log.paid);
                } else if (drawerType === 'unpaid') {
                  drawerLogs = drawerLogs.filter((log) => !log.paid);
                }
                drawerLogs = drawerLogs.sort((a, b) => {
                  const dateA = toDate(a.date);
                  const dateB = toDate(b.date);
                  return dateB.getTime() - dateA.getTime();
                });

                if (drawerLogs.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No work logs found</p>
                    </div>
                  );
                }

                return drawerLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 border rounded-lg hover:bg-muted/30 cursor-pointer"
                    onClick={() => {
                      setSelectedLog(log);
                      setViewOpen(true);
                      setDrawerOpen(false);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{log.workCategory}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatLogDate(log.date)} • {log.stageName}
                        </p>
                        {showPeopleSection && (
                          <p className="text-sm mt-1">
                            {log.numberOfPeople} people
                            {log.ratePerPerson && ` @ KES ${log.ratePerPerson.toLocaleString()}`}
                          </p>
                        )}
                        {log.totalPrice && (
                          <p className="text-sm mt-1 font-semibold text-foreground">
                            Total: KES {log.totalPrice.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <Badge
                        className={cn(
                          'capitalize shrink-0',
                          log.paid
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800',
                        )}
                      >
                        {log.paid ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

    </div>
  );
}