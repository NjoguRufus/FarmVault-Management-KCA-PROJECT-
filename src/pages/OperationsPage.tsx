import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Wrench, MoreHorizontal, CheckCircle, Clock, CalendarDays, X } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { WorkLog, Employee, CropStage, InventoryItem, InventoryCategory, InventoryCategoryItem, User, Expense, ExpenseCategory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentStageForProject } from '@/services/stageService';
import { syncTodaysLabourExpenses } from '@/services/workLogService';
import { recordInventoryUsage } from '@/services/inventoryService';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient } from '@tanstack/react-query';
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
  const { data: allCategories = [] } = useCollection<InventoryCategoryItem>(
    'inventoryCategories',
    'inventoryCategories',
  );
  
  // Get categories for the company
  const categories = useMemo(() => {
    if (!user?.companyId) return [];
    return allCategories.filter((cat) => cat.companyId === user.companyId);
  }, [allCategories, user?.companyId]);
  
  // Default categories if none exist
  const defaultCategories = ['fertilizer', 'chemical', 'diesel', 'materials'];
  const availableCategories = useMemo(() => {
    const categoryNames = categories.map((cat) => cat.name.toLowerCase());
    const defaults = defaultCategories.filter((def) => !categoryNames.includes(def));
    return [
      ...categories.map((cat) => cat.name),
      ...defaults,
    ].sort();
  }, [categories]);

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

  const [addOpen, setAddOpen] = useState(false);
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

  const WORK_TYPES = ['Spraying', 'Fertilizer application', 'Watering', 'Weeding', 'Other'];
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);

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

  // Get managers (users with manager or company-admin role, or employees with operations-manager role)
  const managers = useMemo(() => {
    if (!activeProject) return [];
    const companyId = activeProject.companyId;
    
    // Get users who are managers or company-admins in this company
    const managerUsers = allUsers
      .filter(u => 
        u.companyId === companyId && 
        (u.role === 'manager' || u.role === 'company-admin')
      )
      .map(u => ({
        id: u.id,
        name: u.name,
        role: u.role,
        type: 'user' as const,
      }));
    
    // Get employees who are operations managers in this company
    const managerEmployees = companyEmployees
      .filter(e => e.role === 'operations-manager' || e.role.includes('manager'))
      .map(e => ({
        id: e.id,
        name: e.name,
        role: e.role,
        type: 'employee' as const,
      }));
    
    // Combine and deduplicate by id (prefer users over employees if same id)
    const allManagers = [...managerUsers, ...managerEmployees];
    const uniqueManagers = Array.from(
      new Map(allManagers.map(m => [m.id, m])).values()
    );
    
    // If current user is a manager/admin and not already in the list, add them
    if (user && (user.role === 'manager' || user.role === 'company-admin') && user.companyId === companyId) {
      const userExists = uniqueManagers.some(m => m.id === user.id);
      if (!userExists) {
        uniqueManagers.unshift({
          id: user.id,
          name: user.name,
          role: user.role,
          type: 'user' as const,
        });
      }
    }
    
    return uniqueManagers;
  }, [allUsers, companyEmployees, activeProject, user]);

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
    () => companyInventory.filter((i) => i.category === 'diesel'),
    [companyInventory],
  );

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
    return companyInventory.filter((i) => i.category === category);
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
        const quantityVal = Number(quantityStr || '0');
        if (!inventoryItemId || !quantityVal) return;
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

  const handleSyncTodaysLabour = async () => {
    if (!activeProject || !user) return;
    setSyncing(true);
    try {
      await syncTodaysLabourExpenses({
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        date: new Date(),
        paidByUserId: user.id,
        paidByName: user.name,
      });
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } finally {
      setSyncing(false);
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
          <button
            className="fv-btn fv-btn--secondary"
            disabled={syncing}
            onClick={handleSyncTodaysLabour}
          >
            {syncing ? 'Syncing…' : "Sync Today's Labour"}
          </button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button className="fv-btn fv-btn--primary">
                <Plus className="h-4 w-4" />
                Plan Today&apos;s Work
              </button>
            </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Plan Today&apos;s Work</DialogTitle>
            </DialogHeader>
            {!activeProject ? (
              <p className="text-sm text-muted-foreground">
                Select a project first to log work.
              </p>
            ) : projectStages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No stages found for this project. Please check the project stages.
              </p>
            ) : (
              <form onSubmit={handleAddWorkLog} className="space-y-4">
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
                    {!selectedManagerId && user && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Default: {user.name} (You)
                      </p>
                    )}
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
                    {date && (
                      <p className="text-xs text-muted-foreground">
                        {format(date, 'PPP')}
                      </p>
                    )}
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
                        {WORK_TYPES.map((wt) => (
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
                    {totalPrice > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 text-center">
                        {numberOfPeople} × {ratePerPerson || '0'} = {totalPrice.toLocaleString()}
                      </p>
                    )}
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

                {/* Input usage sections */}
                <div className="space-y-3 border-t pt-3 mt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Inputs used (optional)
                    </p>
                  </div>

                  {inputUsages.map((usage) => (
                    <div key={usage.id} className="flex flex-col sm:flex-row gap-2 p-3 border rounded-lg bg-muted/20">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Category</label>
                          <Select
                            value={usage.type}
                            onValueChange={(value) => updateInputUsage(usage.id, 'type', value as InventoryCategory)}
                          >
                            <SelectTrigger className="w-full text-sm h-9">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableCategories.map((cat) => (
                                <SelectItem key={cat} value={cat.toLowerCase()}>
                                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Item</label>
                          <Select
                            value={usage.itemId}
                            onValueChange={(value) => updateInputUsage(usage.id, 'itemId', value)}
                            disabled={!usage.type}
                          >
                            <SelectTrigger className="w-full text-sm h-9">
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              {getItemsForCategory(usage.type).length === 0 ? (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                  No {usage.type} items available
                                </div>
                              ) : (
                                getItemsForCategory(usage.type).map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.name} ({item.unit})
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Quantity</label>
                          <input
                            type="number"
                            min={0}
                            className="fv-input text-sm h-9"
                            value={usage.quantity}
                            onChange={(e) => updateInputUsage(usage.id, 'quantity', e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        {usage.type === 'chemical' && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-foreground">Drums sprayed</label>
                            <input
                              type="number"
                              min={0}
                              className="fv-input text-sm h-9"
                              value={usage.drumsSprayed || ''}
                              onChange={(e) => updateInputUsage(usage.id, 'drumsSprayed', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeInputUsage(usage.id)}
                        className="p-2 hover:bg-destructive/10 rounded-md transition-colors self-start sm:self-center"
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addInputUsage()}
                      className="fv-btn fv-btn--secondary text-xs py-1.5 px-3"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Input
                    </button>
                  </div>
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
                    {saving ? 'Saving…' : 'Save Work Log'}
                  </button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Paid logs"
          value={workLogs.filter((w) => w.paid).length}
          icon={CheckCircle}
          iconVariant="success"
        />
        <SimpleStatCard
          title="Unpaid logs"
          value={workLogs.filter((w) => !w.paid).length}
          icon={Clock}
          iconVariant="warning"
        />
        <SimpleStatCard
          title="Total logs"
          value={workLogs.length}
          icon={CalendarDays}
          iconVariant="info"
        />
      </div>

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

      {/* Work Logs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isLoading && (
          <div className="col-span-full fv-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading work logs…</p>
          </div>
        )}
        {workLogs.map((log) => (
          <div
            key={log.id}
            className={cn(
              "fv-card relative flex items-start gap-4 p-4 cursor-pointer overflow-hidden hover:shadow-md transition-shadow",
              log.paid && "after:content-['PAID'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-7xl after:font-bold after:text-red-500/15 after:rotate-[-35deg] after:pointer-events-none after:select-none after:z-0"
            )}
            onClick={() => handleViewLog(log)}
          >
              <div className="shrink-0 mt-1 relative z-10">
                {getPaidIcon(log.paid)}
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{log.workCategory}</h3>
                      <span className={cn('fv-badge capitalize text-xs', getPaidBadge(log.paid))}>
                        {log.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                    {log.adminName && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Planned by admin: {log.adminName}
                      </p>
                    )}
                    {log.managerSubmittedAt && (
                      <p className="text-[11px] text-fv-info mt-0.5">
                        Manager {log.managerName || getAssigneeName(log.managerId)} submitted values
                        {log.managerSubmissionStatus &&
                          ` • ${String(log.managerSubmissionStatus).toUpperCase()}`}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">
                      {log.numberOfPeople} people
                      {log.ratePerPerson ? ` @ KES ${log.ratePerPerson.toLocaleString()}` : ''}
                      {log.totalPrice && (
                        <span className="ml-2 font-semibold text-foreground">
                          • Total: KES {log.totalPrice.toLocaleString()}
                        </span>
                      )}
                    </p>
                    {log.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {log.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span>
                    {formatDate(log.date)}
                  </span>
                  <span>•</span>
                  <span>Stage: {log.stageName}</span>
                  {(log.employeeId || (log as any).employeeIds) && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-foreground">
                        Assigned: {(() => {
                          if ((log as any).employeeIds && Array.isArray((log as any).employeeIds)) {
                            const names = (log as any).employeeIds
                              .map((id: string) => allEmployees.find(e => e.id === id)?.name)
                              .filter(Boolean);
                            return names.length > 0 ? names.join(', ') : 'Multiple employees';
                          }
                          return getAssignedEmployeeName(log);
                        })()}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span>Manager: {getAssigneeName(log.managerId)}</span>
                </div>
                {log.managerSubmittedNumberOfPeople && (
                  <div className="mt-2 p-2 rounded-md bg-muted/40 border border-dashed border-muted-foreground/30 text-[11px] text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground text-xs">
                      Manager submission ({log.managerSubmissionStatus?.toUpperCase() || 'PENDING'})
                    </p>
                    <p>
                      People:{' '}
                      <span className="font-medium text-foreground">
                        {log.managerSubmittedNumberOfPeople}
                      </span>
                      {log.managerSubmittedRatePerPerson && (
                        <>
                          {' '}@ KES{' '}
                          <span className="font-medium text-foreground">
                            {log.managerSubmittedRatePerPerson.toLocaleString()}
                          </span>
                        </>
                      )}
                    </p>
                    {log.managerSubmittedTotalPrice && (
                      <p>
                        Total:{' '}
                        <span className="font-semibold text-foreground">
                          KES {log.managerSubmittedTotalPrice.toLocaleString()}
                        </span>
                      </p>
                    )}
                    {log.managerSubmittedInputsUsed && (
                      <p className="line-clamp-2">
                        Inputs: <span className="font-medium text-foreground">{log.managerSubmittedInputsUsed}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

        {workLogs.length === 0 && !isLoading && (
          <div className="col-span-full fv-card text-center py-12">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Work Logged</h3>
            <p className="text-sm text-muted-foreground">
              Click "Plan Today&apos;s Work" to capture today&apos;s activities.
            </p>
          </div>
        )}
      </div>

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
                        {[...new Set([...WORK_TYPES, workType].filter(Boolean))].map((wt) => (
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
