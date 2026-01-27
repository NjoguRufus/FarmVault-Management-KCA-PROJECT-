import React, { useState } from 'react';
import { Plus, Search, TrendingUp, TrendingDown, MoreHorizontal } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { Harvest, Sale } from '@/types';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@/lib/dateUtils';
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
  const queryClient = useQueryClient();
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
  const [saleTotal, setSaleTotal] = useState('');
  const [salePriceMode, setSalePriceMode] = useState<'perUnit' | 'total'>('perUnit');
  const [saleMode, setSaleMode] = useState<'crates' | 'kg'>('kg');
  const [crateSize, setCrateSize] = useState<'big' | 'small'>('big');
  const [saleSaving, setSaleSaving] = useState(false);

  const parseNumber = (value: string) => Number(value || '0');

  const recomputeTotalFromPerUnit = (qtyStr: string, unitPriceStr: string) => {
    const qty = parseNumber(qtyStr);
    const price = parseNumber(unitPriceStr);
    if (!qty || !price) return '';
    return String(qty * price);
  };

  const recomputeUnitFromTotal = (qtyStr: string, totalStr: string) => {
    const qty = parseNumber(qtyStr);
    const total = parseNumber(totalStr);
    if (!qty || !total) return '';
    return String(total / qty);
  };

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
      const quantity = parseNumber(saleQty);
      let unitPrice: number;
      let totalAmount: number;

      if (salePriceMode === 'perUnit') {
        unitPrice = parseNumber(saleUnitPrice);
        totalAmount = quantity * unitPrice;
      } else {
        totalAmount = parseNumber(saleTotal);
        unitPrice = quantity ? totalAmount / quantity : 0;
      }

      const isTomatoes = activeProject.cropType === 'tomatoes';
      const isFrenchBeans = activeProject.cropType === 'french-beans';

      let unit: string | undefined;
      if (isTomatoes && saleMode === 'crates') {
        unit = crateSize === 'big' ? 'crate-big' : 'crate-small';
      } else {
        // For tomatoes in kg mode, french beans, and any other crop, we use kg.
        unit = 'kg';
      }

      await addDoc(collection(db, 'sales'), {
        buyerName,
        quantity,
        unit,
        unitPrice,
        totalAmount,
        status: 'pending',
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      
      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-sales'] });
      
      setSaleOpen(false);
      setBuyerName('');
      setSaleQty('');
      setSaleUnitPrice('');
      setSaleTotal('');
      setSalePriceMode('perUnit');
      setSaleMode('kg');
      setCrateSize('big');
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
              <button className="fv-btn fv-btn--secondary">
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
              <button className="fv-btn fv-btn--primary">
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
                  {activeProject.cropType === 'tomatoes' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Sale unit</label>
                        <select
                          className="fv-select w-full"
                          value={saleMode}
                          onChange={(e) => setSaleMode(e.target.value as 'crates' | 'kg')}
                        >
                          <option value="crates">Crates (big / small)</option>
                          <option value="kg">Kilograms (kg)</option>
                        </select>
                      </div>

                      {saleMode === 'crates' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-foreground">Crate size</label>
                            <select
                              className="fv-select w-full"
                              value={crateSize}
                              onChange={(e) => setCrateSize(e.target.value as 'big' | 'small')}
                            >
                              <option value="big">Big crate</option>
                              <option value="small">Small crate</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-foreground">Pricing mode</label>
                            <select
                              className="fv-select w-full"
                              value={salePriceMode}
                              onChange={(e) => setSalePriceMode(e.target.value as 'perUnit' | 'total')}
                            >
                              <option value="perUnit">Price per crate</option>
                              <option value="total">Total amount</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-foreground">Quantity (crates)</label>
                              <input
                                type="number"
                                min={0}
                                className="fv-input"
                                value={saleQty}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSaleQty(value);
                                  if (salePriceMode === 'perUnit') {
                                    setSaleTotal(recomputeTotalFromPerUnit(value, saleUnitPrice));
                                  } else {
                                    setSaleUnitPrice(recomputeUnitFromTotal(value, saleTotal));
                                  }
                                }}
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              {salePriceMode === 'perUnit' ? (
                                <>
                                  <label className="text-sm font-medium text-foreground">Price per crate (KES)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    className="fv-input"
                                    value={saleUnitPrice}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setSaleUnitPrice(value);
                                      setSaleTotal(recomputeTotalFromPerUnit(saleQty, value));
                                    }}
                                    required
                                  />
                                </>
                              ) : (
                                <>
                                  <label className="text-sm font-medium text-foreground">Total amount (KES)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    className="fv-input"
                                    value={saleTotal}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setSaleTotal(value);
                                      setSaleUnitPrice(recomputeUnitFromTotal(saleQty, value));
                                    }}
                                    required
                                  />
                                </>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Total: {saleTotal ? formatCurrency(parseNumber(saleTotal)) : 'KES 0'}{' '}
                            {saleQty && saleUnitPrice && (
                              <>({saleQty} crates @ KES {Number(saleUnitPrice || '0').toLocaleString()} each)</>
                            )}
                          </p>
                        </>
                      )}

                      {saleMode === 'kg' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-foreground">Pricing mode</label>
                            <select
                              className="fv-select w-full"
                              value={salePriceMode}
                              onChange={(e) => setSalePriceMode(e.target.value as 'perUnit' | 'total')}
                            >
                              <option value="perUnit">Price per kg</option>
                              <option value="total">Total amount</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-foreground">Quantity (kg)</label>
                              <input
                                type="number"
                                min={0}
                                className="fv-input"
                                value={saleQty}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSaleQty(value);
                                  if (salePriceMode === 'perUnit') {
                                    setSaleTotal(recomputeTotalFromPerUnit(value, saleUnitPrice));
                                  } else {
                                    setSaleUnitPrice(recomputeUnitFromTotal(value, saleTotal));
                                  }
                                }}
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              {salePriceMode === 'perUnit' ? (
                                <>
                                  <label className="text-sm font-medium text-foreground">Price per kg (KES)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    className="fv-input"
                                    value={saleUnitPrice}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setSaleUnitPrice(value);
                                      setSaleTotal(recomputeTotalFromPerUnit(saleQty, value));
                                    }}
                                    required
                                  />
                                </>
                              ) : (
                                <>
                                  <label className="text-sm font-medium text-foreground">Total amount (KES)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    className="fv-input"
                                    value={saleTotal}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setSaleTotal(value);
                                      setSaleUnitPrice(recomputeUnitFromTotal(saleQty, value));
                                    }}
                                    required
                                  />
                                </>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Total: {saleTotal ? formatCurrency(parseNumber(saleTotal)) : 'KES 0'}
                          </p>
                        </>
                      )}
                    </>
                  )}

                  {activeProject.cropType === 'french-beans' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Pricing mode</label>
                        <select
                          className="fv-select w-full"
                          value={salePriceMode}
                          onChange={(e) => setSalePriceMode(e.target.value as 'perUnit' | 'total')}
                        >
                          <option value="perUnit">Price per kg</option>
                          <option value="total">Total amount</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-foreground">Quantity (kg)</label>
                          <input
                            type="number"
                            min={0}
                            className="fv-input"
                            value={saleQty}
                            onChange={(e) => {
                              const value = e.target.value;
                              setSaleQty(value);
                              if (salePriceMode === 'perUnit') {
                                setSaleTotal(recomputeTotalFromPerUnit(value, saleUnitPrice));
                              } else {
                                setSaleUnitPrice(recomputeUnitFromTotal(value, saleTotal));
                              }
                            }}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          {salePriceMode === 'perUnit' ? (
                            <>
                              <label className="text-sm font-medium text-foreground">Price per kg (KES)</label>
                              <input
                                type="number"
                                min={0}
                                className="fv-input"
                                value={saleUnitPrice}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSaleUnitPrice(value);
                                  setSaleTotal(recomputeTotalFromPerUnit(saleQty, value));
                                }}
                                required
                              />
                            </>
                          ) : (
                            <>
                              <label className="text-sm font-medium text-foreground">Total amount (KES)</label>
                              <input
                                type="number"
                                min={0}
                                className="fv-input"
                                value={saleTotal}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSaleTotal(value);
                                  setSaleUnitPrice(recomputeUnitFromTotal(saleQty, value));
                                }}
                                required
                              />
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Total: {saleTotal ? formatCurrency(parseNumber(saleTotal)) : 'KES 0'}
                      </p>
                    </>
                  )}

                  {activeProject.cropType !== 'tomatoes' &&
                    activeProject.cropType !== 'french-beans' && (
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
                    )}
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
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Total Harvest"
          value={`${totalHarvest.toLocaleString()} kg`}
          icon={TrendingUp}
          iconVariant="primary"
          layout="vertical"
        />
        <SimpleStatCard
          title="Total Sales"
          value={formatCurrency(totalSales)}
          icon={TrendingUp}
          iconVariant="gold"
          layout="vertical"
        />
        <SimpleStatCard
          title="Completed Sales"
          value={sales.filter(s => s.status === 'completed').length}
          layout="vertical"
        />
        <SimpleStatCard
          title="Pending Sales"
          value={sales.filter(s => s.status === 'pending').length}
          valueVariant="warning"
          layout="vertical"
        />
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
                    {formatDate(harvest.date)}
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
                {formatDate(harvest.date, { month: 'long' })}
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
                  <td>
                    {sale.quantity.toLocaleString()}{' '}
                    {sale.unit ||
                      (activeProject?.cropType === 'tomatoes' ? 'crates' : 'kg')}
                  </td>
                  <td>
                    {formatCurrency(sale.unitPrice)}
                    {sale.unit ? ` / ${sale.unit}` : '/kg'}
                  </td>
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
                <span className="text-muted-foreground">
                  {sale.quantity.toLocaleString()}{' '}
                  {sale.unit ||
                    (activeProject?.cropType === 'tomatoes' ? 'crates' : 'kg')}
                </span>
                <span className="font-semibold">{formatCurrency(sale.totalAmount)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
