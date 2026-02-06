import React, { useMemo, useState } from 'react';
import { Plus, Receipt, List, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { useQueryClient } from '@tanstack/react-query';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Expense, ExpenseCategory, Harvest } from '@/types';
import { BROKER_EXPENSE_CATEGORIES } from '@/types';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { ExpensesBarChart } from '@/components/dashboard/ExpensesBarChart';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { getExpenseCategoryLabel } from '@/lib/utils';
import { toDate, formatDate } from '@/lib/dateUtils';
import {
  Dialog,
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

const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

export default function BrokerExpensesPage() {
  const { user } = useAuth();
  const brokerId = user?.id ?? '';
  const queryClient = useQueryClient();

  const { data: allHarvests = [] } = useCollection<Harvest>('harvests', 'harvests');
  const { data: allExpenses = [], isLoading } = useCollection<Expense>('expenses', 'expenses');

  const brokerHarvestIds = useMemo(() => {
    const harvests = allHarvests.filter(
      (h) => h.brokerId === brokerId && (h.destination ?? 'farm') === 'market',
    );
    return new Set(harvests.map((h) => h.id));
  }, [allHarvests, brokerId]);

  const brokerHarvests = useMemo(() => {
    return allHarvests.filter(
      (h) => h.brokerId === brokerId && (h.destination ?? 'farm') === 'market',
    );
  }, [allHarvests, brokerId]);

  const brokerExpenses = useMemo(() => {
    return allExpenses.filter(
      (e) => e.paidBy === brokerId || (e.harvestId && brokerHarvestIds.has(e.harvestId)),
    );
  }, [allExpenses, brokerId, brokerHarvestIds]);

  const totalExpenses = brokerExpenses.reduce((sum, e) => sum + e.amount, 0);

  const pieData = useMemo(() => {
    const byCategory: Record<string, number> = {};
    brokerExpenses.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    });
    return Object.entries(byCategory).map(([category, amount]) => ({
      category: getExpenseCategoryLabel(category),
      amount,
    }));
  }, [brokerExpenses]);

  const [addOpen, setAddOpen] = useState(false);
  const [expensesViewMode, setExpensesViewMode] = useState<'list' | 'card'>('list');
  const [category, setCategory] = useState<ExpenseCategory>('space');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [harvestId, setHarvestId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount || '0');
    if (num <= 0) return;
    const harvest = harvestId ? brokerHarvests.find((h) => h.id === harvestId) : null;
    setSaving(true);
    try {
      await addDoc(collection(db, 'expenses'), {
        category,
        description: description.trim() || getExpenseCategoryLabel(category),
        amount: num,
        date: serverTimestamp(),
        companyId: harvest?.companyId ?? user?.companyId ?? '',
        projectId: harvest?.projectId,
        cropType: harvest?.cropType,
        harvestId: harvestId || undefined,
        paidBy: brokerId,
        paidByName: user?.name,
        paid: true,
        paidAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setAddOpen(false);
      setCategory('space');
      setDescription('');
      setAmount('');
      setHarvestId('');
    } catch (err: any) {
      alert(err?.message ?? 'Failed to add expense.');
    } finally {
      setSaving(false);
    }
  };

  const sortedExpenses = useMemo(() => {
    return [...brokerExpenses].sort((a, b) => {
      const da = toDate(a.date);
      const db_ = toDate(b.date);
      if (!da || !db_) return 0;
      return db_.getTime() - da.getTime();
    });
  }, [brokerExpenses]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Expenses for your allocated harvests
          </p>
        </div>
        <button
          className="fv-btn fv-btn--primary flex items-center gap-2"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Market Expense
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Total Expenses"
          value={formatCurrency(totalExpenses)}
          icon={Receipt}
          iconVariant="warning"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Expense Entries"
          value={brokerExpenses.length}
          icon={Receipt}
          iconVariant="primary"
          layout="mobile-compact"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExpensesPieChart data={pieData} />
        <ExpensesBarChart data={pieData} />
      </div>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h3 className="text-lg font-semibold">My Market Expenses</h3>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              className={`p-2 transition-colors ${
                expensesViewMode === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 hover:bg-muted text-muted-foreground'
              }`}
              onClick={() => setExpensesViewMode('list')}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`p-2 transition-colors ${
                expensesViewMode === 'card'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 hover:bg-muted text-muted-foreground'
              }`}
              onClick={() => setExpensesViewMode('card')}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && sortedExpenses.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-border bg-card/60">
            No market expenses yet. Add an expense to see it here.
          </p>
        )}
        {!isLoading && sortedExpenses.length > 0 && expensesViewMode === 'list' && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card/60 overflow-hidden">
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
                {sortedExpenses.map((e) => (
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
        )}
        {!isLoading && sortedExpenses.length > 0 && expensesViewMode === 'card' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedExpenses.map((e) => (
              <div key={e.id} className="p-3 sm:p-4 rounded-xl border border-border bg-card/60">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-medium text-sm">{getExpenseCategoryLabel(e.category)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
                    {e.description && <p className="text-sm mt-1 line-clamp-2">{e.description}</p>}
                  </div>
                  <span className="font-semibold shrink-0">{formatCurrency(e.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {!isLoading && sortedExpenses.length > 0 && (
          <p className="text-sm font-medium mt-4">
            Total: {formatCurrency(totalExpenses)}
          </p>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Market Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as ExpenseCategory)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BROKER_EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description (optional)</label>
              <input
                type="text"
                className="fv-input w-full"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Falls back to category name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount (KES)</label>
              <input
                type="number"
                min={0}
                step={1}
                className="fv-input w-full"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Harvest (optional)</label>
              <Select
                value={harvestId || '__none__'}
                onValueChange={(v) => setHarvestId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select harvest" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {brokerHarvests.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {formatDate(h.date)} – {h.quantity} {h.unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <button type="button" className="fv-btn fv-btn--secondary" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className="fv-btn fv-btn--primary">
                {saving ? 'Saving…' : 'Add Expense'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
