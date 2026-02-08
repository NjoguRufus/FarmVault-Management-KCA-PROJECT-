import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Plus, Search, Package, MoreHorizontal, AlertTriangle, ShoppingCart, Minus, Trash2, ScrollText } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, writeBatch, increment, updateDoc, deleteDoc } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { InventoryItem, InventoryCategory, ExpenseCategory, Supplier, CropType, InventoryCategoryItem, NeededItem, ChemicalPackagingType, FuelType } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { createInventoryAuditLog } from '@/services/inventoryAuditLogService';
import { parseQuantityOrFraction } from '@/lib/utils';

export default function InventoryPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allInventory = [], isLoading } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');
  const { data: suppliers = [] } = useCollection<Supplier>('suppliers', 'suppliers');
  const { data: neededItems = [] } = useCollection<NeededItem>('neededItems', 'neededItems');
  
  // Fetch categories for the company
  const { data: allCategories = [] } = useCollection<InventoryCategoryItem>(
    'inventoryCategories',
    'inventoryCategories',
  );
  
  const categories = useMemo(() => {
    if (!user?.companyId) return [];
    return allCategories.filter((cat) => cat.companyId === user.companyId);
  }, [allCategories, user?.companyId]);
  
  // Default categories if none exist (fuel replaces diesel in display)
  const defaultCategories = ['fertilizer', 'chemical', 'fuel', 'materials', 'sacks', 'ropes', 'wooden-crates', 'seeds'];
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
    const icons: Record<string, string> = {
      fertilizer: '🌾',
      chemical: '🧪',
      fuel: '⛽',
      diesel: '⛽',
      materials: '🔧',
      sacks: '🛍️',
      ropes: '🪢',
      'wooden-crates': '📦',
      seeds: '🌱',
    };
    return <span className="text-2xl">{icons[category.toLowerCase()] || '📦'}</span>;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      fertilizer: 'bg-fv-gold-soft text-fv-olive',
      chemical: 'bg-fv-warning/10 text-fv-warning',
      fuel: 'bg-fv-info/10 text-fv-info',
      diesel: 'bg-fv-info/10 text-fv-info',
      materials: 'bg-primary/10 text-primary',
      sacks: 'bg-amber-100 text-amber-800',
      ropes: 'bg-slate-200 text-slate-800',
      'wooden-crates': 'bg-amber-50 text-amber-900',
      seeds: 'bg-emerald-100 text-emerald-800',
    };
    return colors[category] || colors.other;
  };

  const getCategoryDisplayName = (cat: string) => {
    if (cat === 'wooden-crates') return 'Wooden crates';
    if (cat === 'diesel') return 'Fuel';
    if (cat === 'seeds') return 'Seeds';
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  const isLowStock = (item: InventoryItem) =>
    item.quantity < (item.minThreshold ?? 10);

  const formatInventoryQuantity = (item: InventoryItem) => {
    const cat = (item.category || '').toLowerCase();
    const it = item as InventoryItem & { packagingType?: string; unitsPerBox?: number; fuelType?: string; containers?: number; litres?: number; bags?: number; kgs?: number };
    if (cat === 'chemical' && it.packagingType === 'box' && it.unitsPerBox) {
      const total = item.quantity * it.unitsPerBox;
      return `${item.quantity} boxes (${it.unitsPerBox}/box) = ${total} units`;
    }
    if (cat === 'chemical' && it.packagingType === 'single') return `${item.quantity} units`;
    if ((cat === 'fuel' || cat === 'diesel') && (it.containers != null || it.fuelType)) {
      const sub = it.fuelType ? ` ${it.fuelType}` : '';
      const lit = it.litres != null ? `, ${it.litres} L` : '';
      return `${item.quantity} containers${sub}${lit}`;
    }
    if (cat === 'fertilizer' && (it.bags != null || item.unit === 'bags')) {
      const b = it.bags ?? item.quantity;
      const k = it.kgs != null ? `, ${it.kgs} kg` : '';
      return `${b} bags${k}`;
    }
    const itBox = item as InventoryItem & { boxSize?: 'big' | 'small' };
    if (cat === 'wooden-crates' && itBox.boxSize) {
      const size = itBox.boxSize === 'big' ? 'Big box' : 'Small box';
      return `${item.quantity} ${size}`;
    }
    return `${item.quantity} ${item.unit}`;
  };

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('fertilizer');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedCrops, setSelectedCrops] = useState<CropType[]>([]);
  const [seedCrop, setSeedCrop] = useState<CropType | ''>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [countAsExpense, setCountAsExpense] = useState(false);

  // Category-specific fields
  const [chemicalPackaging, setChemicalPackaging] = useState<ChemicalPackagingType>('box');
  const [unitsPerBox, setUnitsPerBox] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [containers, setContainers] = useState('');
  const [litres, setLitres] = useState('');
  const [bags, setBags] = useState('');
  const [kgs, setKgs] = useState('');
  const [boxSize, setBoxSize] = useState<'big' | 'small'>('big');

  const [restockOpen, setRestockOpen] = useState(false);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockTotalCost, setRestockTotalCost] = useState('');
  const [restockSaving, setRestockSaving] = useState(false);

  const [deductOpen, setDeductOpen] = useState(false);
  const [deductItem, setDeductItem] = useState<InventoryItem | null>(null);
  const [deductQuantity, setDeductQuantity] = useState('');
  const [deductReason, setDeductReason] = useState('');
  const [deductSaving, setDeductSaving] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const logInventoryAudit = useCallback(
    async (
      actionType: 'RESTOCK' | 'DEDUCT' | 'DELETE',
      targetId: string,
      itemName: string,
      metadata?: Record<string, unknown>,
    ) => {
      if (!user?.companyId || !user?.id) return;
      try {
        await createInventoryAuditLog({
          companyId: user.companyId,
          actorUid: user.id,
          actorEmail: user.email ?? '',
          actorName: user.name,
          actionType,
          targetId,
          metadata: { itemName, ...metadata },
        });
      } catch (e) {
        console.error('Failed to write inventory audit log', e);
      }
    },
    [user],
  );

  const [cropFilter, setCropFilter] = useState<'all' | CropType>('all');
  const [inventoryAuditOpen, setInventoryAuditOpen] = useState(false);

  /** Effective quantity for add-item form (used for total amount = qty * price per unit). */
  const effectiveQuantityForAdd = useMemo(() => {
    const cat = category.toLowerCase();
    if (cat === 'fertilizer') return Number(quantity || '0') || 0;
    if (cat === 'fuel' || cat === 'diesel') return Number(containers || '0') || 0;
    if (cat === 'chemical') return Number(quantity || '0') || 0;
    if (cat === 'wooden-crates' || cat === 'seeds') return Number(quantity || '0') || 0;
    return Number(quantity || '0') || 0;
  }, [category, quantity, containers]);

  // Keep Price per unit and Total amount in sync in real time
  useEffect(() => {
    if (effectiveQuantityForAdd <= 0) return;
    const price = Number(pricePerUnit || '0');
    const total = price * effectiveQuantityForAdd;
    setTotalAmount(total.toFixed(2));
  }, [effectiveQuantityForAdd, pricePerUnit]);

  const [neededOpen, setNeededOpen] = useState(false);
  const [neededItemName, setNeededItemName] = useState('');
  const [neededItemCategory, setNeededItemCategory] = useState('');
  const [neededItemQuantity, setNeededItemQuantity] = useState('');
  const [neededItemUnit, setNeededItemUnit] = useState('kg');
  const [neededItemSaving, setNeededItemSaving] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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
  
  const { data: inventoryAuditLogs = [], isLoading: inventoryAuditLoading } = useQuery({
    queryKey: ['inventory-audit-logs', inventoryAuditOpen],
    queryFn: () => getInventoryAuditLogs(200),
    enabled: inventoryAuditOpen,
  });
  const companyInventoryAuditLogs = useMemo(() => {
    if (!user?.companyId) return [];
    return inventoryAuditLogs.filter((log) => log.companyId === user.companyId);
  }, [inventoryAuditLogs, user?.companyId]);

  /** Format audit log for display: human-readable action label and details. */
  const formatAuditLogDisplay = useCallback(
    (log: { actionType: string; metadata?: Record<string, unknown> }) => {
      const meta = (log.metadata || {}) as Record<string, unknown>;
      const actionLabel =
        log.actionType === 'RESTOCK'
          ? 'Restocked'
          : log.actionType === 'DEDUCT'
            ? 'Deducted'
            : log.actionType === 'DELETE'
              ? 'Deleted'
              : log.actionType === 'ADD_ITEM'
                ? 'Item added'
                : log.actionType === 'ADD_NEEDED'
                  ? 'Added to needed'
                  : log.actionType;
      let details = '';
      if (log.actionType === 'RESTOCK') {
        const qty = meta.quantityAdded != null ? String(meta.quantityAdded) : '';
        const unit = (meta.unit as string) || '';
        const cost = meta.totalCost != null ? Number(meta.totalCost) : null;
        if (qty && unit) details = `Added ${qty} ${unit}.`;
        if (cost != null && details) details += ` Total cost: KES ${cost.toLocaleString()}.`;
        else if (cost != null) details = `Total cost: KES ${cost.toLocaleString()}.`;
      } else if (log.actionType === 'DEDUCT') {
        const qty = meta.quantityDeducted != null ? String(meta.quantityDeducted) : '';
        const unit = (meta.unit as string) || '';
        const reason = (meta.reason as string) || '';
        if (qty && unit) details = `Deducted ${qty} ${unit}.`;
        if (reason) details += details ? ` Reason: ${reason}.` : `Reason: ${reason}.`;
      } else if (log.actionType === 'DELETE') {
        details = 'Item removed from inventory.';
      } else if (log.actionType === 'ADD_ITEM') {
        const qty = meta.quantity != null ? String(meta.quantity) : '';
        const unit = (meta.unit as string) || '';
        const category = (meta.category as string) || '';
        if (qty && unit) details = `Initial quantity: ${qty} ${unit}.`;
        if (category) details += details ? ` Category: ${category}.` : `Category: ${category}.`;
      } else if (log.actionType === 'ADD_NEEDED') {
        const qty = meta.quantity != null ? String(meta.quantity) : '';
        const unit = (meta.unit as string) || '';
        const category = (meta.category as string) || '';
        if (qty && unit) details = `Quantity needed: ${qty} ${unit}.`;
        if (category) details += details ? ` Category: ${category}.` : `Category: ${category}.`;
      }
      return { actionLabel, details: details || '—' };
    },
    [],
  );

  // Filter needed items for current company/project
  const filteredNeededItems = useMemo(() => {
    if (!user?.companyId) return [];
    return neededItems.filter(item => {
      if (item.companyId !== user.companyId) return false;
      if (activeProject && item.projectId && item.projectId !== activeProject.id) return false;
      return item.status === 'pending';
    });
  }, [neededItems, user?.companyId, activeProject]);

  // Get items for selected category
  const categoryItemsList = useMemo(() => {
    if (!selectedCategory) return [];
    return filteredInventory.filter(
      item => item.category.toLowerCase() === selectedCategory.toLowerCase()
    );
  }, [filteredInventory, selectedCategory]);

  const handleCategoryCardClick = (category: string) => {
    setSelectedCategory(category);
    setCategoryDrawerOpen(true);
  };

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
    const companyId = user?.companyId ?? activeProject?.companyId;
    if (!companyId) {
      toast.error('You must be in a company to add inventory.');
      return;
    }
    const cat = category.toLowerCase();
    if (cat === 'chemical' && chemicalPackaging === 'box' && !Number(unitsPerBox || '0')) {
      toast.error('Enter units per box (e.g. bottles or packets per box)');
      return;
    }
    if ((cat === 'fuel' || cat === 'diesel') && !Number(containers || '0')) {
      toast.error('Enter number of containers (mtungi)');
      return;
    }
    if (cat === 'fertilizer' && !Number(quantity || '0')) {
      toast.error('Enter quantity for fertilizer');
      return;
    }
    if (cat === 'wooden-crates' && !Number(quantity || '0')) {
      toast.error('Enter number of wooden boxes');
      return;
    }
    if (cat === 'seeds' && !Number(quantity || '0')) {
      toast.error('Enter quantity for seeds');
      return;
    }
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
          await addDoc(collection(db, 'inventoryCategories'), {
            name: categoryName,
            companyId: user?.companyId ?? activeProject?.companyId,
            createdAt: serverTimestamp(),
          });
        }
        finalCategory = normalizedName;
      }
      
      const cat = finalCategory.toLowerCase();
      const data: Record<string, unknown> = {
        name,
        category: (cat === 'fuel' || cat === 'diesel') ? 'fuel' : cat,
        quantity: 0,
        unit: 'kg',
        pricePerUnit: Number(pricePerUnit || '0'),
        companyId,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      if (cat === 'chemical') {
        const isBox = chemicalPackaging === 'box';
        data.packagingType = chemicalPackaging;
        if (isBox) {
          const numBoxes = Number(quantity || '0');
          const perBox = Number(unitsPerBox || '0');
          data.quantity = numBoxes;
          data.unit = 'boxes';
          data.unitsPerBox = perBox;
        } else {
          data.quantity = Number(quantity || '0');
          data.unit = 'units';
        }
        if (kgs.trim()) data.kgs = Number(kgs);
      } else if (cat === 'fuel' || cat === 'diesel') {
        const cont = Number(containers || '0');
        const lit = litres.trim() ? Number(litres) : undefined;
        data.quantity = cont;
        data.unit = 'containers';
        data.fuelType = cat === 'diesel' ? 'diesel' : fuelType;
        data.containers = cont;
        if (lit != null) data.litres = lit;
      } else if (cat === 'fertilizer') {
        const q = Number(quantity || '0');
        const u = (unit || 'bags').toLowerCase();
        data.quantity = q;
        data.unit = u;
        if (u === 'bags') {
          data.bags = q;
          if (kgs.trim()) data.kgs = Number(kgs);
        }
        if (u === 'kg') data.kgs = q;
      } else if (cat === 'seeds') {
        data.quantity = Number(quantity || '0');
        data.unit = unit || 'packets';
        if (seedCrop) data.cropTypes = [seedCrop];
      } else {
        data.quantity = Number(quantity || '0');
        data.unit = unit;
      }

      if (selectedSupplierId) {
        data.supplierId = selectedSupplierId;
        const supplier = suppliers.find((s) => s.id === selectedSupplierId);
        if (supplier?.name) data.supplierName = supplier.name;
        if (pickupDate.trim()) data.pickupDate = pickupDate.trim();
      }

      if (cat !== 'seeds' && selectedCrops.length) {
        data.cropTypes = selectedCrops;
      }

      const itemRef = await addDoc(collection(db, 'inventoryItems'), data);
      if (user?.companyId && user?.id) {
        await createInventoryAuditLog({
          companyId: user.companyId,
          actorUid: user.id,
          actorEmail: user.email ?? '',
          actorName: user.name,
          actionType: 'ADD_ITEM',
          targetId: itemRef.id,
          metadata: { itemName: name, category: (cat === 'fuel' || cat === 'diesel') ? 'fuel' : cat, quantity: data.quantity, unit: data.unit },
        });
      }

      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-audit-logs'] });

      if (countAsExpense && activeProject) {
        let descQty = quantity;
        let descUnit = unit;
        if (cat === 'chemical' && chemicalPackaging === 'box' && unitsPerBox) {
          descQty = quantity;
          descUnit = `boxes (${unitsPerBox} per box)`;
        } else if (cat === 'fuel') {
          descQty = containers;
          descUnit = litres.trim() ? `${containers} containers, ${litres} L` : 'containers';
        } else if (cat === 'fertilizer') {
          descQty = quantity;
          descUnit = `${quantity} ${unit || 'bags'}`;
        } else if (cat === 'wooden-crates') {
          descQty = quantity;
          descUnit = `${boxSize === 'big' ? 'Big' : 'Small'} wooden box`;
        } else if (cat === 'seeds') {
          descQty = quantity;
          descUnit = `${quantity} ${unit || 'packets'}`;
        }
        const qtyNum = Number(quantity || '0') || Number(containers || '0');
        const amount = qtyNum * Number(pricePerUnit || '0');
        const categoryMap: Record<string, ExpenseCategory> = {
          fertilizer: 'fertilizer',
          chemical: 'chemical',
          fuel: 'fuel',
          diesel: 'fuel',
          materials: 'other',
          sacks: 'other',
          ropes: 'other',
          'wooden-crates': 'other',
          seeds: 'other',
        };
        const expenseData: Record<string, unknown> = {
          companyId: activeProject.companyId,
          projectId: activeProject.id,
          category: categoryMap[finalCategory] || 'other',
          description: `Initial stock - ${name} (${descQty} ${descUnit})`,
          amount,
          date: serverTimestamp(),
          synced: false,
          paid: false,
          createdAt: serverTimestamp(),
        };
        if (activeProject.cropType) expenseData.cropType = activeProject.cropType;
        await addDoc(collection(db, 'expenses'), expenseData);
        queryClient.invalidateQueries({ queryKey: ['expenses'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
      }

      setName('');
      setCategory(availableCategories[0]?.toLowerCase() || 'fertilizer');
      setNewCategoryName('');
      setShowNewCategoryInput(false);
      setQuantity('');
      setUnit('kg');
      setPricePerUnit('');
      setTotalAmount('');
      setSelectedCrops([]);
      setSeedCrop('');
      setSelectedSupplierId('');
      setPickupDate('');
      setCountAsExpense(false);
      setChemicalPackaging('box');
      setUnitsPerBox('');
      setFuelType('diesel');
      setContainers('');
      setLitres('');
      setBags('');
      setKgs('');
      setBoxSize('big');
      setAddOpen(false);
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

  const handleOpenDeduct = (item: InventoryItem) => {
    setDeductItem(item);
    setDeductQuantity('');
    setDeductReason('');
    setDeductOpen(true);
  };

  const handleDeduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deductItem || !user?.companyId) return;
    const qty = parseQuantityOrFraction(deductQuantity);
    if (qty <= 0) {
      toast.error('Enter a valid quantity to deduct.');
      return;
    }
    if (qty > deductItem.quantity) {
      toast.error(`Cannot deduct more than current stock (${deductItem.quantity} ${deductItem.unit}).`);
      return;
    }
    setDeductSaving(true);
    try {
      const itemRef = doc(db, 'inventoryItems', deductItem.id);
      await updateDoc(itemRef, {
        quantity: increment(-qty),
        lastUpdated: serverTimestamp(),
      });
      await logInventoryAudit('DEDUCT', deductItem.id, deductItem.name, {
        quantityDeducted: qty,
        unit: deductItem.unit,
        reason: deductReason.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-inventory'] });
      setDeductOpen(false);
      setDeductItem(null);
      toast.success('Quantity deducted.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to deduct.');
    } finally {
      setDeductSaving(false);
    }
  };

  const handleConfirmDelete = (item: InventoryItem) => {
    setDeleteItem(item);
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteItem || !user?.companyId) return;
    setDeleteSaving(true);
    try {
      await deleteDoc(doc(db, 'inventoryItems', deleteItem.id));
      await logInventoryAudit('DELETE', deleteItem.id, deleteItem.name, {});
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-inventory'] });
      setDeleteConfirmOpen(false);
      setDeleteItem(null);
      toast.success('Item deleted.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete item.');
    } finally {
      setDeleteSaving(false);
    }
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockItem) return;
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
      const purchaseData: Record<string, unknown> = {
        companyId: restockItem.companyId,
        inventoryItemId: restockItem.id,
        quantityAdded: qty,
        unit: restockItem.unit,
        totalCost: total,
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
      if (activeProject) purchaseData.projectId = activeProject.id;
      if (qty) purchaseData.pricePerUnit = total / qty;
      batch.set(purchaseRef, purchaseData);

      if (activeProject) {
        const categoryMap: Record<string, ExpenseCategory> = {
          fertilizer: 'fertilizer',
          chemical: 'chemical',
          diesel: 'fuel',
          fuel: 'fuel',
          materials: 'other',
          sacks: 'other',
          ropes: 'other',
          'wooden-crates': 'other',
          seeds: 'other',
        };
        const expenseRef = doc(collection(db, 'expenses'));
        batch.set(expenseRef, {
          companyId: restockItem.companyId,
          projectId: activeProject.id,
          cropType: activeProject.cropType,
          category: categoryMap[restockItem.category] ?? 'other',
          description: `Restock ${restockItem.name} (${qty} ${restockItem.unit})`,
          amount: total,
          date: serverTimestamp(),
          synced: false,
          paid: false,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      await logInventoryAudit('RESTOCK', restockItem.id, restockItem.name, { quantityAdded: qty, totalCost: total, unit: restockItem.unit });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
      setRestockOpen(false);
      toast.success('Restocked successfully');
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
        <div className="flex gap-2">
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
              {!user?.companyId ? (
                <p className="text-sm text-muted-foreground">
                  Sign in with a company account to add inventory items.
                </p>
              ) : (
                <form
                  onSubmit={handleAddItem}
                  className="space-y-6"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {}
                  }}
                >
                  {/* Section: Basic info */}
                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Basic info</p>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Item name</label>
                      <input
                        className="fv-input h-10 w-full rounded-lg border-border/80"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. NPK 23:23:0"
                        required
                      />
                    </div>
                    {/* Category | Packaging (Chemical only) or Quantity (all other categories) — same row */}
                    <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                      <div className="space-y-1 min-w-0">
                        <label className="text-sm font-medium text-foreground">Category</label>
                        <div className="flex gap-2">
                          <Select
                            value={category}
                            onValueChange={(v) => {
                              setCategory(v);
                              if (v.toLowerCase() === 'fertilizer') setUnit('bags');
                              if (v.toLowerCase() === 'seeds') { setUnit('packets'); setSeedCrop(''); }
                              if (v.toLowerCase() !== 'seeds' && v.toLowerCase() !== 'fertilizer') setUnit('kg');
                            }}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableCategories.map((cat) => (
                                <SelectItem key={cat} value={cat.toLowerCase()}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">{getCategoryIcon(cat)}</span>
                                    <span>{getCategoryDisplayName(cat.toLowerCase())}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            onClick={() => setShowNewCategoryInput(!showNewCategoryInput)}
                            className="fv-btn fv-btn--secondary shrink-0"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        {showNewCategoryInput && (
                          <div className="flex gap-2 mt-2">
                            <input
                              className="fv-input"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              placeholder="New category name"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (newCategoryName.trim()) {
                                  handleAddCategory(newCategoryName);
                                }
                              }}
                              className="fv-btn fv-btn--primary"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Chemical: Packaging in same row. Other categories: Quantity in same row. */}
                      {category.toLowerCase() === 'chemical' ? (
                        <div className="space-y-1 w-[140px] shrink-0">
                          <label className="text-sm font-medium text-foreground">Packaging</label>
                          <Select value={chemicalPackaging} onValueChange={(v) => setChemicalPackaging(v as ChemicalPackagingType)}>
                            <SelectTrigger className="h-10 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="box">Box</SelectItem>
                              <SelectItem value="single">Single products</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (category.toLowerCase() === 'fuel' || category.toLowerCase() === 'diesel') ? (
                        <div className="space-y-1 w-[140px] shrink-0">
                          <label className="text-sm font-medium text-foreground">Containers</label>
                          <input
                            type="number"
                            className="fv-input h-10 w-full"
                            value={containers}
                            onChange={(e) => {
                              const v = e.target.value;
                              setContainers(v);
                              const c = Number(v || '0');
                              setTotalAmount((c * Number(pricePerUnit || '0')).toFixed(2));
                            }}
                            min="0"
                            placeholder="e.g. 2"
                            required
                          />
                        </div>
                      ) : (category.toLowerCase() !== 'fuel' && category.toLowerCase() !== 'diesel') ? (
                        <div className="space-y-1 w-[120px] shrink-0">
                          <label className="text-sm font-medium text-foreground">
                            {category.toLowerCase() === 'wooden-crates' ? 'Boxes' : 'Quantity'}
                          </label>
                          <input
                            type="number"
                            className="fv-input h-10 w-full"
                            value={quantity}
                            onChange={(e) => {
                              const v = e.target.value;
                              setQuantity(v);
                              const q = Number(v || '0');
                              setTotalAmount((q * Number(pricePerUnit || '0')).toFixed(2));
                            }}
                            min="0"
                            step="0.01"
                            placeholder={category.toLowerCase() === 'wooden-crates' ? 'e.g. 5' : 'e.g. 10'}
                            required
                          />
                        </div>
                      ) : null}
                    </div>
                    {/* Chemical: Single = Number of units only. Box = Number of boxes + Units per box + Total. (No separate Unit field.) */}
                    {category.toLowerCase() === 'chemical' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                        {chemicalPackaging === 'single' ? (
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-foreground">Number of units</label>
                            <input
                              type="number"
                              className="fv-input h-10 w-full"
                              value={quantity}
                              onChange={(e) => {
                                const v = e.target.value;
                                setQuantity(v);
                                const q = Number(v || '0');
                                setTotalAmount((q * Number(pricePerUnit || '0')).toFixed(2));
                              }}
                              min="0"
                              required
                            />
                          </div>
                        ) : (
                          <>
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-foreground">Number of boxes</label>
                              <input
                                type="number"
                                className="fv-input h-10 w-full"
                                value={quantity}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setQuantity(v);
                                  const q = Number(v || '0');
                                  setTotalAmount((q * Number(pricePerUnit || '0')).toFixed(2));
                                }}
                                min="0"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-foreground">Units per box (bottles/packets)</label>
                              <input
                                type="number"
                                className="fv-input h-10 w-full"
                                value={unitsPerBox}
                                onChange={(e) => setUnitsPerBox(e.target.value)}
                                min="1"
                                placeholder="e.g. 12"
                                required
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-sm text-muted-foreground">
                                Total: <span className="font-medium text-foreground">{Number(quantity || 0) * Number(unitsPerBox || 0) || 0}</span> units
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {(category.toLowerCase() === 'fuel' || category.toLowerCase() === 'diesel') && (
                      <>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-foreground">Fuel type</label>
                          <Select value={fuelType} onValueChange={(v) => setFuelType(v as FuelType)}>
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="diesel">Diesel</SelectItem>
                              <SelectItem value="petrol">Petrol</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-foreground">Litres (optional)</label>
                          <input
                            type="number"
                            className="fv-input"
                            value={litres}
                            onChange={(e) => setLitres(e.target.value)}
                            min="0"
                            step="0.01"
                            placeholder="e.g. 20"
                          />
                        </div>
                      </>
                    )}
                    {category.toLowerCase() === 'wooden-crates' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-foreground">Box size</label>
                          <Select value={boxSize} onValueChange={(v) => setBoxSize(v as 'big' | 'small')}>
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="big">Big box</SelectItem>
                              <SelectItem value="small">Small box</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    {category.toLowerCase() === 'seeds' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-foreground">Crop (for this seed)</label>
                          <Select value={seedCrop || '_none'} onValueChange={(v) => setSeedCrop(v === '_none' ? '' : (v as CropType))}>
                            <SelectTrigger className="h-10 w-full">
                              <SelectValue placeholder="Select crop" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">Select crop</SelectItem>
                              {cropOptions.map((crop) => (
                                <SelectItem key={crop} value={crop}>
                                  {crop.replace('-', ' ')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">Which crop this seed is for</p>
                        </div>
                      </>
                    )}
                    {/* Row: Unit | Kgs (optional, per item). Shown for fertilizer (bags) and chemical. Hidden for fuel. */}
                    {(category.toLowerCase() !== 'fuel' && category.toLowerCase() !== 'diesel') && (
                      <div className={cn(
                        'grid gap-3 items-end',
                        (category.toLowerCase() === 'fertilizer' && (unit || 'bags') === 'bags') || category.toLowerCase() === 'chemical'
                          ? 'grid-cols-1 sm:grid-cols-2'
                          : 'grid-cols-1'
                      )}>
                        <div className="space-y-1 min-w-0">
                          <label className="text-sm font-medium text-foreground">Unit</label>
                          {category.toLowerCase() === 'seeds' ? (
                            <Select value={unit} onValueChange={(v) => setUnit(v)}>
                              <SelectTrigger className="fv-input h-10 w-full min-w-0">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="packets">Packets</SelectItem>
                                <SelectItem value="kg">Kg</SelectItem>
                                <SelectItem value="bags">Bags</SelectItem>
                                <SelectItem value="tins">Tins</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : category.toLowerCase() === 'fertilizer' ? (
                            <Select value={unit || 'bags'} onValueChange={(v) => setUnit(v)}>
                              <SelectTrigger className="fv-input h-10 w-full min-w-0">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bags">Bags</SelectItem>
                                <SelectItem value="kg">Kg</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Select value={unit || 'kg'} onValueChange={(v) => setUnit(v)}>
                              <SelectTrigger className="fv-input h-10 w-full min-w-0">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="kg">Kg</SelectItem>
                                <SelectItem value="litres">Litres</SelectItem>
                                <SelectItem value="bags">Bags</SelectItem>
                                <SelectItem value="packets">Packets</SelectItem>
                                <SelectItem value="tins">Tins</SelectItem>
                                <SelectItem value="boxes">Boxes</SelectItem>
                                <SelectItem value="units">Units</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        {category.toLowerCase() === 'fertilizer' && (unit || 'bags') === 'bags' && (
                          <div className="space-y-1 min-w-0">
                            <label className="text-sm font-medium text-foreground">Kgs (optional, per item e.g. per bag)</label>
                            <input
                              type="number"
                              className="fv-input h-10 w-full"
                              value={kgs}
                              onChange={(e) => setKgs(e.target.value)}
                              min="0"
                              step="0.01"
                              placeholder="e.g. 50 kg per bag"
                            />
                          </div>
                        )}
                        {category.toLowerCase() === 'chemical' && (() => {
                          const u = (unit || 'kg').toLowerCase();
                          const unitLabels: Record<string, { label: string; placeholder: string }> = {
                            kg: { label: 'Kg (optional, per item e.g. per bottle)', placeholder: 'e.g. 500 g per bottle' },
                            litres: { label: 'Litres (optional, per item e.g. per bottle)', placeholder: 'e.g. 1 L per bottle' },
                            bags: { label: 'Kg (optional, per bag)', placeholder: 'e.g. 25 kg per bag' },
                            packets: { label: 'Weight/vol (optional, per packet)', placeholder: 'e.g. 100 g' },
                            tins: { label: 'Weight/vol (optional, per tin)', placeholder: 'e.g. 5 L' },
                            boxes: { label: 'Weight/vol (optional, per box)', placeholder: 'e.g. 10 kg' },
                            units: { label: 'Weight/vol (optional, per unit)', placeholder: 'e.g. 500 g' },
                          };
                          const { label: kgLabel, placeholder: kgPlaceholder } = unitLabels[u] || unitLabels.kg;
                          return (
                            <div className="space-y-1 min-w-0">
                              <label className="text-sm font-medium text-foreground">{kgLabel}</label>
                              <input
                                type="number"
                                className="fv-input h-10 w-full"
                                value={kgs}
                                onChange={(e) => setKgs(e.target.value)}
                                min="0"
                                step="0.01"
                                placeholder={kgPlaceholder}
                              />
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {/* Row 2: Price per unit | Total amount — auto-calculate in real time */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div className="space-y-1 min-w-0">
                        <label className="text-sm font-medium text-foreground">Price per unit (KES)</label>
                        <input
                          type="number"
                          className="fv-input h-10 w-full"
                          value={pricePerUnit}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPricePerUnit(v);
                            const num = Number(v || '0');
                            if (effectiveQuantityForAdd > 0) setTotalAmount((num * effectiveQuantityForAdd).toFixed(2));
                          }}
                          min="0"
                          step="0.01"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <label className="text-sm font-medium text-foreground">Total amount (KES)</label>
                        <input
                          type="number"
                          className="fv-input h-10 w-full"
                          value={totalAmount}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTotalAmount(v);
                            const num = Number(v || '0');
                            if (effectiveQuantityForAdd > 0) setPricePerUnit((num / effectiveQuantityForAdd).toFixed(2));
                          }}
                          min="0"
                          step="0.01"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Supplier (optional)</label>
                      <Select value={selectedSupplierId} onValueChange={(v) => { setSelectedSupplierId(v); if (!v) setPickupDate(''); }}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers
                            .filter((s) => s.companyId === (activeProject?.companyId ?? user?.companyId))
                            .map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedSupplierId && (
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Pickup date (optional)</label>
                        <input
                          type="date"
                          className="fv-input w-full"
                          value={pickupDate}
                          onChange={(e) => setPickupDate(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">When you picked up this item from the supplier (e.g. for seeds)</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Min threshold</label>
                      <input
                        type="number"
                        className="fv-input h-10 rounded-lg border-border/80"
                        value="10"
                        readOnly
                        disabled
                      />
                      <p className="text-xs text-muted-foreground">Default: 10 units</p>
                    </div>
                  </div>

                  {/* Section: Crop scope (optional) — at bottom for flow */}
                  <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Crop scope (optional)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Select crops this item is used for. Leave all unchecked for all crops.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedCrops([...cropOptions])}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Select all
                        </button>
                        <span className="text-muted-foreground">·</span>
                        <button
                          type="button"
                          onClick={() => setSelectedCrops([])}
                          className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                        >
                          Clear all
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {cropOptions.map((crop) => (
                        <label
                          key={crop}
                          className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2"
                        >
                          <Checkbox
                            checked={selectedCrops.includes(crop)}
                            onCheckedChange={() => toggleCropSelection(crop)}
                          />
                          <span className="text-sm capitalize select-none">{crop.replace(/-/g, ' ')}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                    <Checkbox
                      id="countAsExpense"
                      checked={countAsExpense}
                      onCheckedChange={(v) => setCountAsExpense(!!v)}
                    />
                    <label htmlFor="countAsExpense" className="text-sm font-medium text-foreground cursor-pointer select-none">
                      Count initial stock as expense
                    </label>
                  </div>

                  <DialogFooter>
                    <button
                      type="button"
                      className="fv-btn fv-btn--secondary"
                      onClick={() => {
                        setAddOpen(false);
                        setName('');
                        setCategory('fertilizer');
                        setQuantity('');
                        setUnit('kg');
                        setPricePerUnit('');
                        setTotalAmount('');
                        setSelectedCrops([]);
                        setSeedCrop('');
                        setSelectedSupplierId('');
                        setPickupDate('');
                        setCountAsExpense(false);
                        setShowNewCategoryInput(false);
                        setNewCategoryName('');
                        setChemicalPackaging('box');
                        setUnitsPerBox('');
                        setFuelType('diesel');
                        setContainers('');
                        setLitres('');
                        setBags('');
                        setKgs('');
                        setBoxSize('big');
                      }}
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
          <Dialog open={neededOpen} onOpenChange={setNeededOpen}>
            <DialogTrigger asChild>
              <button className="fv-btn fv-btn--secondary relative">
                <ShoppingCart className="h-4 w-4" />
                Needed
                {filteredNeededItems.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
                    {filteredNeededItems.length}
                  </span>
                )}
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-[90vw] md:w-full max-w-[95vw] sm:max-w-4xl p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>Items Needed for Purchase</DialogTitle>
              </DialogHeader>
              <form
                className="fv-card p-4 mb-6 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const companyId = user?.companyId ?? activeProject?.companyId;
                  if (!companyId || !neededItemName.trim() || !neededItemCategory || !Number(neededItemQuantity)) {
                    toast.error('Please fill in item name, category, and quantity.');
                    return;
                  }
                  setNeededItemSaving(true);
                  try {
                    const neededRef = await addDoc(collection(db, 'neededItems'), {
                      companyId,
                      projectId: activeProject?.id ?? null,
                      itemName: neededItemName.trim(),
                      category: neededItemCategory.toLowerCase(),
                      quantity: Number(neededItemQuantity),
                      unit: neededItemUnit || 'kg',
                      status: 'pending',
                      createdAt: serverTimestamp(),
                    });
                    if (user?.companyId && user?.id) {
                      await createInventoryAuditLog({
                        companyId: user.companyId,
                        actorUid: user.id,
                        actorEmail: user.email ?? '',
                        actorName: user.name,
                        actionType: 'ADD_NEEDED',
                        targetId: neededRef.id,
                        targetType: 'NEEDED_ITEM',
                        metadata: {
                          itemName: neededItemName.trim(),
                          category: neededItemCategory,
                          quantity: Number(neededItemQuantity),
                          unit: neededItemUnit || 'kg',
                        },
                      });
                    }
                    queryClient.invalidateQueries({ queryKey: ['neededItems'] });
                    queryClient.invalidateQueries({ queryKey: ['inventory-audit-logs'] });
                    setNeededItemName('');
                    setNeededItemCategory(availableCategories[0]?.toLowerCase() ?? '');
                    setNeededItemQuantity('');
                    setNeededItemUnit('kg');
                    toast.success('Item added to needed list.');
                  } catch (err) {
                    toast.error('Failed to add item.');
                  } finally {
                    setNeededItemSaving(false);
                  }
                }}
              >
                <h4 className="text-sm font-semibold text-foreground">Add item you're planning to get</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Item name</label>
                    <input
                      className="fv-input w-full"
                      value={neededItemName}
                      onChange={(e) => setNeededItemName(e.target.value)}
                      placeholder="e.g. Tomato seeds"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Category</label>
                    <Select value={neededItemCategory || availableCategories[0]?.toLowerCase()} onValueChange={setNeededItemCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat} value={cat.toLowerCase()}>
                            {getCategoryDisplayName(cat.toLowerCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Quantity</label>
                    <input
                      type="number"
                      className="fv-input w-full"
                      value={neededItemQuantity}
                      onChange={(e) => setNeededItemQuantity(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="0"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Unit</label>
                    <Select value={neededItemUnit} onValueChange={setNeededItemUnit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">Kg</SelectItem>
                        <SelectItem value="packets">Packets</SelectItem>
                        <SelectItem value="bags">Bags</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="boxes">Boxes</SelectItem>
                        <SelectItem value="units">Units</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <button type="submit" className="fv-btn fv-btn--primary" disabled={neededItemSaving}>
                  {neededItemSaving ? 'Adding…' : 'Add to list'}
                </button>
              </form>
              {filteredNeededItems.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">No items need to be purchased at this time.</p>
                  <p className="text-xs text-muted-foreground mt-2">Use the form above to add an item you're planning to get.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNeededItems.map((item) => (
                    <div key={item.id} className="fv-card p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                        <div className="flex-1 w-full">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="font-semibold text-foreground text-sm sm:text-base">{item.itemName}</h4>
                            <span className={cn('fv-badge text-xs capitalize', getCategoryColor(item.category))}>
                              {item.category}
                            </span>
                            <span className="fv-badge fv-badge--warning text-xs">
                              {item.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs sm:text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Quantity:</span> {formatInventoryQuantity(item)}
                            </div>
                            {item.sourceChallengeTitle && (
                              <div className="col-span-1 sm:col-span-2">
                                <span className="font-medium">From Challenge:</span> <span className="break-words">{item.sourceChallengeTitle}</span>
                              </div>
                            )}
                            <div>
                              <span className="font-medium">Added:</span> {formatDate(item.createdAt)}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            // Mark as ordered or create inventory item
                            // For now, just mark as ordered
                            await updateDoc(doc(db, 'neededItems', item.id), {
                              status: 'ordered',
                              updatedAt: serverTimestamp(),
                            });
                            queryClient.invalidateQueries({ queryKey: ['neededItems'] });
                          }}
                          className="fv-btn fv-btn--primary shrink-0 w-full sm:w-auto"
                        >
                          Mark as Ordered
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Inventory Audit dialog */}
          <Dialog open={inventoryAuditOpen} onOpenChange={setInventoryAuditOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ScrollText className="h-5 w-5" />
                  Inventory Audit
                </DialogTitle>
                <DialogDescription>
                  Who did what and when: restock, deduct, and delete actions for your company.
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-auto flex-1 -mx-6 px-6">
                {inventoryAuditLoading && (
                  <p className="text-sm text-muted-foreground py-4">Loading inventory audit logs…</p>
                )}
                {!inventoryAuditLoading && companyInventoryAuditLogs.length === 0 && (
                  <div className="py-8">
                    <p className="text-sm text-muted-foreground">
                      No inventory actions yet. Restock, deduct, and delete actions will appear here with who did it and when.
                    </p>
                  </div>
                )}
                {!inventoryAuditLoading && companyInventoryAuditLogs.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="fv-table">
                      <thead>
                        <tr>
                          <th>Date &amp; time</th>
                          <th>Who</th>
                          <th>Action</th>
                          <th>Item</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {companyInventoryAuditLogs.map((log) => {
                          const { actionLabel, details } = formatAuditLogDisplay(log);
                          const itemName = (log.metadata as { itemName?: string })?.itemName ?? log.targetId;
                          return (
                            <tr key={log.id}>
                              <td className="whitespace-nowrap text-muted-foreground">
                                {log.createdAt.toLocaleString()}
                              </td>
                              <td>
                                <span className="font-medium">{log.actorName || log.actorEmail}</span>
                                <span className="text-xs text-muted-foreground block">{log.actorEmail}</span>
                              </td>
                              <td>
                                <span className={cn(
                                  'fv-badge text-xs',
                                  log.actionType === 'DELETE' && 'bg-destructive/10 text-destructive',
                                  log.actionType === 'DEDUCT' && 'bg-amber-100 text-amber-800',
                                  log.actionType === 'RESTOCK' && 'bg-green-100 text-green-800',
                                  log.actionType === 'ADD_ITEM' && 'bg-blue-100 text-blue-800',
                                  log.actionType === 'ADD_NEEDED' && 'bg-violet-100 text-violet-800',
                                )}>
                                  {actionLabel}
                                </span>
                              </td>
                              <td className="font-medium">{itemName}</td>
                              <td className="text-sm text-muted-foreground max-w-[280px]">
                                {details}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Restock dialog */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Restock Inventory</DialogTitle>
          </DialogHeader>
          {!restockItem ? (
            <p className="text-sm text-muted-foreground">
              Select an item to restock.
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
                  <p className="text-xs text-muted-foreground">This total amount is recorded as the restock cost and (if project selected) as expense.</p>
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

      {/* Deduct dialog */}
      <Dialog open={deductOpen} onOpenChange={setDeductOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deduct from stock</DialogTitle>
            <DialogDescription>
              {deductItem && (
                <>Reduce quantity for <span className="font-medium text-foreground">{deductItem.name}</span>. Current: {formatInventoryQuantity(deductItem)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {deductItem && (
            <form onSubmit={handleDeduct} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Quantity to deduct</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="fv-input w-full"
                  value={deductQuantity}
                  onChange={(e) => setDeductQuantity(e.target.value)}
                  placeholder="e.g. 2, 0.5, 1/2"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Reason (optional)</label>
                <input
                  type="text"
                  className="fv-input w-full"
                  value={deductReason}
                  onChange={(e) => setDeductReason(e.target.value)}
                  placeholder="e.g. Damaged, expired"
                />
              </div>
              <DialogFooter>
                <button type="button" className="fv-btn fv-btn--secondary" onClick={() => setDeductOpen(false)}>Cancel</button>
                <button type="submit" disabled={deductSaving} className="fv-btn fv-btn--primary">
                  {deductSaving ? 'Deducting…' : 'Deduct'}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete inventory item?</DialogTitle>
            <DialogDescription>
              {deleteItem && (
                <>This will permanently delete <span className="font-medium text-foreground">{deleteItem.name}</span>. This action cannot be undone.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteItem && (
            <DialogFooter>
              <button type="button" className="fv-btn fv-btn--secondary" onClick={() => setDeleteConfirmOpen(false)}>Cancel</button>
              <button type="button" className="fv-btn bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteSaving} onClick={handleDelete}>
                {deleteSaving ? 'Deleting…' : 'Delete'}
              </button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <div
          className="relative overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm transition-all p-3 sm:p-4 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent"
        >
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Total Items
          </p>
          <p className="mt-1 font-heading font-bold tracking-tight text-lg sm:text-xl text-foreground">
            {inventory.length}
          </p>
          <button
            type="button"
            onClick={() => setInventoryAuditOpen(true)}
            className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
          >
            <ScrollText className="h-3 w-3 shrink-0" />
            Inventory Audit
          </button>
        </div>
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
          value={new Set(inventory.map(i => i.supplierId).filter(Boolean)).size}
          layout="vertical"
        />
      </div>

      {/* Category Stats */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground mb-3">Items by Category</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          {availableCategories
            .map((cat) => {
              const categoryItems = filteredInventory.filter(
                item => item.category.toLowerCase() === cat.toLowerCase()
              );
              if (categoryItems.length === 0) return null;
              
              return (
                <div 
                  key={cat} 
                  className="fv-card p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleCategoryCardClick(cat)}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">
                      {getCategoryIcon(cat)}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </p>
                      <p className="text-2xl font-bold text-foreground">
                        {categoryItems.length}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
            .filter(Boolean)}
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
                    {formatInventoryQuantity(item)}
                  </td>
                  <td>{formatCurrency(item.pricePerUnit || 0)}</td>
                  <td className="font-medium">{formatCurrency(item.quantity * (item.pricePerUnit || 0))}</td>
                  <td className="text-muted-foreground">{item.supplierName || '-'}</td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                          aria-label="Actions"
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleOpenRestock(item)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Restock
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenDeduct(item)}>
                          <Minus className="h-4 w-4 mr-2" />
                          Deduct
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleConfirmDelete(item)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                <div className="flex items-center gap-1">
                  {isLowStock(item) && (
                    <span className="fv-badge fv-badge--warning text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Low
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="p-2 hover:bg-muted rounded-lg">
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleOpenRestock(item)}><Plus className="h-4 w-4 mr-2" /> Restock</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenDeduct(item)}><Minus className="h-4 w-4 mr-2" /> Deduct</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleConfirmDelete(item)}><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <span className="ml-1 font-medium">{formatInventoryQuantity(item)}</span>
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

      {/* Category Items Drawer - drag the top handle to move or close */}
      <Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
        <DrawerContent className="max-h-[85vh]" resizable defaultHeightVh={50}>
          <DrawerHeader className="text-left">
            <div className="flex items-center gap-3">
              <div className="text-3xl">
                {selectedCategory && getCategoryIcon(selectedCategory)}
              </div>
              <div>
                <DrawerTitle className="text-xl">
                  {selectedCategory && selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Items
                </DrawerTitle>
                <DrawerDescription>
                  {categoryItemsList.length} {categoryItemsList.length === 1 ? 'item' : 'items'} in this category
                </DrawerDescription>
              </div>
            </div>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto">
            {categoryItemsList.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">No items in this category.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {categoryItemsList.map((item) => (
                  <div key={item.id} className="fv-card p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold text-foreground text-sm sm:text-base truncate">{item.name}</h4>
                          {isLowStock(item) && (
                            <span className="fv-badge fv-badge--warning text-xs shrink-0">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Low
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs sm:text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Quantity:</span> {formatInventoryQuantity(item)}
                          </div>
                          {item.pricePerUnit && (
                            <div>
                              <span className="font-medium">Price:</span> {formatCurrency(item.pricePerUnit)}/{item.unit}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Value:</span> {formatCurrency(item.quantity * (item.pricePerUnit || 0))}
                          </div>
                        </div>
                        {item.supplierName && (
                          <div className="text-xs text-muted-foreground mt-2">
                            <span className="font-medium">Supplier:</span> {item.supplierName}
                          </div>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="fv-btn fv-btn--secondary shrink-0 p-2" title="Actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => { setCategoryDrawerOpen(false); handleOpenRestock(item); }}><Plus className="h-4 w-4 mr-2" /> Restock</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setCategoryDrawerOpen(false); handleOpenDeduct(item); }}><Minus className="h-4 w-4 mr-2" /> Deduct</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setCategoryDrawerOpen(false); handleConfirmDelete(item); }}><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
