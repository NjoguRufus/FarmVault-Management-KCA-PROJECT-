import React, { useState } from 'react';
import { Receipt, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPlatformExpenses,
  addPlatformExpense,
  updatePlatformExpense,
  deletePlatformExpense,
} from '@/services/platformExpenseService';

const CATEGORIES = [
  'Infrastructure',
  'Marketing',
  'Salaries',
  'Software',
  'Hosting',
  'Support',
  'Other',
];

function formatKESFull(n: number): string {
  return `KES ${Number(n).toLocaleString()}`;
}

export default function AdminExpensesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({ category: 'Infrastructure', amount: '', date: new Date().toISOString().slice(0, 10), description: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['platform-expenses'],
    queryFn: getPlatformExpenses,
  });

  const resetForm = () => {
    setForm({ category: 'Infrastructure', amount: '', date: new Date().toISOString().slice(0, 10), description: '' });
    setEditingId(null);
    setIsAdding(false);
  };

  const handleSave = async () => {
    const amount = Number(form.amount);
    if (!form.date || isNaN(amount) || amount < 0) return;
    setSaving(true);
    try {
      if (editingId) {
        await updatePlatformExpense(editingId, {
          category: form.category,
          amount,
          date: form.date,
          description: form.description || undefined,
        });
      } else {
        await addPlatformExpense({
          category: form.category,
          amount,
          date: form.date,
          description: form.description || undefined,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['platform-expenses'] });
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    setDeletingId(id);
    try {
      await deletePlatformExpense(id);
      await queryClient.invalidateQueries({ queryKey: ['platform-expenses'] });
      if (editingId === id) resetForm();
    } finally {
      setDeletingId(null);
    }
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6 animate-fade-in w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            FarmVault Expenses
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform operational expenses. Used in the Finances dashboard.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setIsAdding(true); setEditingId(null); setForm({ category: 'Infrastructure', amount: '', date: new Date().toISOString().slice(0, 10), description: '' }); }}
          className="fv-btn fv-btn--primary"
        >
          <Plus className="h-4 w-4" />
          Add expense
        </button>
      </div>

      {(isAdding || editingId) && (
        <div className="fv-card p-4 space-y-4">
          <h3 className="font-semibold">{editingId ? 'Edit expense' : 'New expense'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="fv-input w-full"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Amount (KES)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="fv-input w-full"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="fv-input w-full"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="fv-input w-full"
              placeholder="e.g. AWS bill Jan 2025"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleSave} disabled={saving} className="fv-btn fv-btn--primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
            <button type="button" onClick={resetForm} className="fv-btn fv-btn--secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="fv-card">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="font-semibold">All expenses</h3>
          <p className="text-sm text-muted-foreground">Total: {formatKESFull(total)}</p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No expenses recorded. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{e.category}</td>
                    <td className="max-w-[200px] truncate">{e.description || '—'}</td>
                    <td className="text-right font-medium">{formatKESFull(e.amount)}</td>
                    <td className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => { setEditingId(e.id); setIsAdding(false); setForm({ category: e.category, amount: String(e.amount), date: e.date, description: e.description ?? '' }); }}
                        className="p-1.5 text-muted-foreground hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(e.id)}
                        disabled={deletingId === e.id}
                        className="p-1.5 text-muted-foreground hover:text-destructive ml-1"
                        aria-label="Delete"
                      >
                        {deletingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
