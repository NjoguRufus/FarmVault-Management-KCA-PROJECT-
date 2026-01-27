import React, { useMemo, useState } from 'react';
import { Plus, Search, Wrench, MoreHorizontal, CheckCircle, Clock, CalendarDays } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { WorkLog, Employee, CropStage, InventoryItem, InventoryCategory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentStageForProject } from '@/services/stageService';
import { syncTodaysLabourExpenses } from '@/services/workLogService';
import { recordInventoryUsage } from '@/services/inventoryService';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function OperationsPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const { data: allWorkLogs = [], isLoading } = useCollection<WorkLog>('workLogs', 'workLogs');
  const { data: allEmployees = [] } = useCollection<Employee>('employees', 'employees');
  const { data: allStages = [] } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allInventoryItems = [] } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');

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

  const getAssigneeName = (employeeId?: string) => {
    if (!employeeId) return 'Unassigned';
    const employee = allEmployees.find(e => e.id === employeeId);
    return employee?.name || 'Unknown';
  };

  const [addOpen, setAddOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [workCategory, setWorkCategory] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState('');
  const [ratePerPerson, setRatePerPerson] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [chemicalItemId, setChemicalItemId] = useState('');
  const [chemicalQuantity, setChemicalQuantity] = useState('');
  const [chemicalDrumsSprayed, setChemicalDrumsSprayed] = useState('');
  const [fertilizerItemId, setFertilizerItemId] = useState('');
  const [fertilizerQuantity, setFertilizerQuantity] = useState('');
  const [fuelItemId, setFuelItemId] = useState('');
  const [fuelQuantity, setFuelQuantity] = useState('');

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

  const handleAddWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    if (!date || !currentStage) return;
    setSaving(true);
    try {
      const workLogRef = await addDoc(collection(db, 'workLogs'), {
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        cropType: activeProject.cropType,
        stageIndex: currentStage.stageIndex,
        stageName: currentStage.stageName,
        date,
        workCategory,
        numberOfPeople: Number(numberOfPeople || '0'),
        ratePerPerson: ratePerPerson ? Number(ratePerPerson) : undefined,
        notes: notes || undefined,
        managerId: user?.id,
        adminName: user?.name,
        paid: false,
        createdAt: serverTimestamp(),
      });
      const workLogId = workLogRef.id;

      const usageDate = date instanceof Date ? date : new Date(date);

      const recordIfNeeded = async (
        kind: 'chemical' | 'fertilizer' | 'diesel',
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
          category: kind as InventoryCategory,
          quantity: quantityVal,
          unit: item.unit,
          source: 'workLog',
          workLogId,
          stageIndex: currentStage.stageIndex,
          stageName: currentStage.stageName,
          date: usageDate,
        });
      };

      await Promise.all([
        recordIfNeeded('chemical', chemicalItemId, chemicalQuantity, {
          drumsSprayed: Number(chemicalDrumsSprayed || '0') || undefined,
        }),
        recordIfNeeded('fertilizer', fertilizerItemId, fertilizerQuantity),
        recordIfNeeded('diesel', fuelItemId, fuelQuantity),
      ]);

      setAddOpen(false);
      setWorkCategory('');
      setNumberOfPeople('');
      setRatePerPerson('');
      setNotes('');
      setChemicalItemId('');
      setChemicalQuantity('');
      setChemicalDrumsSprayed('');
      setFertilizerItemId('');
      setFertilizerQuantity('');
      setFuelItemId('');
      setFuelQuantity('');
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
    } finally {
      setSyncing(false);
    }
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
            disabled={!activeProject || syncing}
            onClick={handleSyncTodaysLabour}
          >
            {syncing ? 'Syncing…' : "Sync Today's Labour"}
          </button>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <button className="fv-btn fv-btn--primary" disabled={!activeProject}>
              <Plus className="h-4 w-4" />
              Log Daily Work
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Daily Work</DialogTitle>
            </DialogHeader>
            {!activeProject ? (
              <p className="text-sm text-muted-foreground">
                Select a project first to log work.
              </p>
            ) : (
              <form onSubmit={handleAddWorkLog} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Date</label>
                  <input
                    type="date"
                    className="fv-input"
                    value={date ? new Date(date).toISOString().slice(0, 10) : ''}
                    onChange={(e) => setDate(e.target.value ? new Date(e.target.value) : undefined)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Work type</label>
                  <input
                    className="fv-input"
                    value={workCategory}
                    onChange={(e) => setWorkCategory(e.target.value)}
                    required
                    placeholder="Spraying, Fertilizer application, Watering..."
                  />
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Inputs used (optional)
                  </p>

                  {/* Chemicals */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Chemical</label>
                      <select
                        className="fv-select w-full text-sm"
                        value={chemicalItemId}
                        onChange={(e) => setChemicalItemId(e.target.value)}
                      >
                        <option value="">None</option>
                        {chemicalItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Qty</label>
                      <input
                        type="number"
                        min={0}
                        className="fv-input text-sm"
                        value={chemicalQuantity}
                        onChange={(e) => setChemicalQuantity(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Drums sprayed</label>
                      <input
                        type="number"
                        min={0}
                        className="fv-input text-sm"
                        value={chemicalDrumsSprayed}
                        onChange={(e) => setChemicalDrumsSprayed(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Fertilizer */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Fertilizer</label>
                      <select
                        className="fv-select w-full text-sm"
                        value={fertilizerItemId}
                        onChange={(e) => setFertilizerItemId(e.target.value)}
                      >
                        <option value="">None</option>
                        {fertilizerItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Qty</label>
                      <input
                        type="number"
                        min={0}
                        className="fv-input text-sm"
                        value={fertilizerQuantity}
                        onChange={(e) => setFertilizerQuantity(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Fuel */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Fuel (diesel)</label>
                      <select
                        className="fv-select w-full text-sm"
                        value={fuelItemId}
                        onChange={(e) => setFuelItemId(e.target.value)}
                      >
                        <option value="">None</option>
                        {fuelItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Qty</label>
                      <input
                        type="number"
                        min={0}
                        className="fv-input text-sm"
                        value={fuelQuantity}
                        onChange={(e) => setFuelQuantity(e.target.value)}
                      />
                    </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-success/10">
            <CheckCircle className="h-6 w-6 text-fv-success" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Paid logs</p>
            <p className="text-2xl font-bold">{workLogs.filter((w) => w.paid).length}</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-warning/10">
            <Clock className="h-6 w-6 text-fv-warning" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Unpaid logs</p>
            <p className="text-2xl font-bold">{workLogs.filter((w) => !w.paid).length}</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-info/10">
            <CalendarDays className="h-6 w-6 text-fv-info" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total logs</p>
            <p className="text-2xl font-bold">{workLogs.length}</p>
          </div>
        </div>
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

      {/* Work Logs List */}
      <div className="fv-card">
        <div className="space-y-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading work logs…</p>
          )}
          {workLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="shrink-0 mt-1">
                {getPaidIcon(log.paid)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{log.workCategory}</h3>
                      <span className={cn('fv-badge capitalize text-xs', getPaidBadge(log.paid))}>
                        {log.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {log.numberOfPeople} people
                      {log.ratePerPerson ? ` @ KES ${log.ratePerPerson.toLocaleString()}` : ''}
                    </p>
                    {log.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {log.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    {new Date(log.date as any).toLocaleDateString('en-KE', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span>•</span>
                  <span>Stage: {log.stageName}</span>
                  <span>•</span>
                  <span>Manager: {getAssigneeName(log.managerId)}</span>
                </div>
              </div>
              <button className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ))}

          {workLogs.length === 0 && (
            <div className="text-center py-12">
              <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Work Logged</h3>
              <p className="text-sm text-muted-foreground">
                Click "Log Daily Work" to capture today&apos;s activities.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
