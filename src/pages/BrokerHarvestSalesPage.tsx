import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, ShoppingCart, List, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { useQueryClient } from '@tanstack/react-query';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Harvest, Sale, Expense } from '@/types';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { formatDate, toDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

function getQualityBadge(quality: string) {
  const styles: Record<string, string> = {
    A: 'fv-badge--active',
    B: 'fv-badge--gold',
    C: 'fv-badge--warning',
  };
  return styles[quality] || 'bg-muted text-muted-foreground';
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    completed: 'fv-badge--active',
    pending: 'fv-badge--warning',
    partial: 'fv-badge--warning',
    cancelled: 'bg-destructive/20 text-destructive',
  };
  return styles[status] || 'bg-muted text-muted-foreground';
}

function getPaymentStatusLabel(status: string) {
  if (status === 'completed') return 'Paid';
  if (status === 'partial') return 'Partial';
  if (status === 'pending') return 'Full debt';
  return status;
}

const parseNumber = (value: string) => Number(value || '0');

export default function BrokerHarvestSalesPage() {
  const { user } = useAuth();
  const brokerId = user?.id ?? '';
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: allHarvests = [], isLoading: loadingHarvests } = useCollection<Harvest>('harvests', 'harvests');
  const { data: allSales = [], isLoading: loadingSales } = useCollection<Sale>('sales', 'sales');
  const { data: allExpenses = [] } = useCollection<Expense>('broker-expenses', 'expenses');

  // Brokers only see harvests allocated to them that are going to market
  const brokerHarvests = useMemo(() => {
    return allHarvests.filter(
      (h) => h.brokerId === brokerId && (h.destination ?? 'farm') === 'market',
    );
  }, [allHarvests, brokerId]);

  const brokerHarvestIds = useMemo(() => new Set(brokerHarvests.map((h) => h.id)), [brokerHarvests]);

  const brokerSales = useMemo(() => {
    return allSales.filter(
      (s) => s.brokerId === brokerId || brokerHarvestIds.has(s.harvestId),
    );
  }, [allSales, brokerId, brokerHarvestIds]);

  // Per-harvest: sold quantity and remaining (auto-reducing when sales are recorded)
  const harvestStock = useMemo(() => {
    const stock: Record<string, { harvest: Harvest; sold: number; remaining: number }> = {};
    brokerHarvests.forEach((harvest) => {
      const sold = brokerSales
        .filter((s) => s.harvestId === harvest.id)
        .reduce((sum, s) => sum + s.quantity, 0);
      stock[harvest.id] = {
        harvest,
        sold,
        remaining: Math.max(0, harvest.quantity - sold),
      };
    });
    return stock;
  }, [brokerHarvests, brokerSales]);

  const totalHarvestQty = brokerHarvests.reduce((sum, h) => sum + h.quantity, 0);
  const totalSalesAmount = brokerSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const brokerExpenses = useMemo(
    () =>
      allExpenses.filter(
        (e) => e.paidBy === brokerId || (e.harvestId && brokerHarvestIds.has(e.harvestId)),
      ),
    [allExpenses, brokerId, brokerHarvestIds],
  );
  const totalExpensesAmount = brokerExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netAfterExpenses = totalSalesAmount - totalExpensesAmount;
  const completedCount = brokerSales.filter((s) => s.status === 'completed').length;
  const pendingCount = brokerSales.filter((s) => s.status === 'pending').length;

  const [harvestDateFilter, setHarvestDateFilter] = useState<string>('');
  const [harvestViewMode, setHarvestViewMode] = useState<'list' | 'card'>('card');
  const [salesViewMode, setSalesViewMode] = useState<'list' | 'card'>('list');
  const [saleStatusFilter, setSaleStatusFilter] = useState<
    'all' | 'pending' | 'partial' | 'completed' | 'cancelled'
  >('all');

  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [selectedHarvest, setSelectedHarvest] = useState<Harvest | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [saleLines, setSaleLines] = useState<{ qty: string; unitPrice: string }[]>([
    { qty: '', unitPrice: '' },
  ]);
  const [salePaymentStatus, setSalePaymentStatus] = useState<'completed' | 'partial' | 'pending'>('completed');
  const [partialAmountPaid, setPartialAmountPaid] = useState('');
  const [saleSaving, setSaleSaving] = useState(false);

  const selectedRemaining = selectedHarvest ? (harvestStock[selectedHarvest.id]?.remaining ?? 0) : 0;

  const handleOpenRecordSale = (harvest: Harvest) => {
    const stock = harvestStock[harvest.id];
    if (stock && stock.remaining <= 0) return;
    setSelectedHarvest(harvest);
    setBuyerName('');
    setSaleLines([{ qty: '', unitPrice: '' }]);
    setSalePaymentStatus('completed');
    setPartialAmountPaid('');
    setSaleDialogOpen(true);
  };

  const handleCloseRecordSale = () => {
    setSaleDialogOpen(false);
    setSelectedHarvest(null);
    setBuyerName('');
    setSaleLines([{ qty: '', unitPrice: '' }]);
    setSalePaymentStatus('completed');
    setPartialAmountPaid('');
  };

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHarvest || !buyerName.trim()) return;
    const numericLines = saleLines
      .map((l) => ({ q: parseNumber(l.qty), p: parseNumber(l.unitPrice) }))
      .filter((l) => l.q > 0 && l.p > 0);
    const totalCrates = numericLines.reduce((sum, l) => sum + l.q, 0);
    const totalSaleAmount = numericLines.reduce((sum, l) => sum + l.q * l.p, 0);
    if (numericLines.length <= 0 || totalCrates <= 0) {
      alert('Please enter at least one line with quantity and price.');
      return;
    }
    if (totalCrates > selectedRemaining) {
      alert(`Cannot sell more than remaining. Remaining: ${selectedRemaining} ${selectedHarvest.unit}.`);
      return;
    }
    if (salePaymentStatus === 'partial') {
      const paid = parseNumber(partialAmountPaid);
      if (paid <= 0 || paid > totalSaleAmount) {
        alert('Please enter the partial payment amount (must be greater than 0 and not more than the total).');
        return;
      }
    }
    setSaleSaving(true);
    try {
      const salesRef = collection(db, 'sales');
      const base = {
        harvestId: selectedHarvest.id,
        brokerId,
        buyerName: buyerName.trim(),
        projectId: selectedHarvest.projectId,
        companyId: selectedHarvest.companyId,
        cropType: selectedHarvest.cropType,
        status: salePaymentStatus,
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
      const totalAmountForDistribution = totalSaleAmount;
      const partialPaid = salePaymentStatus === 'partial' ? parseNumber(partialAmountPaid) : 0;
      for (let i = 0; i < numericLines.length; i++) {
        const line = numericLines[i];
        const lineTotal = line.q * line.p;
        let amountPaidForLine: number | undefined;
        if (salePaymentStatus === 'partial' && totalAmountForDistribution > 0) {
          if (i < numericLines.length - 1) {
            amountPaidForLine = Math.round((partialPaid * lineTotal) / totalAmountForDistribution);
          } else {
            const soFar = numericLines.slice(0, -1).reduce((s, l) => s + Math.round((partialPaid * (l.q * l.p)) / totalAmountForDistribution), 0);
            amountPaidForLine = partialPaid - soFar;
          }
        }
        await addDoc(salesRef, {
          ...base,
          quantity: line.q,
          unit: selectedHarvest.unit,
          unitPrice: line.p,
          totalAmount: lineTotal,
          ...(amountPaidForLine != null && { amountPaid: amountPaidForLine }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['harvests'] });
      handleCloseRecordSale();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to record sale.');
    } finally {
      setSaleSaving(false);
    }
  };

  const filteredHarvests = useMemo(() => {
    if (!harvestDateFilter) return brokerHarvests;
    return brokerHarvests.filter((h) => {
      const d = toDate(h.date);
      if (!d) return false;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dayKey = `${y}-${m}-${day}`;
      return dayKey === harvestDateFilter;
    });
  }, [brokerHarvests, harvestDateFilter]);

  const filteredSales = useMemo(() => {
    const list = brokerSales.filter((s) =>
      saleStatusFilter === 'all' ? true : s.status === saleStatusFilter,
    );
    return [...list].sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0));
  }, [brokerSales, saleStatusFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Broker Harvest & Sales</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Harvests allocated to you and your sales
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Allocated Harvests"
          value={brokerHarvests.length}
          icon={TrendingUp}
          iconVariant="primary"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Total Quantity"
          value={`${totalHarvestQty.toLocaleString()} kg`}
          icon={TrendingUp}
          iconVariant="primary"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Total Revenue"
          value={formatCurrency(totalSalesAmount)}
          icon={TrendingUp}
          iconVariant="gold"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Total Expenses"
          value={formatCurrency(totalExpensesAmount)}
          icon={TrendingUp}
          iconVariant="warning"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Net (after expenses)"
          value={formatCurrency(netAfterExpenses)}
          icon={TrendingUp}
          iconVariant={netAfterExpenses >= 0 ? 'success' : 'warning'}
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Completed / Pending"
          value={`${completedCount} / ${pendingCount}`}
          valueVariant="warning"
          layout="mobile-compact"
        />
      </div>

      {/* Harvests Allocated to You – no container, list/card toggle */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h3 className="text-lg font-semibold">Harvests Allocated to You</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                className={cn(
                  'p-2 transition-colors',
                  harvestViewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 hover:bg-muted text-muted-foreground',
                )}
                onClick={() => setHarvestViewMode('list')}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn(
                  'p-2 transition-colors',
                  harvestViewMode === 'card'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 hover:bg-muted text-muted-foreground',
                )}
                onClick={() => setHarvestViewMode('card')}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">Day</span>
            <input
              type="date"
              className="fv-input w-36"
              value={harvestDateFilter}
              onChange={(e) => setHarvestDateFilter(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
            {harvestDateFilter && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setHarvestDateFilter('')}
              >
                All days
              </button>
            )}
          </div>
        </div>

        {loadingHarvests && (
          <p className="text-sm text-muted-foreground mb-4">Loading harvests…</p>
        )}

        {filteredHarvests.length === 0 && !loadingHarvests && (
          <p className="text-sm text-muted-foreground py-6 text-center rounded-xl border border-border bg-card/60">
            {harvestDateFilter
              ? `No harvests allocated to you on this day. Try another date or clear the filter.`
              : 'No harvests allocated to you yet. When a harvest is assigned to you, it will appear here.'}
          </p>
        )}

        {filteredHarvests.length > 0 && !loadingHarvests && harvestViewMode === 'list' && (
          <div className="space-y-2">
            {filteredHarvests.map((harvest) => {
              const stock = harvestStock[harvest.id];
              const remaining = stock?.remaining ?? harvest.quantity;
              const sold = stock?.sold ?? 0;
              const canRecordSale = remaining > 0;
              return (
                <div
                  key={harvest.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (canRecordSale) handleOpenRecordSale(harvest);
                    else navigate(`/broker/harvest/${harvest.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    if (canRecordSale) handleOpenRecordSale(harvest);
                    else navigate(`/broker/harvest/${harvest.id}`);
                  }}
                  className={cn(
                    'flex flex-wrap items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-card/60 cursor-pointer hover:bg-muted/30 transition-colors',
                    !canRecordSale && 'opacity-90',
                  )}
                >
                  <span className="font-medium">{harvest.quantity.toLocaleString()} {harvest.unit}</span>
                  <span className="text-sm text-muted-foreground">{formatDate(harvest.date)}</span>
                  <span className="text-sm text-muted-foreground">Remaining: {remaining.toLocaleString()}</span>
                  {sold > 0 && <span className="text-sm text-muted-foreground">Sold: {sold.toLocaleString()}</span>}
                  {canRecordSale ? (
                    <span className="fv-badge fv-badge--active text-xs ml-auto">Record sale</span>
                  ) : (
                    <span className="fv-badge bg-muted text-muted-foreground text-xs ml-auto">SOLD OUT</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filteredHarvests.length > 0 && !loadingHarvests && harvestViewMode === 'card' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredHarvests.map((harvest) => {
            const stock = harvestStock[harvest.id];
            const remaining = stock?.remaining ?? harvest.quantity;
            const sold = stock?.sold ?? 0;
            const canRecordSale = remaining > 0;
            return (
              <div
                key={harvest.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (canRecordSale) handleOpenRecordSale(harvest);
                  else navigate(`/broker/harvest/${harvest.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  if (canRecordSale) handleOpenRecordSale(harvest);
                  else navigate(`/broker/harvest/${harvest.id}`);
                }}
                className={cn(
                  'p-4 rounded-lg border bg-card transition-colors relative overflow-hidden',
                  'cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary',
                  canRecordSale ? 'hover:bg-muted/30' : 'opacity-90'
                )}
              >
                {!canRecordSale && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
                    aria-hidden
                  >
                    <span
                      className="text-4xl font-bold text-muted-foreground/25 whitespace-nowrap"
                      style={{ transform: 'rotate(-25deg)' }}
                    >
                      SOLD OUT
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mb-2 relative">
                  <span className="font-medium">
                    {harvest.quantity.toLocaleString()} {harvest.unit}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {harvest.cropType !== 'tomatoes' && (
                      <span className={cn('fv-badge', getQualityBadge(harvest.quality))}>
                        Grade {harvest.quality}
                      </span>
                    )}
                    {canRecordSale && (
                      <span className="fv-badge fv-badge--active text-xs flex items-center gap-1">
                        <ShoppingCart className="h-3 w-3" />
                        Record sale
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Remaining: <strong>{remaining.toLocaleString()}</strong> {harvest.unit}
                  {sold > 0 && (
                    <span className="ml-2 text-muted-foreground">Sold: {sold.toLocaleString()}</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDate(harvest.date, { month: 'long' })} • {harvest.cropType}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {harvest.destination === 'market'
                    ? `Market: ${harvest.marketName ?? '—'}`
                    : 'Destination: Farm'}
                </p>
                {harvest.notes && (
                  <p className="text-xs text-muted-foreground mt-1 truncate" title={harvest.notes}>
                    {harvest.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Record Sale dialog (opened when broker clicks a harvest card) */}
      <Dialog open={saleDialogOpen} onOpenChange={(open) => !open && handleCloseRecordSale()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Sale</DialogTitle>
          </DialogHeader>
          {selectedHarvest && (
            <form onSubmit={handleRecordSale} className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">
                  {selectedHarvest.quantity.toLocaleString()} {selectedHarvest.unit} • {selectedHarvest.cropType}
                </p>
                <p className="text-muted-foreground mt-1">
                  Remaining: <strong>{selectedRemaining}</strong> {selectedHarvest.unit}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Buyer name</label>
                <input
                  type="text"
                  className="fv-input w-full"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Name of buyer"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Crates & price</label>
                <p className="text-xs text-muted-foreground">
                  Add a line per price (e.g. 10 crates @ 500, 5 crates @ 450). Each price is saved separately.
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {saleLines.map((line, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="number"
                        min={0}
                        placeholder="Crates"
                        className="fv-input w-24"
                        value={line.qty}
                        onChange={(e) =>
                          setSaleLines((prev) =>
                            prev.map((l, j) => (j === i ? { ...l, qty: e.target.value } : l))
                          )
                        }
                      />
                      <span className="text-muted-foreground text-sm">@</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="Price"
                        className="fv-input flex-1"
                        value={line.unitPrice}
                        onChange={(e) =>
                          setSaleLines((prev) =>
                            prev.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l))
                          )
                        }
                      />
                      <span className="text-xs text-muted-foreground">KES</span>
                      {saleLines.length > 1 && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive text-sm"
                          onClick={() =>
                            setSaleLines((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="w-full mt-2 py-2 rounded-lg border border-dashed border-muted-foreground/40 text-sm text-muted-foreground hover:bg-muted/50 hover:border-primary/50 hover:text-primary transition-colors flex items-center justify-center gap-2"
                  onClick={() => setSaleLines((prev) => [...prev, { qty: '', unitPrice: '' }])}
                >
                  <span className="text-base">+</span> Add another price
                </button>
                <p className="text-sm font-medium mt-2">
                  Total:{' '}
                  {(() => {
                    const num = saleLines
                      .map((l) => ({ q: parseNumber(l.qty), p: parseNumber(l.unitPrice) }))
                      .filter((l) => l.q > 0 && l.p > 0);
                    const crates = num.reduce((s, l) => s + l.q, 0);
                    const amount = num.reduce((s, l) => s + l.q * l.p, 0);
                    return `${crates} crates • KES ${amount.toLocaleString()}`;
                  })()}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Payment status</label>
                <Select
                  value={salePaymentStatus}
                  onValueChange={(val) => {
                    setSalePaymentStatus(val as 'completed' | 'partial' | 'pending');
                    if (val !== 'partial') setPartialAmountPaid('');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Payment status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Paid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="pending">Full debt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {salePaymentStatus === 'partial' && (
                <div className="space-y-1 rounded-lg border bg-muted/20 p-3">
                  <label className="text-sm font-medium">Partial payment made (KES)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="fv-input w-full"
                    value={partialAmountPaid}
                    onChange={(e) => setPartialAmountPaid(e.target.value)}
                    placeholder="Amount already paid"
                    required={salePaymentStatus === 'partial'}
                  />
                  {(() => {
                    const total = saleLines
                      .map((l) => ({ q: parseNumber(l.qty), p: parseNumber(l.unitPrice) }))
                      .filter((l) => l.q > 0 && l.p > 0)
                      .reduce((s, l) => s + l.q * l.p, 0);
                    const paid = parseNumber(partialAmountPaid);
                    const remainder = total > 0 ? Math.max(0, total - paid) : 0;
                    return (
                      <p className="text-sm text-muted-foreground mt-2">
                        Remainder (debt): <strong className="text-foreground">KES {remainder.toLocaleString()}</strong>
                      </p>
                    );
                  })()}
                </div>
              )}
              <DialogFooter>
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  onClick={handleCloseRecordSale}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saleSaving}
                  className="fv-btn fv-btn--primary"
                >
                  {saleSaving ? 'Saving…' : 'Record Sale'}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Your Sales – no container, list/card toggle */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h3 className="text-lg font-semibold">Your Sales</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                className={cn(
                  'p-2 transition-colors',
                  salesViewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 hover:bg-muted text-muted-foreground',
                )}
                onClick={() => setSalesViewMode('list')}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn(
                  'p-2 transition-colors',
                  salesViewMode === 'card'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 hover:bg-muted text-muted-foreground',
                )}
                onClick={() => setSalesViewMode('card')}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">Status</span>
            <Select
              value={saleStatusFilter}
              onValueChange={(val) =>
                setSaleStatusFilter(val as 'all' | 'pending' | 'partial' | 'completed' | 'cancelled')
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Full debt</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="completed">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadingSales && (
          <p className="text-sm text-muted-foreground mb-4">Loading sales…</p>
        )}

        {filteredSales.length === 0 && !loadingSales && (
          <p className="text-sm text-muted-foreground py-6 text-center rounded-xl border border-border bg-card/60">
            No sales recorded yet for your allocated harvests.
          </p>
        )}

        {filteredSales.length > 0 && !loadingSales && salesViewMode === 'list' && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card/60 overflow-hidden">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Buyer</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Remainder</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => {
                  const paid = (sale as any).amountPaid ?? 0;
                  const remainder = sale.totalAmount - paid;
                  return (
                    <tr key={sale.id}>
                      <td className="text-muted-foreground">{formatDate(sale.date)}</td>
                      <td className="font-medium">{sale.buyerName}</td>
                      <td>
                        {sale.quantity.toLocaleString()} {sale.unit ?? 'units'}
                      </td>
                      <td>{formatCurrency(sale.unitPrice)}</td>
                      <td className="font-semibold">{formatCurrency(sale.totalAmount)}</td>
                      <td>
                        <span className={cn('fv-badge capitalize', getStatusBadge(sale.status))}>
                          {getPaymentStatusLabel(sale.status)}
                        </span>
                      </td>
                      <td className="text-muted-foreground text-sm">
                        {sale.status === 'partial' ? formatCurrency(remainder) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredSales.length > 0 && !loadingSales && salesViewMode === 'card' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSales.map((sale) => {
              const paid = (sale as any).amountPaid ?? 0;
              const remainder = sale.totalAmount - paid;
              return (
                <div key={sale.id} className="p-3 sm:p-4 rounded-xl border border-border bg-card/60">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-medium text-sm">{sale.buyerName}</span>
                    <span className={cn('fv-badge capitalize text-xs', getStatusBadge(sale.status))}>
                      {getPaymentStatusLabel(sale.status)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(sale.date)}</p>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">
                      {sale.quantity.toLocaleString()} {sale.unit ?? 'units'}
                    </span>
                    <span className="font-semibold">{formatCurrency(sale.totalAmount)}</span>
                  </div>
                  {sale.status === 'partial' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Remainder: {formatCurrency(remainder)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
