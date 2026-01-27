import React, { useMemo, useState } from 'react';
import { Plus, Search, Package, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, writeBatch, increment } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { InventoryItem, InventoryCategory, ExpenseCategory, Supplier, CropType, InventoryCategoryItem } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient } from '@tanstack/react-query';
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

export default function InventoryPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const { data: allInventory = [], isLoading } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');
  const { data: suppliers = [] } = useCollection<Supplier>('suppliers', 'suppliers');
  
  // Fetch categories for the company
  const { data: allCategories = [] } = useCollection<InventoryCategoryItem>(
    'inventoryCategories',
    'inventoryCategories',
  );
  
  const categories = useMemo(() => {
    if (!user?.companyId) return [];
    return allCategories.filter((cat) => cat.companyId === user.companyId);
  }, [allCategories, user?.companyId]);
  
  // Default categories if none exist
  const defaultCategories = ['fertilizer', 'chemical', 'diesel', 'materials'];
  const availableCategories = useMemo(() => {
    const categoryNames = categories.map((cat) => cat.name.toLowerCase());
    const defaults = defaultCategories.filter((def) => !categoryNames.includes(def));
    return [
      ...categories.map((cat) => cat.name),
      ...defaults,
    ].sort();
  }, [categories]);

  // Always show all inventory items for the company; project context is used
  // only for optional filtering and expense linkage.
  const inventory = allInventory;

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
  const [category, setCategory] = useState<string>('fertilizer');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedCrops, setSelectedCrops] = useState<CropType[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [countAsExpense, setCountAsExpense] = useState(false);

  const [restockOpen, setRestockOpen] = useState(false);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockTotalCost, setRestockTotalCost] = useState('');
  const [restockSaving, setRestockSaving] = useState(false);

  const [cropFilter, setCropFilter] = useState<'all' | CropType>('all');

  const cropOptions: CropType[] = ['tomatoes', 'french-beans', 'capsicum', 'maize', 'watermelons', 'rice'];

  const toggleCropSelection = (crop: CropType) => {
    setSelectedCrops((prev) =>
      prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop],
    );
  };

  const filteredInventory =
    cropFilter === 'all'
      ? inventory
      : inventory.filter((item) => {
          if (Array.isArray(item.cropTypes) && item.cropTypes.length) {
            return item.cropTypes.includes(cropFilter);
          }
          if (item.cropType && item.cropType !== 'all') {
            return item.cropType === cropFilter;
          }
          // Items without explicit crop binding are treated as general stock.
          return true;
        });

  const handleAddCategory = async (categoryName: string) => {
    if (!user?.companyId || !categoryName.trim()) return;
    
    // Check if category already exists
    const normalizedName = categoryName.trim().toLowerCase();
    const exists = categories.some(
      (cat) => cat.name.toLowerCase() === normalizedName,
    );
    
    if (exists) {
      setCategory(categoryName.trim());
      setShowNewCategoryInput(false);
      setNewCategoryName('');
      return;
    }
    
    // Add new category to Firebase
    await addDoc(collection(db, 'inventoryCategories'), {
      name: categoryName.trim(),
      companyId: user.companyId,
      createdAt: serverTimestamp(),
    });
    
    setCategory(categoryName.trim());
    setShowNewCategoryInput(false);
    setNewCategoryName('');
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event from bubbling up
    if (!activeProject) return;
    setSaving(true);
    try {
      // If a new category was entered, add it first
      let finalCategory = category.toLowerCase();
      if (showNewCategoryInput && newCategoryName.trim()) {
        const categoryName = newCategoryName.trim();
        // Check if category already exists
        const normalizedName = categoryName.toLowerCase();
        const exists = categories.some(
          (cat) => cat.name.toLowerCase() === normalizedName,
        );
        
        if (!exists) {
          // Add new category to Firebase
          await addDoc(collection(db, 'inventoryCategories'), {
            name: categoryName,
            companyId: user?.companyId || activeProject.companyId,
            createdAt: serverTimestamp(),
          });
        }
        finalCategory = normalizedName;
      }
      
      const data: any = {
        name,
        category: finalCategory,
        quantity: Number(quantity || '0'),
        unit,
        pricePerUnit: Number(pricePerUnit || '0'),
        companyId: activeProject.companyId,
        supplierId: selectedSupplierId || undefined,
        supplierName: suppliers.find((s) => s.id === selectedSupplierId)?.name,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      if (selectedCrops.length) {
        data.cropTypes = selectedCrops;
      }

      await addDoc(collection(db, 'inventoryItems'), data);

      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-inventory'] });

      if (countAsExpense) {
        const amount = Number(quantity || '0') * Number(pricePerUnit || '0');
        if (amount > 0) {
          const categoryMap: Record<string, ExpenseCategory> = {
            fertilizer: 'fertilizer',
            chemical: 'chemical',
            diesel: 'fuel',
            materials: 'other',
          };

          await addDoc(collection(db, 'expenses'), {
            companyId: activeProject.companyId,
            projectId: activeProject.id,
            cropType: activeProject.cropType,
            category: categoryMap[finalCategory] || 'other',
            description: `Initial stock - ${name} (${quantity} ${unit})`,
            amount,
            date: serverTimestamp(),
            // Optional linkage fields (stage*, syncedFromWorkLogId, paidAt, etc.)
            // are intentionally omitted here when unknown to avoid sending `undefined`.
            synced: false,
            paid: false,
            createdAt: serverTimestamp(),
          });
          
          // Invalidate expenses query
          queryClient.invalidateQueries({ queryKey: ['expenses'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
        }
      }

      setName('');
      setCategory(availableCategories[0]?.toLowerCase() || 'fertilizer');
      setNewCategoryName('');
      setShowNewCategoryInput(false);
      setQuantity('');
      setUnit('kg');
      setPricePerUnit('');
      setSelectedCrops([]);
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
        // Optional linkage fields are omitted when unknown to avoid `undefined` values.
        synced: false,
        paid: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      
      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
      
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
        <Dialog 
          open={addOpen} 
          onOpenChange={(open) => {
            // Allow opening the dialog
            if (open) {
              setAddOpen(true);
            } else {
              // Only allow closing if not currently saving
              // This prevents the dialog from closing during form submission or select interactions
              if (!saving) {
                setAddOpen(false);
              }
            }
          }}
        >
          <DialogTrigger asChild>
            <button className="fv-btn fv-btn--primary">
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
            </DialogHeader>
            {!activeProject ? (
              <p className="text-sm text-muted-foreground">
                Select a project first to add an inventory item.
              </p>
            ) : (
              <form 
                onSubmit={handleAddItem} 
                className="space-y-4"
                onKeyDown={(e) => {
                  // Prevent Enter key from closing dialog if pressed in form
                  if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
                    // Allow normal form submission
                  }
                }}
              >
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
                  <label className="text-sm font-medium text-foreground">Crop scope (optional)</label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Select the crops this item is used for. Leave all unchecked to make it available for all crops.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {cropOptions.map((crop) => (
                      <button
                        key={crop}
                        type="button"
                        onClick={() => toggleCropSelection(crop)}
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs',
                          selectedCrops.includes(crop)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-foreground',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-3 w-3 items-center justify-center rounded-[3px] border',
                            selectedCrops.includes(crop)
                              ? 'border-primary bg-primary'
                              : 'border-muted bg-background',
                          )}
                        >
                          {selectedCrops.includes(crop) && (
                            <span className="block h-2 w-2 bg-background rounded-[2px]" />
                          )}
                        </span>
                        <span className="capitalize">{crop.replace('-', ' ')}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Category</label>
                    {!showNewCategoryInput ? (
                      <div className="flex gap-2">
                        <Select
                          value={category}
                          onValueChange={(value) => {
                            if (value === '__new__') {
                              setShowNewCategoryInput(true);
                            } else {
                              setCategory(value);
                            }
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableCategories.map((cat) => (
                              <SelectItem key={cat} value={cat.toLowerCase()}>
                                {cat.charAt(0).toUpperCase() + cat.slice(1)}
                              </SelectItem>
                            ))}
                            <SelectItem value="__new__">
                              <span className="flex items-center gap-2">
                                <Plus className="h-3 w-3" />
                                Add new category
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          className="fv-input flex-1"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Enter new category name"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newCategoryName.trim()) {
                                handleAddCategory(newCategoryName);
                              }
                            } else if (e.key === 'Escape') {
                              setShowNewCategoryInput(false);
                              setNewCategoryName('');
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newCategoryName.trim()) {
                              handleAddCategory(newCategoryName);
                            } else {
                              setShowNewCategoryInput(false);
                            }
                          }}
                          className="fv-btn fv-btn--primary px-3"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewCategoryInput(false);
                            setNewCategoryName('');
                          }}
                          className="fv-btn fv-btn--secondary px-3"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
                  <Select
                    value={selectedSupplierId || '__none__'}
                    onValueChange={(value) => setSelectedSupplierId(value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="No supplier" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="__none__">No supplier</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    onClick={(e) => {
                      // Prevent any default close behavior
                      e.stopPropagation();
                    }}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Total Items"
          value={inventory.length}
          layout="vertical"
        />
        <SimpleStatCard
          title="Total Value"
          value={formatCurrency(inventory.reduce((sum, i) => sum + (i.quantity * (i.pricePerUnit || 0)), 0))}
          layout="vertical"
        />
        <SimpleStatCard
          title="Low Stock Alerts"
          value={inventory.filter(isLowStock).length}
          icon={AlertTriangle}
          iconVariant="warning"
          valueVariant="warning"
          layout="vertical"
        />
        <SimpleStatCard
          title="Suppliers"
          value={new Set(inventory.map(i => i.supplierId)).size}
          layout="vertical"
        />
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
        <Select
          value={cropFilter}
          onValueChange={(value) => setCropFilter(value as 'all' | CropType)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All crops" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All crops</SelectItem>
            {cropOptions.map((crop) => (
              <SelectItem key={crop} value={crop}>
                {crop.replace('-', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              {filteredInventory.map((item) => (
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
          {filteredInventory.map((item) => (
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
