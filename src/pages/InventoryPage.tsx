import React, { useMemo, useState } from 'react';
import { Plus, Search, Package, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, writeBatch, increment } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { InventoryItem, InventoryCategory, ExpenseCategory, Supplier } from '@/types';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function InventoryPage() {
  const { activeProject } = useProject();
  const { data: allInventory = [], isLoading } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');
  const { data: suppliers = [] } = useCollection<Supplier>('suppliers', 'suppliers');

  const inventory = activeProject
    ? allInventory.filter(i => i.projectId === activeProject.id)
    : allInventory;

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  const getCategoryIcon = (category: string) => {
    return <Package className="h-5 w-5" />;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      fertilizer: 'bg-fv-gold-soft text-fv-olive',
      chemical: 'bg-fv-warning/10 text-fv-warning',
      diesel: 'bg-fv-info/10 text-fv-info',
      materials: 'bg-primary/10 text-primary',
    };
    return colors[category] || colors.other;
  };

  const isLowStock = (item: InventoryItem) =>
    item.quantity < (item.minThreshold ?? 10);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('fertilizer');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<'project' | 'crop' | 'all'>('project');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [countAsExpense, setCountAsExpense] = useState(false);

  const [restockOpen, setRestockOpen] = useState(false);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockTotalCost, setRestockTotalCost] = useState('');
  const [restockSaving, setRestockSaving] = useState(false);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setSaving(true);
    try {
      const cropType =
        scope === 'all' ? 'all' : activeProject.cropType;

      await addDoc(collection(db, 'inventoryItems'), {
        name,
        category,
        quantity: Number(quantity || '0'),
        unit,
        pricePerUnit: Number(pricePerUnit || '0'),
        companyId: activeProject.companyId,
        scope,
        cropType,
        supplierId: selectedSupplierId || undefined,
        supplierName: suppliers.find((s) => s.id === selectedSupplierId)?.name,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      if (countAsExpense) {
        const amount = Number(quantity || '0') * Number(pricePerUnit || '0');
        if (amount > 0) {
          const categoryMap: Record<InventoryCategory, ExpenseCategory> = {
            fertilizer: 'fertilizer',
            chemical: 'chemical',
            diesel: 'fuel',
            materials: 'other',
          };

          await addDoc(collection(db, 'expenses'), {
            companyId: activeProject.companyId,
            projectId: scope === 'project' ? activeProject.id : null,
            cropType: scope === 'all' ? null : activeProject.cropType,
            category: categoryMap[category],
            description: `Initial stock - ${name} (${quantity} ${unit})`,
            amount,
            date: serverTimestamp(),
            stageIndex: undefined,
            stageName: undefined,
            syncedFromWorkLogId: undefined,
            synced: false,
            paid: false,
            paidAt: undefined,
            paidBy: undefined,
            paidByName: undefined,
            createdAt: serverTimestamp(),
          });
        }
      }

      setAddOpen(false);
      setName('');
      setCategory('fertilizer');
      setQuantity('');
      setUnit('kg');
      setPricePerUnit('');
      setScope('project');
      setSelectedSupplierId('');
      setCountAsExpense(false);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenRestock = (item: InventoryItem) => {
    setRestockItem(item);
    setRestockQuantity('');
    setRestockTotalCost('');
    setRestockOpen(true);
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !restockItem) return;
    const qty = Number(restockQuantity || '0');
    const total = Number(restockTotalCost || '0');
    if (!qty || !total) return;

    setRestockSaving(true);
    try {
      const batch = writeBatch(db);

      const itemRef = doc(db, 'inventoryItems', restockItem.id);
      batch.update(itemRef, {
        quantity: increment(qty),
        lastUpdated: serverTimestamp(),
      });

      const purchaseRef = doc(collection(db, 'inventoryPurchases'));
      batch.set(purchaseRef, {
        companyId: restockItem.companyId,
        inventoryItemId: restockItem.id,
        quantityAdded: qty,
        unit: restockItem.unit,
        totalCost: total,
        pricePerUnit: qty ? total / qty : undefined,
        projectId: activeProject.id,
        date: serverTimestamp(),
        expenseId: null,
        createdAt: serverTimestamp(),
      });

      const categoryMap: Record<InventoryCategory, ExpenseCategory> = {
        fertilizer: 'fertilizer',
        chemical: 'chemical',
        diesel: 'fuel',
        materials: 'other',
      };

      const expenseRef = doc(collection(db, 'expenses'));
      batch.set(expenseRef, {
        companyId: restockItem.companyId,
        projectId: activeProject.id,
        cropType: activeProject.cropType,
        category: categoryMap[restockItem.category],
        description: `Restock ${restockItem.name} (${qty} ${restockItem.unit})`,
        amount: total,
        date: serverTimestamp(),
        stageIndex: undefined,
        stageName: undefined,
        syncedFromWorkLogId: undefined,
        synced: false,
        paid: false,
        paidAt: undefined,
        paidBy: undefined,
        paidByName: undefined,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      setRestockOpen(false);
    } finally {
      setRestockSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Managing inventory for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'Track and manage all inventory items'
            )}
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <button className="fv-btn fv-btn--primary" disabled={!activeProject}>
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
            </DialogHeader>
            {!activeProject ? (
              <p className="text-sm text-muted-foreground">
                Select a project first to add an inventory item.
              </p>
            ) : (
              <form onSubmit={handleAddItem} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Item name</label>
                  <input
                    className="fv-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Crop scope</label>
                  <select
                    className="fv-select w-full"
                    value={scope}
                    onChange={(e) => setScope(e.target.value as typeof scope)}
                  >
                    <option value="project">This project only</option>
                    <option value="crop">All projects for this crop</option>
                    <option value="all">All crops (general stock)</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Category</label>
                    <select
                      className="fv-select w-full"
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as InventoryCategory)
                      }
                    >
                      <option value="fertilizer">Fertilizer</option>
                    <option value="chemical">Chemical</option>
                    <option value="diesel">Diesel</option>
                    <option value="materials">Materials</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Unit</label>
                    <input
                      className="fv-input"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Supplier (optional)</label>
                  <select
                    className="fv-select w-full"
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                  >
                    <option value="">No supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Quantity</label>
                    <input
                      type="number"
                      min={0}
                      className="fv-input"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Unit Price (KES)</label>
                    <input
                      type="number"
                      min={0}
                      className="fv-input"
                      value={pricePerUnit}
                      onChange={(e) => setPricePerUnit(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="count-as-expense"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={countAsExpense}
                    onChange={(e) => setCountAsExpense(e.target.checked)}
                  />
                  <label htmlFor="count-as-expense" className="text-sm text-foreground">
                    Also create an expense for this purchase
                  </label>
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
                    {saving ? 'Saving…' : 'Save Item'}
                  </button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Restock dialog */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restock Inventory</DialogTitle>
          </DialogHeader>
          {!activeProject || !restockItem ? (
            <p className="text-sm text-muted-foreground">
              Select a project and item to restock.
            </p>
          ) : (
            <form onSubmit={handleRestock} className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {restockItem.name} ({restockItem.unit})
                </p>
                <p className="text-xs text-muted-foreground">
                  Current stock: {restockItem.quantity} {restockItem.unit}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Quantity to add</label>
                  <input
                    type="number"
                    min={0}
                    className="fv-input"
                    value={restockQuantity}
                    onChange={(e) => setRestockQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Total cost (KES)</label>
                  <input
                    type="number"
                    min={0}
                    className="fv-input"
                    value={restockTotalCost}
                    onChange={(e) => setRestockTotalCost(e.target.value)}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  onClick={() => setRestockOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={restockSaving}
                  className="fv-btn fv-btn--primary"
                >
                  {restockSaving ? 'Saving…' : 'Save Restock'}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="fv-card">
          <p className="text-sm text-muted-foreground mb-1">Total Items</p>
          <p className="text-2xl font-bold">{inventory.length}</p>
        </div>
        <div className="fv-card">
          <p className="text-sm text-muted-foreground mb-1">Total Value</p>
          <p className="text-2xl font-bold">
            {formatCurrency(inventory.reduce((sum, i) => sum + (i.quantity * (i.pricePerUnit || 0)), 0))}
          </p>
        </div>
        <div className="fv-card">
          <p className="text-sm text-muted-foreground mb-1">Low Stock Alerts</p>
          <p className="text-2xl font-bold text-fv-warning">
            {inventory.filter(isLowStock).length}
          </p>
        </div>
        <div className="fv-card">
          <p className="text-sm text-muted-foreground mb-1">Suppliers</p>
          <p className="text-2xl font-bold">
            {new Set(inventory.map(i => i.supplierId)).size}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search inventory..."
            className="fv-input pl-10"
          />
        </div>
        <select className="fv-select">
          <option value="">All Categories</option>
          <option value="seeds">Seeds</option>
          <option value="fertilizers">Fertilizers</option>
          <option value="pesticides">Pesticides</option>
          <option value="equipment">Equipment</option>
        </select>
      </div>

      {/* Inventory Table */}
      <div className="fv-card">
        {isLoading && (
          <p className="text-sm text-muted-foreground mb-4">Loading inventory…</p>
        )}
        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total Value</th>
                <th>Supplier</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', getCategoryColor(item.category))}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">{item.name}</span>
                        {isLowStock(item) && (
                          <div className="flex items-center gap-1 text-xs text-fv-warning mt-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            Low Stock
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={cn('fv-badge capitalize', getCategoryColor(item.category))}>
                      {item.category}
                    </span>
                  </td>
                  <td className={cn('font-medium', isLowStock(item) && 'text-fv-warning')}>
                    {item.quantity} {item.unit}
                  </td>
                  <td>{formatCurrency(item.pricePerUnit || 0)}</td>
                  <td className="font-medium">{formatCurrency(item.quantity * (item.pricePerUnit || 0))}</td>
                  <td className="text-muted-foreground">{item.supplierName || '-'}</td>
                  <td>
                    <button
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                      onClick={() => handleOpenRestock(item)}
                    >
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
          {inventory.map((item) => (
            <div key={item.id} className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', getCategoryColor(item.category))}>
                    {getCategoryIcon(item.category)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{item.category}</p>
                  </div>
                </div>
                {isLowStock(item) && (
                  <span className="fv-badge fv-badge--warning text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Low
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <span className="ml-1 font-medium">{item.quantity} {item.unit}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Value:</span>
                  <span className="ml-1 font-medium">{formatCurrency(item.quantity * (item.pricePerUnit || 0))}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
