import React, { useMemo, useState } from 'react';
import { Plus, Search, Download, MoreHorizontal, Calendar as CalendarIcon } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { Expense, ExpenseCategory, CropStage } from '@/types';
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

export default function ExpensesPage() {
  const { activeProject } = useProject();
  const { data: allExpenses = [], isLoading } = useCollection<Expense>('expenses', 'expenses');
  const { data: allStages = [] } = useCollection<CropStage>('projectStages', 'projectStages');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date } | undefined>();

  const expenses = activeProject
    ? allExpenses.filter(e => e.projectId === activeProject.id)
    : allExpenses;

  const filteredExpenses = expenses.filter((e) => {
    const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchesSearch =
      !search ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase());
    const d = new Date(e.date as any);
    const inRange =
      !dateRange ||
      (!dateRange.from && !dateRange.to) ||
      (( !dateRange.from || d >= dateRange.from ) && ( !dateRange.to || d <= dateRange.to ));
    return matchesCategory && matchesSearch && inRange;
  });

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

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
      setAddOpen(false);
      setDescription('');
      setAmount('');
      setCategory('labour');
    } finally {
      setSaving(false);
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
        <div className="flex gap-2">
          <button className="fv-btn fv-btn--secondary">
            <Download className="h-4 w-4" />
            Export
          </button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button className="fv-btn fv-btn--primary" disabled={!activeProject}>
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
                        <SelectItem value="other">Other</SelectItem>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="fv-card">
              <p className="text-sm text-muted-foreground mb-1">Total Expenses</p>
              <p className="text-3xl font-bold text-foreground">{formatCurrency(totalExpenses)}</p>
              <p className="text-xs text-muted-foreground mt-2">
                From {expenses.length} transactions
              </p>
            </div>
            <div className="fv-card">
              <p className="text-sm text-muted-foreground mb-1">Filtered Total</p>
              <p className="text-3xl font-bold text-foreground">{formatCurrency(totalExpenses)}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Based on applied filters
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mt-6">
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
        </div>

        <ExpensesPieChart
          data={Object.entries(
            filteredExpenses.reduce<Record<string, number>>((acc, e) => {
              acc[e.category] = (acc[e.category] || 0) + e.amount;
              return acc;
            }, {}),
          ).map(([category, amount]) => ({ category, amount }))}
        />
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
                    {new Date(expense.date).toLocaleDateString('en-KE', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td>
                    <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
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
                    {new Date(expense.date).toLocaleDateString('en-KE', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
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
    </div>
  );
}
