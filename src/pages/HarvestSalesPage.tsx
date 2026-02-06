import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, TrendingUp, TrendingDown, MoreHorizontal, LayoutGrid, List } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { Harvest, Sale, Employee, User } from '@/types';
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

const DEFAULT_MARKETS = ['Muthurwa Market', 'Githurai Market', 'Sagana Market'];

export default function HarvestSalesPage() {
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: allHarvests = [], isLoading: loadingHarvests } = useCollection<Harvest>('harvests', 'harvests');
  const { data: allSales = [], isLoading: loadingSales } = useCollection<Sale>('sales', 'sales');
  const { data: allEmployees = [] } = useCollection<Employee>('employees', 'employees');
  const { data: allUsers = [] } = useCollection<User>('harvest-page-users', 'users');

  const harvests = activeProject
    ? allHarvests.filter((h) => h.projectId === activeProject.id)
    : allHarvests;

  const sales = activeProject
    ? allSales.filter((s) => s.projectId === activeProject.id)
    : allSales;

  // Company drivers (for going to market)
  const drivers = React.useMemo(() => {
    if (!activeProject) return [];
    return allEmployees.filter(
      (e) =>
        e.companyId === activeProject.companyId &&
        (e.role === 'logistics-driver' || e.role === 'driver'),
    );
  }, [allEmployees, activeProject?.companyId]);

  // Brokers: employees with sales-broker role + users with platform role 'broker'.
  // Use the broker's AUTH USER ID (id they use when logged in) so harvest.brokerId matches user.id on the broker dashboard.
  const brokers = React.useMemo(() => {
    const fromEmployees =
      activeProject
        ? allEmployees.filter(
            (e) => e.companyId === activeProject.companyId && e.role === 'sales-broker',
          )
        : allEmployees.filter((e) => e.role === 'sales-broker');
    const fromUsers = (allUsers as User[]).filter((u) => u.role === 'broker');
    const byId = new Map<string, { id: string; name: string }>();
    fromEmployees.forEach((e) => {
      const authId = (e as any).authUserId ?? e.id;
      byId.set(authId, { id: authId, name: e.name });
    });
    fromUsers.forEach((u) => byId.set(u.id, { id: u.id, name: u.name }));
    return Array.from(byId.values());
  }, [allEmployees, allUsers, activeProject?.companyId]);

  const marketHarvests = harvests.filter((h) => h.destination === 'market');

  // Per-harvest sold quantity (for sold-out indicator)
  const harvestStock = useMemo(() => {
    const stock: Record<string, { sold: number; remaining: number }> = {};
    harvests.forEach((h) => {
      const sold = sales
        .filter((s) => s.harvestId === h.id)
        .reduce((sum, s) => sum + s.quantity, 0);
      stock[h.id] = {
        sold,
        remaining: Math.max(0, h.quantity - sold),
      };
    });
    return stock;
  }, [harvests, sales]);

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
      partial: 'fv-badge--warning',
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
  const [harvestDestination, setHarvestDestination] = useState<'farm' | 'market'>('farm');
  const [harvestFarmPricingMode, setHarvestFarmPricingMode] = useState<'perUnit' | 'total'>('perUnit');
  const [harvestFarmUnitType, setHarvestFarmUnitType] = useState<'crate-big' | 'crate-small' | 'kg'>('kg');
  const [harvestFarmUnitPrice, setHarvestFarmUnitPrice] = useState('');
  const [harvestFarmTotalPrice, setHarvestFarmTotalPrice] = useState('');
  const [harvestMarket, setHarvestMarket] = useState('');
  const [harvestCustomMarket, setHarvestCustomMarket] = useState('');
  const [harvestBrokerId, setHarvestBrokerId] = useState('');
  const [harvestCrateType, setHarvestCrateType] = useState<'big' | 'small'>('big');
  const [harvestLorryPlates, setHarvestLorryPlates] = useState<string[]>(['']);
  const [harvestDriverType, setHarvestDriverType] = useState<'company' | 'other'>('company');
  const [harvestDriverId, setHarvestDriverId] = useState('');
  const [harvestDriverOtherName, setHarvestDriverOtherName] = useState('');
  const [harvestSaving, setHarvestSaving] = useState(false);

  const [buyerName, setBuyerName] = useState('');
  const [selectedHarvestId, setSelectedHarvestId] = useState('');
  const [saleQty, setSaleQty] = useState('');
  const [saleUnitPrice, setSaleUnitPrice] = useState('');
  const [saleTotal, setSaleTotal] = useState('');
  const [salePriceMode, setSalePriceMode] = useState<'perUnit' | 'total'>('perUnit');
  const [saleMode, setSaleMode] = useState<'crates' | 'kg'>('kg');
  const [crateSize, setCrateSize] = useState<'big' | 'small'>('big');
  const [saleStatus, setSaleStatus] = useState<'pending' | 'partial' | 'completed' | 'cancelled'>('pending');
  const [saleBrokerId, setSaleBrokerId] = useState('');
  const [saleSaving, setSaleSaving] = useState(false);
  const [saleLines, setSaleLines] = useState<{ qty: string; unitPrice: string }[]>([
    { qty: '', unitPrice: '' },
  ]);

  const [harvestFilter, setHarvestFilter] = useState<'all' | 'farm' | 'market'>('all');
  const [harvestViewMode, setHarvestViewMode] = useState<'list' | 'card'>('list');
  const [saleStatusFilter, setSaleStatusFilter] = useState<
    'all' | 'pending' | 'partial' | 'completed' | 'cancelled'
  >('all');

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
      const destination = harvestDestination;
      const isTomatoes = activeProject.cropType === 'tomatoes';
      const unit =
        isTomatoes && destination === 'market'
          ? harvestCrateType === 'big'
            ? 'crate-big'
            : 'crate-small'
          : harvestUnit;
      const quality = isTomatoes ? 'A' : harvestQuality;

      const harvestData: any = {
        quantity: Number(harvestQty || '0'),
        unit,
        quality,
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        destination,
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      // Only include notes when there is actual text to save
      if (harvestNotes && harvestNotes.trim().length > 0) {
        harvestData.notes = harvestNotes.trim();
      }

      if (destination === 'farm') {
        harvestData.farmPricingMode = harvestFarmPricingMode;
        harvestData.farmPriceUnitType = harvestFarmUnitType;
        const unitPriceNum = Number(harvestFarmUnitPrice || '0');
        const totalPriceNum = Number(harvestFarmTotalPrice || '0');
        if (unitPriceNum > 0) harvestData.farmUnitPrice = unitPriceNum;
        if (totalPriceNum > 0) harvestData.farmTotalPrice = totalPriceNum;
      } else if (destination === 'market') {
        const rawMarket = harvestMarket === 'none' ? '' : harvestMarket;
        const marketName = rawMarket === 'custom' ? harvestCustomMarket : rawMarket;
        if (marketName) harvestData.marketName = marketName;
        if (harvestBrokerId) {
          const broker = brokers.find(b => b.id === harvestBrokerId);
          harvestData.brokerId = harvestBrokerId;
          harvestData.brokerName = broker?.name;
        }
        const plates = harvestLorryPlates.map((p) => p.trim()).filter(Boolean);
        if (plates.length > 0) harvestData.lorryPlates = plates;
        if (harvestDriverType === 'company' && harvestDriverId) {
          const driver = drivers.find((d) => d.id === harvestDriverId);
          harvestData.driverId = harvestDriverId;
          harvestData.driverName = driver?.name;
        } else if (harvestDriverType === 'other' && harvestDriverOtherName.trim()) {
          harvestData.driverName = harvestDriverOtherName.trim();
        }
      }

      const harvestRef = await addDoc(collection(db, 'harvests'), harvestData);

      queryClient.invalidateQueries({ queryKey: ['harvests'] });

      // If this harvest is sold directly from the farm and has pricing,
      // automatically create a completed sale linked to this harvest.
      if (destination === 'farm') {
        const qty = Number(harvestQty || '0');
        const hasPerUnit = harvestData.farmUnitPrice && harvestData.farmUnitPrice > 0;
        const hasTotal = harvestData.farmTotalPrice && harvestData.farmTotalPrice > 0;

        if (qty > 0 && (hasPerUnit || hasTotal)) {
          let unit = harvestFarmUnitType || harvestUnit || 'kg';
          let totalAmount: number;
          let unitPrice: number;

          if (harvestFarmPricingMode === 'perUnit' && hasPerUnit) {
            unitPrice = harvestData.farmUnitPrice;
            totalAmount = unitPrice * qty;
          } else if (hasTotal) {
            totalAmount = harvestData.farmTotalPrice;
            unitPrice = qty ? totalAmount / qty : 0;
          } else {
            totalAmount = 0;
            unitPrice = 0;
          }

          if (totalAmount > 0) {
            await addDoc(collection(db, 'sales'), {
              harvestId: harvestRef.id,
              buyerName: 'Farm gate sale',
              quantity: qty,
              unit,
              unitPrice,
              totalAmount,
              status: 'completed',
              projectId: activeProject.id,
              companyId: activeProject.companyId,
              cropType: activeProject.cropType,
              date: serverTimestamp(),
              createdAt: serverTimestamp(),
            });

            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-sales'] });
          }
        }
      }
      setHarvestOpen(false);
      setHarvestQty('');
      setHarvestUnit('kg');
      setHarvestQuality('A');
      setHarvestNotes('');
      setHarvestDestination('farm');
      setHarvestFarmPricingMode('perUnit');
      setHarvestFarmUnitType('kg');
      setHarvestFarmUnitPrice('');
      setHarvestFarmTotalPrice('');
      setHarvestMarket('');
      setHarvestCustomMarket('');
      setHarvestBrokerId('');
      setHarvestCrateType('big');
      setHarvestLorryPlates(['']);
      setHarvestDriverType('company');
      setHarvestDriverId('');
      setHarvestDriverOtherName('');
    } finally {
      setHarvestSaving(false);
    }
  };

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !selectedHarvestId) return;
    setSaleSaving(true);
    try {
      const isTomatoes = activeProject.cropType === 'tomatoes';
      const isFrenchBeans = activeProject.cropType === 'french-beans';

      let unit: string | undefined;
      if (isTomatoes && saleMode === 'crates') {
        unit = crateSize === 'big' ? 'crate-big' : 'crate-small';
      } else {
        // For tomatoes in kg mode, french beans, and any other crop, we use kg.
        unit = 'kg';
      }

      let quantity: number;
      let unitPrice: number;
      let totalAmount: number;

      // For tomato market sales by crates, support multiple price bands.
      if (isTomatoes && saleMode === 'crates') {
        const numericLines = saleLines
          .map((line) => ({
            q: parseNumber(line.qty),
            p: parseNumber(line.unitPrice),
          }))
          .filter((l) => l.q > 0 && l.p > 0);

        quantity = numericLines.reduce((sum, l) => sum + l.q, 0);
        totalAmount = numericLines.reduce((sum, l) => sum + l.q * l.p, 0);
        unitPrice = quantity ? totalAmount / quantity : 0;

        if (!quantity || !totalAmount) {
          alert('Please enter at least one price and quantity for the crates being sold.');
          setSaleSaving(false);
          return;
        }
      } else {
        // Fallback to existing single price/quantity logic (kg or non-tomato crops)
        quantity = parseNumber(saleQty);

        if (salePriceMode === 'perUnit') {
          unitPrice = parseNumber(saleUnitPrice);
          totalAmount = quantity * unitPrice;
        } else {
          totalAmount = parseNumber(saleTotal);
          unitPrice = quantity ? totalAmount / quantity : 0;
        }

        if (!quantity || !unitPrice || !totalAmount) {
          alert('Please fill in quantity and price to record the sale.');
          setSaleSaving(false);
          return;
        }
      }

      const saleData: any = {
        harvestId: selectedHarvestId,
        buyerName,
        quantity,
        unit,
        unitPrice,
        totalAmount,
        status: saleStatus,
        projectId: activeProject.id,
        companyId: activeProject.companyId,
        cropType: activeProject.cropType,
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      // Only include brokerId if one was actually selected
      if (saleBrokerId) {
        saleData.brokerId = saleBrokerId;
      }

      await addDoc(collection(db, 'sales'), saleData);
      
      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-sales'] });
      
      setSaleOpen(false);
      setBuyerName('');
      setSelectedHarvestId('');
      setSaleQty('');
      setSaleUnitPrice('');
      setSaleTotal('');
      setSalePriceMode('perUnit');
      setSaleMode('kg');
      setCrateSize('big');
      setSaleStatus('pending');
      setSaleBrokerId('');
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
            <DialogContent className="sm:max-w-[90vw] md:max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Record Harvest</DialogTitle>
              </DialogHeader>
              {!activeProject ? (
                <p className="text-sm text-muted-foreground">
                  Select a project first to record a harvest.
                </p>
              ) : (
                <form onSubmit={handleRecordHarvest} className="space-y-4">
                  {activeProject.cropType === 'tomatoes' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Destination</label>
                      <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
                        <button
                          type="button"
                          className={cn(
                            'px-3 py-1 rounded-full border',
                            harvestDestination === 'farm'
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground'
                          )}
                          onClick={() => setHarvestDestination('farm')}
                        >
                          Sold from Farm
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'px-3 py-1 rounded-full border',
                            harvestDestination === 'market'
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground'
                          )}
                          onClick={() => setHarvestDestination('market')}
                        >
                          Going to Market
                        </button>
                      </div>
                    </div>
                  )}

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
                  {activeProject.cropType !== 'tomatoes' && (
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Quality</label>
                      <Select
                        value={harvestQuality}
                        onValueChange={(val) =>
                          setHarvestQuality(val as 'A' | 'B' | 'C')
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select quality" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">Grade A</SelectItem>
                          <SelectItem value="B">Grade B</SelectItem>
                          <SelectItem value="C">Grade C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {activeProject.cropType === 'tomatoes' && harvestDestination === 'farm' && (
                    <div className="space-y-3 border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground font-medium">Farm Pricing</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-foreground">Unit Type</label>
                          <Select
                            value={harvestFarmUnitType}
                            onValueChange={(val) =>
                              setHarvestFarmUnitType(val as 'crate-big' | 'crate-small' | 'kg')
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select unit type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="kg">Kilograms (kg)</SelectItem>
                              <SelectItem value="crate-big">Big crate</SelectItem>
                              <SelectItem value="crate-small">Small crate</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-foreground">Pricing mode</label>
                          <Select
                            value={harvestFarmPricingMode}
                            onValueChange={(val) =>
                              setHarvestFarmPricingMode(val as 'perUnit' | 'total')
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select pricing mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="perUnit">Price per unit</SelectItem>
                              <SelectItem value="total">Total amount</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          {harvestFarmPricingMode === 'perUnit' ? (
                            <>
                              <label className="text-sm font-medium text-foreground">Price per unit (KES)</label>
                              <input
                                type="number"
                                min={0}
                                className="fv-input"
                                value={harvestFarmUnitPrice}
                                onChange={(e) => setHarvestFarmUnitPrice(e.target.value)}
                              />
                            </>
                          ) : (
                            <>
                              <label className="text-sm font-medium text-foreground">Total amount (KES)</label>
                              <input
                                type="number"
                                min={0}
                                className="fv-input"
                                value={harvestFarmTotalPrice}
                                onChange={(e) => setHarvestFarmTotalPrice(e.target.value)}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeProject.cropType === 'tomatoes' && harvestDestination === 'market' && (
                    <div className="space-y-3 border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground font-medium">Going to market</p>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Lorry number plate(s)</label>
                        {harvestLorryPlates.map((plate, i) => (
                          <div key={i} className="flex gap-2 mt-1">
                            <input
                              className="fv-input flex-1"
                              value={plate}
                              onChange={(e) =>
                                setHarvestLorryPlates((prev) =>
                                  prev.map((p, j) => (j === i ? e.target.value : p))
                                )
                              }
                              placeholder="e.g. KCA 123A"
                            />
                            {harvestLorryPlates.length > 1 && (
                              <button
                                type="button"
                                className="fv-btn fv-btn--secondary shrink-0"
                                onClick={() =>
                                  setHarvestLorryPlates((prev) => prev.filter((_, j) => j !== i))
                                }
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline mt-1"
                          onClick={() => setHarvestLorryPlates((prev) => [...prev, ''])}
                        >
                          + Add another lorry
                        </button>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Driver</label>
                        <Select
                          value={harvestDriverType}
                          onValueChange={(val) => {
                            setHarvestDriverType(val as 'company' | 'other');
                            setHarvestDriverId('');
                            setHarvestDriverOtherName('');
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="company">Company driver</SelectItem>
                            <SelectItem value="other">Other (different company)</SelectItem>
                          </SelectContent>
                        </Select>
                        {harvestDriverType === 'company' && (
                          <Select
                            value={harvestDriverId || '__select__'}
                            onValueChange={(v) => setHarvestDriverId(v === '__select__' || v === '__no_drivers__' ? '' : v)}
                          >
                            <SelectTrigger className="w-full mt-1">
                              <SelectValue placeholder="Select driver" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__select__">Select driver</SelectItem>
                              {drivers.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name}
                                </SelectItem>
                              ))}
                              {drivers.length === 0 && (
                                <SelectItem value="__no_drivers__" disabled>
                                  No company drivers
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                        {harvestDriverType === 'other' && (
                          <input
                            className="fv-input w-full mt-1"
                            value={harvestDriverOtherName}
                            onChange={(e) => setHarvestDriverOtherName(e.target.value)}
                            placeholder="Driver name"
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Crate type</label>
                        <Select
                          value={harvestCrateType}
                          onValueChange={(val) =>
                            setHarvestCrateType(val as 'big' | 'small')
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select crate" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="big">Big crate</SelectItem>
                            <SelectItem value="small">Small crate</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Market</label>
                        <Select
                          value={harvestMarket}
                          onValueChange={setHarvestMarket}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select market" />
                          </SelectTrigger>
                          <SelectContent>
                            {DEFAULT_MARKETS.map((market) => (
                              <SelectItem key={market} value={market}>
                                {market}
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">Custom market…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {harvestMarket === 'custom' && (
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-foreground">Custom market name</label>
                          <input
                            className="fv-input"
                            value={harvestCustomMarket}
                            onChange={(e) => setHarvestCustomMarket(e.target.value)}
                            placeholder="Enter market name"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Broker</label>
                        <Select
                          value={harvestBrokerId || '__no_broker__'}
                          onValueChange={(val) => setHarvestBrokerId(val === '__no_broker__' ? '' : val)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select broker" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__no_broker__">No broker</SelectItem>
                            {brokers.map((broker) => (
                              <SelectItem key={broker.id} value={broker.id}>
                                {broker.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

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
                    <label className="text-sm font-medium text-foreground">Harvest (market-bound)</label>
                    <Select
                      value={selectedHarvestId}
                      onValueChange={setSelectedHarvestId}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={marketHarvests.length ? 'Select harvest going to market' : 'No market harvests available'} />
                      </SelectTrigger>
                      <SelectContent>
                        {marketHarvests.map((h) => (
                          <SelectItem key={h.id} value={h.id}>
                            {formatDate(h.date)} - {h.quantity.toLocaleString()} {h.unit}
                            {activeProject?.cropType !== 'tomatoes' ? ` (Grade ${h.quality})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!marketHarvests.length && (
                      <p className="text-xs text-muted-foreground">
                        Record a harvest with destination set to &quot;Going to Market&quot; to enable market sales.
                      </p>
                    )}
                  </div>

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
                      <label className="text-sm font-medium text-foreground">Sale status</label>
                      <Select
                        value={saleStatus}
                        onValueChange={(val) =>
                          setSaleStatus(val as 'pending' | 'partial' | 'completed' | 'cancelled')
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="completed">Paid / Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Broker (optional)</label>
                      <Select
                        value={saleBrokerId || '__no_broker__'}
                        onValueChange={(val) => setSaleBrokerId(val === '__no_broker__' ? '' : val)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select broker" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__no_broker__">No broker</SelectItem>
                          {brokers.map((broker) => (
                            <SelectItem key={broker.id} value={broker.id}>
                              {broker.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {activeProject.cropType === 'tomatoes' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Sale unit</label>
                        <Select
                          value={saleMode}
                          onValueChange={(val) => {
                            setSaleMode(val as 'crates' | 'kg');
                            // Reset line/field state on unit change
                            setSaleLines([{ qty: '', unitPrice: '' }]);
                            setSaleQty('');
                            setSaleUnitPrice('');
                            setSaleTotal('');
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="crates">Crates (big / small)</SelectItem>
                            <SelectItem value="kg">Kilograms (kg)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {saleMode === 'crates' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-foreground">Crate size</label>
                            <Select
                              value={crateSize}
                              onValueChange={(val) =>
                                setCrateSize(val as 'big' | 'small')
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select crate size" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="big">Big crate</SelectItem>
                                <SelectItem value="small">Small crate</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-foreground">
                                Price bands (crates × price per crate)
                              </p>
                              <button
                                type="button"
                                className="fv-btn fv-btn--secondary text-xs py-1 px-2"
                                onClick={() =>
                                  setSaleLines([...saleLines, { qty: '', unitPrice: '' }])
                                }
                              >
                                <Plus className="h-3 w-3" />
                                Add price band
                              </button>
                            </div>
                            <div className="space-y-2">
                              {saleLines.map((line, idx) => (
                                <div
                                  key={idx}
                                  className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-end"
                                >
                                  <div className="sm:col-span-3 space-y-1">
                                    <label className="text-xs text-muted-foreground">
                                      Number of crates
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      className="fv-input"
                                      value={line.qty}
                                      onChange={(e) => {
                                        const next = [...saleLines];
                                        next[idx] = { ...next[idx], qty: e.target.value };
                                        setSaleLines(next);
                                      }}
                                      placeholder="e.g. 50"
                                    />
                                  </div>
                                  <div className="sm:col-span-3 space-y-1">
                                    <label className="text-xs text-muted-foreground">
                                      Price per crate (KES)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      className="fv-input"
                                      value={line.unitPrice}
                                      onChange={(e) => {
                                        const next = [...saleLines];
                                        next[idx] = { ...next[idx], unitPrice: e.target.value };
                                        setSaleLines(next);
                                      }}
                                      placeholder="e.g. 1200"
                                    />
                                  </div>
                                  <div className="sm:col-span-1">
                                    <button
                                      type="button"
                                      className="fv-btn fv-btn--secondary w-full text-xs py-2"
                                      onClick={() => {
                                        if (saleLines.length === 1) {
                                          setSaleLines([{ qty: '', unitPrice: '' }]);
                                        } else {
                                          setSaleLines(saleLines.filter((_, i) => i !== idx));
                                        }
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {(() => {
                                const numericLines = saleLines
                                  .map((line) => ({
                                    q: parseNumber(line.qty),
                                    p: parseNumber(line.unitPrice),
                                  }))
                                  .filter((l) => l.q > 0 && l.p > 0);
                                const totalCrates = numericLines.reduce(
                                  (sum, l) => sum + l.q,
                                  0,
                                );
                                const totalValue = numericLines.reduce(
                                  (sum, l) => sum + l.q * l.p,
                                  0,
                                );
                                if (!totalCrates || !totalValue) {
                                  return 'Enter at least one quantity and price to see totals.';
                                }
                                const avgPrice = totalValue / totalCrates;
                                return `Total: ${totalCrates.toLocaleString()} crates • ${formatCurrency(
                                  totalValue,
                                )} (avg ~ KES ${avgPrice.toFixed(2)} per crate)`;
                              })()}
                            </div>
                          </div>
                        </>
                      )}

                      {saleMode === 'kg' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-foreground">Pricing mode</label>
                            <Select
                              value={salePriceMode}
                              onValueChange={(val) =>
                                setSalePriceMode(val as 'perUnit' | 'total')
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select pricing mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="perUnit">Price per kg</SelectItem>
                                <SelectItem value="total">Total amount</SelectItem>
                              </SelectContent>
                            </Select>
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
                        <Select
                          value={salePriceMode}
                          onValueChange={(val) =>
                            setSalePriceMode(val as 'perUnit' | 'total')
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select pricing mode" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="perUnit">Price per kg</SelectItem>
                            <SelectItem value="total">Total amount</SelectItem>
                          </SelectContent>
                        </Select>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h3 className="text-lg font-semibold">Harvest Records</h3>
          <div className="flex items-center gap-2 flex-wrap">
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
            <span className="text-xs text-muted-foreground">Filter</span>
            <Select
              value={harvestFilter}
              onValueChange={(val) =>
                setHarvestFilter(val as 'all' | 'farm' | 'market')
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="farm">Farm</SelectItem>
                <SelectItem value="market">Market</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadingHarvests && (
          <p className="text-sm text-muted-foreground mb-4">Loading harvests…</p>
        )}

        {harvests.length === 0 && !loadingHarvests && (
          <p className="text-sm text-muted-foreground">No harvests recorded yet.</p>
        )}

        {harvests.length > 0 && !loadingHarvests && harvestViewMode === 'list' && (
          <div className="overflow-x-auto">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Quantity</th>
                  <th>Quality</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {harvests
                  .filter((harvest) => {
                    if (harvestFilter === 'all') return true;
                    const dest = harvest.destination || 'farm';
                    return dest === harvestFilter;
                  })
                  .map((harvest) => {
                    const stock = harvestStock[harvest.id];
                    const soldOut = stock ? stock.remaining <= 0 : false;
                    return (
                      <tr
                        key={harvest.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/harvest-sales/harvest/${harvest.id}`)}
                      >
                        <td>{formatDate(harvest.date)}</td>
                        <td className="font-medium">{harvest.quantity.toLocaleString()} {harvest.unit}</td>
                        <td>
                          {harvest.cropType === 'tomatoes' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={cn('fv-badge', getQualityBadge(harvest.quality))}>
                              Grade {harvest.quality}
                            </span>
                          )}
                        </td>
                        <td>
                          {harvest.destination === 'market' ? (
                            <div className="space-y-0.5 text-xs">
                              <span className="fv-badge fv-badge--gold capitalize">Market</span>
                              <div className="text-muted-foreground">
                                {harvest.marketName || 'Market not set'}
                                {harvest.brokerName && <> • Broker: {harvest.brokerName}</>}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Farm</span>
                          )}
                        </td>
                        <td>
                          {soldOut && (
                            <span className="fv-badge bg-destructive/20 text-destructive text-xs">SOLD OUT</span>
                          )}
                          {!soldOut && stock && stock.sold > 0 && (
                            <span className="text-xs text-muted-foreground">Sold: {stock.sold.toLocaleString()}</span>
                          )}
                          {!soldOut && (!stock || stock.sold === 0) && <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-muted-foreground">{harvest.notes || '-'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
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
                                onClick={() => navigate(`/harvest-sales/harvest/${harvest.id}`)}
                              >
                                View details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {harvests.length > 0 && !loadingHarvests && harvestViewMode === 'card' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {harvests
              .filter((harvest) => {
                if (harvestFilter === 'all') return true;
                const dest = harvest.destination || 'farm';
                return dest === harvestFilter;
              })
              .map((harvest) => {
                const stock = harvestStock[harvest.id];
                const soldOut = stock ? stock.remaining <= 0 : false;
                const sold = stock?.sold ?? 0;
                return (
                  <div
                    key={harvest.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'relative p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors cursor-pointer',
                      soldOut && 'opacity-90',
                    )}
                    onClick={() => navigate(`/harvest-sales/harvest/${harvest.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/harvest-sales/harvest/${harvest.id}`);
                      }
                    }}
                  >
                    {soldOut && (
                      <div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-lg overflow-hidden"
                        aria-hidden
                      >
                        <span className="text-4xl font-black text-destructive/30 rotate-[-20deg] select-none">
                          SOLD OUT
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{harvest.quantity.toLocaleString()} {harvest.unit}</span>
                      {harvest.cropType !== 'tomatoes' && (
                        <span className={cn('fv-badge', getQualityBadge(harvest.quality))}>
                          Grade {harvest.quality}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{formatDate(harvest.date, { month: 'long' })}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {harvest.destination === 'market'
                        ? `Market: ${harvest.marketName || 'Not set'}${harvest.brokerName ? ` • Broker: ${harvest.brokerName}` : ''}`
                        : 'Destination: Farm'}
                    </p>
                    {sold > 0 && !soldOut && (
                      <p className="text-xs text-muted-foreground mt-2">Sold: {sold.toLocaleString()}</p>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Sales Section */}
      <div className="fv-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h3 className="text-lg font-semibold">Sales Records</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter by status</span>
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                <th>Broker</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales
                .filter((sale) =>
                  saleStatusFilter === 'all' ? true : sale.status === saleStatusFilter,
                )
                .map((sale) => {
                  const brokerName = sale.brokerId
                    ? brokers.find((b) => b.id === sale.brokerId)?.name
                    : null;
                  return (
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
                  <td className="text-sm text-muted-foreground">
                    {brokerName ?? '—'}
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
                        {sale.harvestId ? (
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => navigate(`/harvest-sales/harvest/${sale.harvestId}`)}
                          >
                            View harvest details
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="cursor-pointer" disabled>
                            No harvest linked
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3">
          {sales
            .filter((sale) =>
              saleStatusFilter === 'all' ? true : sale.status === saleStatusFilter,
            )
            .map((sale) => {
              const brokerName = sale.brokerId
                ? brokers.find((b) => b.id === sale.brokerId)?.name
                : null;
              return (
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
              <p className="text-xs text-muted-foreground mt-1">
                {brokerName ? `Broker: ${brokerName}` : 'No broker set'}
              </p>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}
