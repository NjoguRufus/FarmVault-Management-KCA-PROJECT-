import React, { useState } from 'react';
import { Plus, Search, TrendingUp, TrendingDown, MoreHorizontal } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { Harvest, Sale } from '@/types';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function HarvestSalesPage() {
  const { activeProject } = useProject();
  const { data: allHarvests = [], isLoading: loadingHarvests } = useCollection<Harvest>('harvests', 'harvests');
  const { data: allSales = [], isLoading: loadingSales } = useCollection<Sale>('sales', 'sales');

  const harvests = activeProject
    ? allHarvests.filter(h => h.projectId === activeProject.id)
    : allHarvests;

  const sales = activeProject
    ? allSales.filter(s => s.projectId === activeProject.id)
    : allSales;

  const totalHarvest = harvests.reduce((sum, h) => sum + h.quantity, 0);
  const totalSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  const getQualityBadge = (quality: string) => {
    const styles: Record<string, string> = {
      A: 'fv-badge--active',
      B: 'fv-badge--gold',
      C: 'fv-badge--warning',
    };
    return styles[quality] || 'bg-muted text-muted-foreground';
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'fv-badge--active',
      pending: 'fv-badge--warning',
      cancelled: 'bg-destructive/20 text-destructive',
    };
    return styles[status] || 'bg-muted text-muted-foreground';
  };

  const [harvestOpen, setHarvestOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [harvestQty, setHarvestQty] = useState('');
  const [harvestUnit, setHarvestUnit] = useState('kg');
  const [harvestQuality, setHarvestQuality] = useState<'A' | 'B' | 'C'>('A');
  const [harvestNotes, setHarvestNotes] = useState('');
  const [harvestSaving, setHarvestSaving] = useState(false);

  const [buyerName, setBuyerName] = useState('');
  const [saleQty, setSaleQty] = useState('');
  const [saleUnitPrice, setSaleUnitPrice] = useState('');
  const [saleSaving, setSaleSaving] = useState(false);

  const handleRecordHarvest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setHarvestSaving(true);
    try {
      await addDoc(collection(db, 'harvests'), {
        quantity: Number(harvestQty || '0'),
        unit: harvestUnit,
        quality: harvestQuality,
        notes: harvestNotes,
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      setHarvestOpen(false);
      setHarvestQty('');
      setHarvestUnit('kg');
      setHarvestQuality('A');
      setHarvestNotes('');
    } finally {
      setHarvestSaving(false);
    }
  };

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setSaleSaving(true);
    try {
      const quantity = Number(saleQty || '0');
      const unitPrice = Number(saleUnitPrice || '0');
      const totalAmount = quantity * unitPrice;

      await addDoc(collection(db, 'sales'), {
        buyerName,
        quantity,
        unitPrice,
        totalAmount,
        status: 'pending',
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      setSaleOpen(false);
      setBuyerName('');
      setSaleQty('');
      setSaleUnitPrice('');
    } finally {
      setSaleSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Harvest & Sales</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Tracking for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'Track harvests and manage sales'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={harvestOpen} onOpenChange={setHarvestOpen}>
            <DialogTrigger asChild>
              <button className="fv-btn fv-btn--secondary" disabled={!activeProject}>
                <Plus className="h-4 w-4" />
                Record Harvest
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Harvest</DialogTitle>
              </DialogHeader>
              {!activeProject ? (
                <p className="text-sm text-muted-foreground">
                  Select a project first to record a harvest.
                </p>
              ) : (
                <form onSubmit={handleRecordHarvest} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Quantity</label>
                      <input
                        type="number"
                        min={0}
                        className="fv-input"
                        value={harvestQty}
                        onChange={(e) => setHarvestQty(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Unit</label>
                      <input
                        className="fv-input"
                        value={harvestUnit}
                        onChange={(e) => setHarvestUnit(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Quality</label>
                    <select
                      className="fv-select w-full"
                      value={harvestQuality}
                      onChange={(e) =>
                        setHarvestQuality(e.target.value as 'A' | 'B' | 'C')
                      }
                    >
                      <option value="A">Grade A</option>
                      <option value="B">Grade B</option>
                      <option value="C">Grade C</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Notes</label>
                    <textarea
                      className="fv-input resize-none"
                      rows={3}
                      value={harvestNotes}
                      onChange={(e) => setHarvestNotes(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <button
                      type="button"
                      className="fv-btn fv-btn--secondary"
                      onClick={() => setHarvestOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={harvestSaving}
                      className="fv-btn fv-btn--primary"
                    >
                      {harvestSaving ? 'Saving…' : 'Save Harvest'}
                    </button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
            <DialogTrigger asChild>
              <button className="fv-btn fv-btn--primary" disabled={!activeProject}>
                <Plus className="h-4 w-4" />
                Add Sale
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Sale</DialogTitle>
              </DialogHeader>
              {!activeProject ? (
                <p className="text-sm text-muted-foreground">
                  Select a project first to add a sale.
                </p>
              ) : (
                <form onSubmit={handleAddSale} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Buyer name</label>
                    <input
                      className="fv-input"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Quantity (kg)</label>
                      <input
                        type="number"
                        min={0}
                        className="fv-input"
                        value={saleQty}
                        onChange={(e) => setSaleQty(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Unit price (KES/kg)</label>
                      <input
                        type="number"
                        min={0}
                        className="fv-input"
                        value={saleUnitPrice}
                        onChange={(e) => setSaleUnitPrice(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <button
                      type="button"
                      className="fv-btn fv-btn--secondary"
                      onClick={() => setSaleOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saleSaving}
                      className="fv-btn fv-btn--primary"
                    >
                      {saleSaving ? 'Saving…' : 'Save Sale'}
                    </button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="fv-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Total Harvest</p>
          </div>
          <p className="text-2xl font-bold">{totalHarvest.toLocaleString()} kg</p>
        </div>
        <div className="fv-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fv-gold-soft">
              <TrendingUp className="h-5 w-5 text-fv-olive" />
            </div>
            <p className="text-sm text-muted-foreground">Total Sales</p>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
        </div>
        <div className="fv-card">
          <p className="text-sm text-muted-foreground mb-1">Completed Sales</p>
          <p className="text-2xl font-bold">{sales.filter(s => s.status === 'completed').length}</p>
        </div>
        <div className="fv-card">
          <p className="text-sm text-muted-foreground mb-1">Pending Sales</p>
          <p className="text-2xl font-bold text-fv-warning">{sales.filter(s => s.status === 'pending').length}</p>
        </div>
      </div>

      {/* Harvests Section */}
      <div className="fv-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Harvest Records</h3>
        </div>

        {loadingHarvests && (
          <p className="text-sm text-muted-foreground mb-4">Loading harvests…</p>
        )}

        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Quantity</th>
                <th>Quality</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {harvests.map((harvest) => (
                <tr key={harvest.id}>
                  <td>
                    {new Date(harvest.date).toLocaleDateString('en-KE', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="font-medium">{harvest.quantity.toLocaleString()} {harvest.unit}</td>
                  <td>
                    <span className={cn('fv-badge', getQualityBadge(harvest.quality))}>
                      Grade {harvest.quality}
                    </span>
                  </td>
                  <td className="text-muted-foreground">{harvest.notes || '-'}</td>
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

        <div className="md:hidden space-y-3">
          {harvests.map((harvest) => (
            <div key={harvest.id} className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{harvest.quantity.toLocaleString()} {harvest.unit}</span>
                <span className={cn('fv-badge', getQualityBadge(harvest.quality))}>
                  Grade {harvest.quality}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {new Date(harvest.date).toLocaleDateString('en-KE', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Sales Section */}
      <div className="fv-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Sales Records</h3>
        </div>

        {loadingSales && (
          <p className="text-sm text-muted-foreground mb-4">Loading sales…</p>
        )}

        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="font-medium text-foreground">{sale.buyerName}</td>
                  <td>{sale.quantity.toLocaleString()} kg</td>
                  <td>{formatCurrency(sale.unitPrice)}/kg</td>
                  <td className="font-semibold">{formatCurrency(sale.totalAmount)}</td>
                  <td>
                    <span className={cn('fv-badge capitalize', getStatusBadge(sale.status))}>
                      {sale.status}
                    </span>
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

        <div className="md:hidden space-y-3">
          {sales.map((sale) => (
            <div key={sale.id} className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-foreground">{sale.buyerName}</span>
                <span className={cn('fv-badge capitalize', getStatusBadge(sale.status))}>
                  {sale.status}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{sale.quantity.toLocaleString()} kg</span>
                <span className="font-semibold">{formatCurrency(sale.totalAmount)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
