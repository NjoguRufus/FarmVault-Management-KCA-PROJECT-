import React, { useMemo, useState } from 'react';
import { DollarSign, Package, TrendingUp, Calendar, Award, AlertTriangle, List, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Sale, Harvest } from '@/types';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { formatDate, toDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

export function BrokerDashboard() {
  const { user } = useAuth();
  const brokerId = user?.id ?? '';

  const { data: allSales = [] } = useCollection<Sale>('sales', 'sales');
  const { data: allHarvests = [] } = useCollection<Harvest>('harvests', 'harvests');

  // Harvests allocated to this broker (brokerId on harvest); brokers only see market harvests
  const brokerHarvests = useMemo(() => {
    return allHarvests.filter(
      (h) => h.brokerId === brokerId && (h.destination ?? 'farm') === 'market',
    );
  }, [allHarvests, brokerId]);

  const brokerHarvestIds = useMemo(() => new Set(brokerHarvests.map((h) => h.id)), [brokerHarvests]);

  // Sales where this broker is assigned or sale is from their allocated harvest
  const brokerSales = useMemo(() => {
    return allSales.filter(
      (s) => s.brokerId === brokerId || brokerHarvestIds.has(s.harvestId),
    );
  }, [allSales, brokerId, brokerHarvestIds]);

  // Calculate stats
  const totalSales = useMemo(() => {
    return brokerSales.reduce((sum, s) => sum + s.totalAmount, 0);
  }, [brokerSales]);

  const totalCrates = useMemo(() => {
    return brokerSales.reduce((sum, s) => {
      if (s.unit?.includes('crate')) {
        return sum + s.quantity;
      }
      return sum;
    }, 0);
  }, [brokerSales]);

  const avgPricePerCrate = useMemo(() => {
    const crateSales = brokerSales.filter(s => s.unit?.includes('crate'));
    if (crateSales.length === 0) return 0;
    const total = crateSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const crates = crateSales.reduce((sum, s) => sum + s.quantity, 0);
    return crates > 0 ? Math.round(total / crates) : 0;
  }, [brokerSales]);

  // Performance insights
  const bestSellingDay = useMemo(() => {
    const salesByDay: Record<string, number> = {};
    brokerSales.forEach(sale => {
      const date = formatDate(sale.date);
      salesByDay[date] = (salesByDay[date] || 0) + sale.totalAmount;
    });
    const entries = Object.entries(salesByDay);
    if (entries.length === 0) return null;
    return entries.reduce((max, [date, amount]) => 
      amount > max[1] ? [date, amount] : max
    );
  }, [brokerSales]);

  const highestPrice = useMemo(() => {
    if (brokerSales.length === 0) return 0;
    return Math.max(...brokerSales.map(s => s.unitPrice));
  }, [brokerSales]);

  const lowestPrice = useMemo(() => {
    if (brokerSales.length === 0) return 0;
    return Math.min(...brokerSales.map(s => s.unitPrice));
  }, [brokerSales]);

  // Harvest linkage for allocated harvests only
  const harvestStock = useMemo(() => {
    const stock: Record<string, { harvest: Harvest; remaining: number; sold: number }> = {};
    brokerHarvests.forEach((harvest) => {
      const sold = brokerSales
        .filter((s) => s.harvestId === harvest.id)
        .reduce((sum, s) => sum + s.quantity, 0);
      stock[harvest.id] = {
        harvest,
        remaining: harvest.quantity - sold,
        sold,
      };
    });
    return stock;
  }, [brokerHarvests, brokerSales]);

  const sortedSales = useMemo(
    () =>
      [...brokerSales].sort((a, b) => {
        const dateA = toDate(a.date);
        const dateB = toDate(b.date);
        if (!dateA || !dateB) return 0;
        return dateB.getTime() - dateA.getTime();
      }),
    [brokerSales],
  );

  const [salesViewMode, setSalesViewMode] = useState<'list' | 'card'>('list');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Broker Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your sales performance and allocated harvests
        </p>
      </div>

      {/* Primary Stats – smaller and responsive on mobile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Total Sales (KES)"
          value={totalSales.toLocaleString()}
          icon={DollarSign}
          iconVariant="gold"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Crates Sold"
          value={totalCrates}
          icon={Package}
          iconVariant="primary"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Avg Price per Crate"
          value={`KES ${avgPricePerCrate.toLocaleString()}`}
          icon={TrendingUp}
          iconVariant="success"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Allocated Harvests"
          value={brokerHarvests.length}
          icon={Calendar}
          iconVariant="info"
          layout="mobile-compact"
        />
      </div>

      {/* Sales Activity – no container, list/card toggle */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-foreground">Sales Activity</h2>
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
        </div>
        {salesViewMode === 'list' && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card/60 overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 sm:p-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                  <th className="p-2 sm:p-3 text-left text-xs font-semibold text-muted-foreground">Crop</th>
                  <th className="p-2 sm:p-3 text-left text-xs font-semibold text-muted-foreground">Quantity</th>
                  <th className="p-2 sm:p-3 text-left text-xs font-semibold text-muted-foreground">Price/Crate</th>
                  <th className="p-2 sm:p-3 text-left text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                      No sales recorded yet.
                    </td>
                  </tr>
                ) : (
                  sortedSales.map((sale) => (
                    <tr key={sale.id} className="border-t border-border">
                      <td className="p-2 sm:p-3 text-sm">{formatDate(sale.date)}</td>
                      <td className="p-2 sm:p-3 text-sm capitalize">{sale.cropType}</td>
                      <td className="p-2 sm:p-3 text-sm">
                        {sale.quantity} {sale.unit || 'units'}
                      </td>
                      <td className="p-2 sm:p-3 text-sm">KES {sale.unitPrice.toLocaleString()}</td>
                      <td className="p-2 sm:p-3 text-sm font-semibold">KES {sale.totalAmount.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {salesViewMode === 'card' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedSales.length === 0 ? (
              <p className="col-span-full text-sm text-muted-foreground py-6 text-center">
                No sales recorded yet.
              </p>
            ) : (
              sortedSales.map((sale) => (
                <div
                  key={sale.id}
                  className="p-3 sm:p-4 rounded-xl border border-border bg-card/60"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-medium text-sm">{formatDate(sale.date)}</span>
                    <span className="text-xs capitalize text-muted-foreground">{sale.cropType}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {sale.quantity} {sale.unit || 'units'} × KES {sale.unitPrice.toLocaleString()}
                  </p>
                  <p className="text-base font-semibold mt-1">KES {sale.totalAmount.toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Harvest Stock – no container, each item independent */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Harvest Stock</h2>
        {Object.values(harvestStock).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 rounded-xl border border-border bg-card/60">
            No harvests allocated to you yet. When a harvest is assigned to you, it will appear here and in Harvest & Sales.
          </p>
        ) : (
          <div className="space-y-3">
            {Object.values(harvestStock).map(({ harvest, remaining, sold }) => (
              <div
                key={harvest.id}
                className="p-3 sm:p-4 rounded-xl border border-border bg-card/60"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium text-sm sm:text-base">{formatDate(harvest.date)}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {harvest.quantity} {harvest.unit} harvested
                    </p>
                  </div>
                  <span
                    className={cn(
                      'fv-badge text-xs shrink-0',
                      remaining > 0 ? 'fv-badge--active' : 'fv-badge--warning',
                    )}
                  >
                    {remaining > 0 ? 'Open' : 'Sold Out'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                  <span>Sold: {sold} {harvest.unit}</span>
                  <span>Remaining: {remaining} {harvest.unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance Insights – independent cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Best Selling Day"
          value={bestSellingDay ? formatDate(bestSellingDay[0]) : 'N/A'}
          subtitle={bestSellingDay ? `KES ${bestSellingDay[1].toLocaleString()}` : undefined}
          icon={Award}
          iconVariant="gold"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Highest Price"
          value={`KES ${highestPrice.toLocaleString()}`}
          icon={TrendingUp}
          iconVariant="success"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Lowest Price"
          value={`KES ${lowestPrice.toLocaleString()}`}
          icon={AlertTriangle}
          iconVariant="warning"
          layout="mobile-compact"
        />
      </div>
    </div>
  );
}
