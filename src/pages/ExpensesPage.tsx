import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Download, MoreHorizontal, Calendar as CalendarIcon, Receipt } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { ExpensesBarChart } from '@/components/dashboard/ExpensesBarChart';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { Expense, ExpenseCategory, CropStage, WorkLog } from '@/types';
import { BROKER_EXPENSE_CATEGORIES } from '@/types';
import { getExpenseCategoryLabel } from '@/lib/utils';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient } from '@tanstack/react-query';
import { Wrench, CheckCircle, Clock } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toDate, formatDate } from '@/lib/dateUtils';

export default function ExpensesPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allExpenses = [], isLoading } = useCollection<Expense>('expenses', 'expenses');
  const { data: allStages = [] } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allWorkLogs = [] } = useCollection<WorkLog>('workLogs', 'workLogs');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date } | undefined>();

  // Filter expenses based on user role
  // Brokers should only see expenses they incurred (related to their sales activities)
  const isBroker = useMemo(() => {
    if (!user) return false;
    if (user.role === 'broker') return true;
    if (user.role === 'employee') {
      // Check if employee role is broker-related
      const employeeRole = (user as any).employeeRole;
      return employeeRole === 'sales-broker' || employeeRole === 'broker';
    }
    return false;
  }, [user]);

  const expenses = useMemo(() => {
    let filtered = activeProject
      ? allExpenses.filter(e => e.projectId === activeProject.id)
      : allExpenses;

    // For brokers, only show expenses they paid for (related to their sales work)
    if (isBroker && user) {
      filtered = filtered.filter(e => e.paidBy === user.id);
    }

    return filtered;
  }, [allExpenses, activeProject, isBroker, user]);

  const filteredExpenses = expenses.filter((e) => {
    const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchesSearch =
      !search ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase());
    const d = toDate(e.date);
    const inRange =
      !dateRange ||
      (!dateRange.from && !dateRange.to) ||
      (( !dateRange.from || d >= dateRange.from ) && ( !dateRange.to || d <= dateRange.to ));
    return matchesCategory && matchesSearch && inRange;
  });

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Broker expense categories (for admin view)
  const brokerCategoryValues = useMemo(
    () => new Set(BROKER_EXPENSE_CATEGORIES.map((c) => c.value)),
    [],
  );
  const brokerExpenses = useMemo(
    () => expenses.filter((e) => brokerCategoryValues.has(e.category as ExpenseCategory)),
    [expenses, brokerCategoryValues],
  );
  const brokerExpensesTotal = brokerExpenses.reduce((sum, e) => sum + e.amount, 0);

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      labour: 'bg-fv-success/20 text-fv-success',
      fertilizer: 'bg-fv-gold-soft text-fv-olive',
      chemical: 'bg-fv-warning/20 text-fv-warning',
      fuel: 'bg-fv-info/20 text-fv-info',
      other: 'bg-muted text-muted-foreground',
    };
    return colors[category] || 'bg-muted text-muted-foreground';
  };

  const [addOpen, setAddOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('labour');
  const [saving, setSaving] = useState(false);
  const [labourExpensesOpen, setLabourExpensesOpen] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  // Get unpaid work logs for the active project
  const unpaidWorkLogs = useMemo(() => {
    if (!activeProject) return [];
    return allWorkLogs.filter(
      w => w.projectId === activeProject.id && 
      w.companyId === activeProject.companyId &&
      !w.paid &&
      w.totalPrice && w.totalPrice > 0
    ).sort((a, b) => {
      const dateA = toDate(a.date);
      const dateB = toDate(b.date);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });
  }, [allWorkLogs, activeProject]);

  const currentStage = useMemo(() => {
    if (!activeProject) return null;
    const stages = allStages.filter(
      (s) =>
        s.projectId === activeProject.id &&
        s.companyId === activeProject.companyId &&
        s.cropType === activeProject.cropType,
    );
    if (!stages.length) return null;
    const today = new Date();
    const inProgress = stages.find((s) => {
      const start = s.startDate ? new Date(s.startDate) : undefined;
      const end = s.endDate ? new Date(s.endDate) : undefined;
      if (!start || !end) return false;
      return start <= today && today <= end;
    });
    if (inProgress) return { stageIndex: inProgress.stageIndex, stageName: inProgress.stageName };
    const sorted = [...stages].sort((a, b) => a.stageIndex - b.stageIndex);
    return { stageIndex: sorted[0].stageIndex, stageName: sorted[0].stageName };
  }, [allStages, activeProject]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'expenses'), {
        description,
        amount: Number(amount || '0'),
        category,
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        date: serverTimestamp(),
        stageIndex: currentStage?.stageIndex,
        stageName: currentStage?.stageName,
        synced: false,
        paid: false,
        createdAt: serverTimestamp(),
      });
      
      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
      
      setAddOpen(false);
      setDescription('');
      setAmount('');
      setCategory('labour');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkWorkLogAsPaid = async (log: WorkLog) => {
    if (!activeProject || !user || !log.id || !log.totalPrice) return;
    setMarkingPaid(log.id);
    try {
      const batch = writeBatch(db);
      
      // Update work log to paid
      const workLogRef = doc(db, 'workLogs', log.id);
      batch.update(workLogRef, {
        paid: true,
        paidAt: serverTimestamp(),
        paidBy: user.id,
        paidByName: user.name,
      });

      // Create expense entry
      const expenseRef = doc(collection(db, 'expenses'));
      batch.set(expenseRef, {
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        cropType: activeProject.cropType,
        category: 'labour' as ExpenseCategory,
        description: `Labour - ${log.workCategory} on ${formatDate(log.date)}`,
        amount: log.totalPrice,
        date: log.date,
        stageIndex: log.stageIndex,
        stageName: log.stageName,
        syncedFromWorkLogId: log.id,
        synced: true,
        paid: true,
        paidAt: serverTimestamp(),
        paidBy: user.id,
        paidByName: user.name,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
      
      // Close dialog if no more unpaid work logs
      // Note: This will happen automatically when the query refetches and unpaidWorkLogs updates
    } finally {
      setMarkingPaid(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Tracking expenses for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'Track and manage all expenses'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isBroker && (
            <a
              href="#broker-expenses"
              className="fv-btn fv-btn--secondary flex items-center gap-2"
            >
              <Receipt className="h-4 w-4" />
              Broker expenses
            </a>
          )}
          {unpaidWorkLogs.length > 0 && (
            <>
              <button 
                className="fv-btn fv-btn--primary"
                onClick={() => setLabourExpensesOpen(true)}
              >
                <Wrench className="h-4 w-4" />
                Labour Expenses ({unpaidWorkLogs.length})
              </button>
              <Dialog open={labourExpensesOpen} onOpenChange={setLabourExpensesOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Labour Expenses - Unpaid Work Logs</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    Mark work logs as paid to automatically create expense entries.
                  </p>
                </DialogHeader>
                {unpaidWorkLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">All work logs have been paid.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                  {unpaidWorkLogs.map((log) => (
                    <div
                      key={log.id}
                      className="fv-card p-4 border"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-foreground">{log.workCategory}</h4>
                            <span className="fv-badge fv-badge--warning text-xs">Unpaid</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground mb-2">
                            <div>
                              <span className="font-medium">Date:</span> {formatDate(log.date)}
                            </div>
                            <div>
                              <span className="font-medium">Stage:</span> {log.stageName}
                            </div>
                            <div>
                              <span className="font-medium">People:</span> {log.numberOfPeople}
                            </div>
                            <div>
                              <span className="font-medium">Rate:</span> {log.ratePerPerson ? `KES ${log.ratePerPerson.toLocaleString()}` : 'N/A'}
                            </div>
                          </div>
                          {log.totalPrice && (
                            <div className="mt-2">
                              <span className="text-lg font-bold text-primary">
                                Total: KES {log.totalPrice.toLocaleString()}
                              </span>
                            </div>
                          )}
                          {log.notes && (
                            <p className="text-sm text-muted-foreground mt-2">{log.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleMarkWorkLogAsPaid(log)}
                          disabled={markingPaid === log.id}
                          className="fv-btn fv-btn--primary shrink-0"
                        >
                          {markingPaid === log.id ? 'Marking...' : 'Mark as Paid'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </DialogContent>
            </Dialog>
          </>
          )}
          <button className="fv-btn fv-btn--secondary">
            <Download className="h-4 w-4" />
            Export
          </button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button className="fv-btn fv-btn--primary">
                <Plus className="h-4 w-4" />
                Add Expense
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              {!activeProject ? (
                <p className="text-sm text-muted-foreground">
                  Select a project first to add an expense.
                </p>
              ) : (
                <form onSubmit={handleAddExpense} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <input
                      className="fv-input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Amount (KES)</label>
                    <input
                      type="number"
                      min={0}
                      className="fv-input"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Category</label>
                    <Select value={category} onValueChange={(val) => setCategory(val as ExpenseCategory)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="labour">Labour</SelectItem>
                        <SelectItem value="fertilizer">Fertilizer</SelectItem>
                        <SelectItem value="chemical">Chemical</SelectItem>
                        <SelectItem value="fuel">Fuel</SelectItem>
                        <SelectItem value="other">Custom / Not listed</SelectItem>
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
                      {saving ? 'Saving…' : 'Save Expense'}
                    </button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards + Filters */}
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <SimpleStatCard
            title="Total Expenses"
            value={formatCurrency(totalExpenses)}
            subtitle={`From ${expenses.length} transactions`}
            layout="vertical"
          />
          <SimpleStatCard
            title="Filtered Total"
            value={formatCurrency(totalExpenses)}
            subtitle="Based on applied filters"
            layout="vertical"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search expenses..."
              className="fv-input pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Seeds">Seeds</SelectItem>
              <SelectItem value="Fertilizers">Fertilizers</SelectItem>
              <SelectItem value="Labor">Labor</SelectItem>
              <SelectItem value="Pesticides">Pesticides</SelectItem>
              <SelectItem value="Irrigation">Irrigation</SelectItem>
              <SelectItem value="Equipment">Equipment</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <button className="fv-btn fv-btn--secondary flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Date range
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Pie + Bar charts side by side (no empty space) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ExpensesPieChart
            data={Object.entries(
              filteredExpenses.reduce<Record<string, number>>((acc, e) => {
                acc[e.category] = (acc[e.category] || 0) + e.amount;
                return acc;
              }, {}),
            ).map(([category, amount]) => ({ category, amount }))}
          />
          <ExpensesBarChart
            data={Object.entries(
              filteredExpenses.reduce<Record<string, number>>((acc, e) => {
                acc[e.category] = (acc[e.category] || 0) + e.amount;
                return acc;
              }, {}),
            ).map(([category, amount]) => ({ category, amount }))}
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="fv-card">
        <h3 className="text-lg font-semibold mb-6">Recent Expenses</h3>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading expenses…</p>
        )}
        
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <span className="font-medium text-foreground">{expense.description}</span>
                  </td>
                  <td>
                    <span className={cn('fv-badge', getCategoryColor(expense.category))}>
                      {expense.category}
                    </span>
                  </td>
                  <td className="font-medium">{formatCurrency(expense.amount)}</td>
                  <td className="text-muted-foreground">
                    {formatDate(expense.date)}
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => {
                            const msg = `${expense.description}\nCategory: ${expense.category}\nAmount: ${formatCurrency(expense.amount)}\nDate: ${formatDate(expense.date)}`;
                            alert(msg);
                          }}
                        >
                          View details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {filteredExpenses.map((expense) => (
            <div key={expense.id} className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-foreground">{expense.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(expense.date)}
                  </p>
                </div>
                <span className="font-semibold">{formatCurrency(expense.amount)}</span>
              </div>
              <span className={cn('fv-badge', getCategoryColor(expense.category))}>
                {expense.category}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Broker expenses (visible to admin/manager, not to brokers) */}
      {!isBroker && (
        <div id="broker-expenses" className="fv-card scroll-mt-6">
          <h3 className="text-lg font-semibold mb-4">Broker expenses</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Market-related expenses (Crates Space, Watchman, Ropes, Labour, etc.) recorded by brokers.
          </p>
          <div className="mb-4">
            <SimpleStatCard
              title="Total broker expenses"
              value={formatCurrency(brokerExpensesTotal)}
              subtitle={`${brokerExpenses.length} entries`}
              layout="vertical"
            />
          </div>
          {brokerExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No broker expenses recorded yet.</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="fv-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brokerExpenses.map((e) => (
                      <tr key={e.id}>
                        <td className="text-muted-foreground">{formatDate(e.date)}</td>
                        <td>{getExpenseCategoryLabel(e.category)}</td>
                        <td>{e.description || '—'}</td>
                        <td className="font-semibold">{formatCurrency(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-3">
                {brokerExpenses.map((e) => (
                  <div key={e.id} className="p-4 bg-muted/30 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{getExpenseCategoryLabel(e.category)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
                        {e.description && <p className="text-sm mt-1">{e.description}</p>}
                      </div>
                      <span className="font-semibold">{formatCurrency(e.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
