import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Scale,
  Banknote,
  ShoppingCart,
  ChevronLeft,
  CheckCircle2,
  Search,
  Package,
  Leaf,
  Sprout,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, toDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import type { HarvestCollection, HarvestPicker, PickerWeighEntry } from '@/types';
import {
  createHarvestCollection,
  addHarvestPicker,
  addPickerWeighEntry,
  markPickerCashPaid,
  setBuyerPriceAndMaybeClose,
  recalcCollectionTotals,
  registerHarvestCash,
  applyHarvestCashPayment,
  payPickersFromWalletBatchFirestore,
  topUpHarvestWallet,
  getHarvestWallet,
} from '@/services/harvestCollectionService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Select as UiSelect,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const COLLECTION_ICONS = [Scale, Package, Leaf, Sprout] as const;

type ViewMode = 'list' | 'intake' | 'pay' | 'buyer';

export default function HarvestCollectionsPage() {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeProject, projects, setActiveProject } = useProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Master wallet is now updated via Firestore transaction helpers (no Cloud Functions).

  const effectiveProject = useMemo(() => {
    if (routeProjectId) {
      const fromRoute = projects.find((p) => p.id === routeProjectId) ?? null;
      return fromRoute;
    }
    return activeProject;
  }, [routeProjectId, projects, activeProject]);

  useEffect(() => {
    if (routeProjectId && effectiveProject && effectiveProject.id === routeProjectId && activeProject?.id !== routeProjectId) {
      setActiveProject(effectiveProject);
    }
  }, [routeProjectId, effectiveProject, activeProject?.id, setActiveProject]);

  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newHarvestDate, setNewHarvestDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [newPricePerKgPicker, setNewPricePerKgPicker] = useState('140');
  const [creating, setCreating] = useState(false);

  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [newPickerNumber, setNewPickerNumber] = useState('');
  const [newPickerName, setNewPickerName] = useState('');
  const [addingPicker, setAddingPicker] = useState(false);

  const [addWeighOpen, setAddWeighOpen] = useState(false);
  const [weighPickerId, setWeighPickerId] = useState('');
  const [weighKg, setWeighKg] = useState('');
  const [weighTrip, setWeighTrip] = useState('1');
  const [weighOpenedFromCard, setWeighOpenedFromCard] = useState(false);

  const [buyerPricePerKg, setBuyerPricePerKg] = useState('');
  const [markingBuyerPaid, setMarkingBuyerPaid] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [statsExpanded, setStatsExpanded] = useState(true);
  const [paySelectedIds, setPaySelectedIds] = useState<Set<string>>(new Set());
  const [cashAmount, setCashAmount] = useState('');
  const [cashPreviousAmount, setCashPreviousAmount] = useState(0);
  const [cashSource, setCashSource] = useState<'bank' | 'broker' | 'custom'>('bank');
  const [cashSourceCustom, setCashSourceCustom] = useState('');
  const [cashDialogCollection, setCashDialogCollection] = useState<HarvestCollection | null>(null);
  const [cashDialogVisible, setCashDialogVisible] = useState(false);
  const [cashDialogSaving, setCashDialogSaving] = useState(false);
  const [payingSelected, setPayingSelected] = useState(false);

  const handleSaveCash = async () => {
    if (!cashDialogCollection || !cashAmount.trim() || !companyId) return;
    const amount = Number(cashAmount || '0');
    if (amount <= 0) {
      toast({ title: 'Invalid amount', description: 'Cash received must be greater than 0.', variant: 'destructive' });
      return;
    }
    try {
      setCashDialogSaving(true);
      const resolvedSource =
        cashSource === 'custom' && cashSourceCustom.trim().length > 0
          ? cashSourceCustom.trim()
          : cashSource;

      const previousTotal = cashPreviousAmount || 0;
      const topUp = amount;
      const newTotal = previousTotal + topUp;

      await registerHarvestCash({
        collectionId: cashDialogCollection.id,
        projectId: cashDialogCollection.projectId,
        companyId: cashDialogCollection.companyId,
        cropType: String(cashDialogCollection.cropType),
        cashReceived: newTotal,
        source: resolvedSource,
        receivedBy: user?.name || user?.email || user?.id || 'unknown',
      });
      // Top up the master harvest wallet by the new cash amount only (do not overwrite)
      if (topUp > 0) {
        await topUpHarvestWallet({
          companyId: cashDialogCollection.companyId,
          projectId: cashDialogCollection.projectId,
          cropType: String(cashDialogCollection.cropType),
          amount: topUp,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['harvestCashPools'] });
      queryClient.invalidateQueries({ queryKey: harvestWalletQueryKey });
      setCashDialogCollection(null);
      setCashPreviousAmount(newTotal);
      setCashAmount('');
      toast({ title: 'Cash registered' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to register cash', variant: 'destructive' });
    } finally {
      setCashDialogSaving(false);
    }
  };

  useEffect(() => {
    setPaySelectedIds(new Set());
  }, [selectedCollectionId]);

  const { data: allCollections = [], isLoading: loadingCollections } = useCollection<HarvestCollection>(
    'harvestCollections',
    'harvestCollections',
    { refetchInterval: 5000 }
  );
  const { data: allPickers = [] } = useCollection<HarvestPicker>('harvestPickers', 'harvestPickers', {
    refetchInterval: 5000,
  });
  const { data: allWeighEntries = [] } = useCollection<PickerWeighEntry>(
    'pickerWeighEntries',
    'pickerWeighEntries',
    { refetchInterval: 5000 }
  );

  const { data: allCashPools = [] } = useCollection<any>('harvestCashPools', 'harvestCashPools', {
    refetchInterval: 5000,
  });

  const companyId = user?.companyId ?? '';

  // Shared harvest wallet (one per project+crop) — balance deducts when paying from any collection
  const harvestWalletQueryKey = [
    'harvestWallet',
    companyId,
    effectiveProject?.id ?? '',
    String(effectiveProject?.cropType ?? ''),
  ] as const;
  const { data: harvestWallet } = useQuery({
    queryKey: harvestWalletQueryKey,
    queryFn: () =>
      getHarvestWallet({
        companyId,
        projectId: effectiveProject!.id,
        cropType: String(effectiveProject!.cropType),
      }),
    enabled:
      !!companyId &&
      !!effectiveProject?.id &&
      String(effectiveProject?.cropType).toLowerCase() === 'french-beans',
    refetchInterval: 5000,
  });

  const collections = useMemo(() => {
    if (!effectiveProject) return allCollections;
    return allCollections.filter((c) => c.projectId === effectiveProject.id);
  }, [allCollections, effectiveProject]);

  const selectedCollection = useMemo(
    () => allCollections.find((c) => c.id === selectedCollectionId) ?? null,
    [allCollections, selectedCollectionId]
  );

  const isFrenchBeansCollection = useMemo(
    () => (selectedCollection?.cropType as string | undefined)?.toLowerCase() === 'french-beans',
    [selectedCollection?.cropType]
  );

  const cashPoolForCollection = useMemo(() => {
    if (!selectedCollectionId) return null;
    return allCashPools.find((p: any) => p.collectionId === selectedCollectionId) ?? null;
  }, [allCashPools, selectedCollectionId]);

  const cashPoolByCollection = useMemo(() => {
    const map: Record<string, any> = {};
    (allCashPools as any[]).forEach((p) => {
      if (p.collectionId) map[p.collectionId] = p;
    });
    return map;
  }, [allCashPools]);

  const hasFrenchBeansCollections = useMemo(
    () => collections.some((c) => String(c.cropType).toLowerCase() === 'french-beans'),
    [collections]
  );

  const pickersForCollection = useMemo(() => {
    if (!selectedCollectionId) return [];
    return allPickers
      .filter((p) => p.collectionId === selectedCollectionId)
      .sort((a, b) => (a.pickerNumber ?? 0) - (b.pickerNumber ?? 0));
  }, [allPickers, selectedCollectionId]);

  const filteredPickers = useMemo(() => {
    const q = (pickerSearch || '').trim().toLowerCase();
    if (!q) return pickersForCollection;
    return pickersForCollection.filter(
      (p) =>
        String(p.pickerNumber ?? '').toLowerCase().includes(q) ||
        (p.pickerName ?? '').toLowerCase().includes(q)
    );
  }, [pickersForCollection, pickerSearch]);

  /** Pay tab: same as filteredPickers but unpaid first, paid at the bottom */
  const filteredPickersForPay = useMemo(() => {
    return [...filteredPickers].sort((a, b) => (a.isPaid === b.isPaid ? 0 : a.isPaid ? 1 : -1));
  }, [filteredPickers]);

  /** Pay tab: unpaid list + paid groups (Group A, B, C...) by paymentBatchId, ordered by paidAt */
  const payUnpaidAndGroups = useMemo(() => {
    const unpaid = filteredPickersForPay.filter((p) => !p.isPaid);
    const paid = filteredPickersForPay.filter((p) => p.isPaid);
    if (paid.length === 0)
      return {
        unpaid,
        groups: [] as { label: string; pickers: HarvestPicker[] }[],
        individuals: [] as { label: string; pickers: HarvestPicker[] }[],
      };

    const toTime = (p: HarvestPicker) => {
      const t = p.paidAt;
      if (t == null) return 0;
      if (typeof t === 'object' && 'toMillis' in t) return (t as { toMillis: () => number }).toMillis();
      if (t instanceof Date) return t.getTime();
      return Number(t) || 0;
    };
    const byBatch = new Map<string, HarvestPicker[]>();
    paid.forEach((p) => {
      const bid = p.paymentBatchId ?? '__legacy__';
      if (!byBatch.has(bid)) byBatch.set(bid, []);
      byBatch.get(bid)!.push(p);
    });
    const batches = Array.from(byBatch.entries()).map(([_, pickers]) => ({
      pickers,
      minPaidAt: Math.min(...pickers.map(toTime)),
    }));
    batches.sort((a, b) => a.minPaidAt - b.minPaidAt);
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let letterIndex = 0;
    const groupsRaw = batches.map((b) => {
      const isLegacy = b.pickers.some((p) => !p.paymentBatchId);
      const letter = labels[letterIndex++] ?? String(letterIndex);
      const isIndividual = b.pickers.length === 1;

      let label: string;
      if (isLegacy) {
        // Legacy/older payments keep a generic label
        label = isIndividual ? 'Individual (earlier)' : 'Paid (earlier)';
      } else {
        // Newer batches: Individual A/B/... when only one, otherwise Group A/B/...
        label = isIndividual ? `Individual ${letter}` : `Group ${letter}`;
      }

      return { label, pickers: b.pickers, isIndividual };
    });
    const individuals = groupsRaw.filter((g) => g.isIndividual).map(({ label, pickers }) => ({ label, pickers }));
    const groups = groupsRaw.filter((g) => !g.isIndividual).map(({ label, pickers }) => ({ label, pickers }));

    return { unpaid, groups, individuals };
  }, [filteredPickersForPay]);

  /** Total amount to pay for currently selected pickers (Pay tab) */
  const selectedTotalPay = useMemo(() => {
    let sum = 0;
    paySelectedIds.forEach((id) => {
      const p = pickersForCollection.find((x) => x.id === id);
      if (p) sum += p.totalPay ?? 0;
    });
    return sum;
  }, [paySelectedIds, pickersForCollection]);

  const nextPickerNumber = useMemo(() => {
    const max = pickersForCollection.length
      ? Math.max(...pickersForCollection.map((p) => p.pickerNumber ?? 0))
      : 0;
    return max + 1;
  }, [pickersForCollection]);

  const weighEntriesForCollection = useMemo(() => {
    if (!selectedCollectionId) return [];
    return allWeighEntries.filter((e) => e.collectionId === selectedCollectionId);
  }, [allWeighEntries, selectedCollectionId]);

  const nextTripForPicker = useMemo(() => {
    const map: Record<string, number> = {};
    pickersForCollection.forEach((p) => {
      const entries = weighEntriesForCollection.filter((e) => e.pickerId === p.id);
      const maxTrip = entries.length === 0 ? 0 : Math.max(...entries.map((e) => e.tripNumber ?? 0));
      map[p.id] = maxTrip + 1;
    });
    return map;
  }, [pickersForCollection, weighEntriesForCollection]);

  // Precompute trip counts per picker so card rendering is cheap and fast when typing
  const tripCountForPicker = useMemo(() => {
    const counts: Record<string, number> = {};
    weighEntriesForCollection.forEach((e) => {
      const id = e.pickerId;
      counts[id] = (counts[id] ?? 0) + 1;
    });
    return counts;
  }, [weighEntriesForCollection]);

  const totalsFromPickers = useMemo(() => {
    let totalKg = 0;
    let totalPay = 0;
    pickersForCollection.forEach((p) => {
      totalKg += p.totalKg ?? 0;
      totalPay += p.totalPay ?? 0;
    });
    return { totalKg, totalPay };
  }, [pickersForCollection]);

  const allPickersPaid = useMemo(
    () => pickersForCollection.length > 0 && pickersForCollection.every((p) => p.isPaid),
    [pickersForCollection]
  );

  const totalRevenue = useMemo(() => {
    const price = Number(buyerPricePerKg || 0);
    return totalsFromPickers.totalKg * price;
  }, [totalsFromPickers.totalKg, buyerPricePerKg]);

  const profit = useMemo(
    () => totalRevenue - totalsFromPickers.totalPay,
    [totalRevenue, totalsFromPickers.totalPay]
  );

  const handleCreateCollection = async () => {
    if (!companyId || !effectiveProject) return;
    setCreating(true);
    try {
      const name = (newCollectionName || '').trim();
      if (!name) {
        toast({ title: 'Name required', description: 'Give the collection a name.', variant: 'destructive' });
        setCreating(false);
        return;
      }
      const harvestDate = new Date(newHarvestDate + 'T12:00:00');
      const price = Number(newPricePerKgPicker || 0);
      if (price <= 0) {
        toast({ title: 'Invalid rate', description: 'Price per kg (picker) must be > 0', variant: 'destructive' });
        setCreating(false);
        return;
      }
      const id = await createHarvestCollection({
        companyId,
        projectId: effectiveProject.id,
        cropType: effectiveProject.cropType,
        name,
        harvestDate,
        pricePerKgPicker: price,
      });

      // For French Beans: auto-carry forward current MAIN wallet balance as starting balance.
      // The main wallet is the one shown next to the "New collection" button, which is tied
      // to the first French Beans collection's cash pool.
      const isFrenchBeans = String(effectiveProject.cropType).toLowerCase() === 'french-beans';
      if (isFrenchBeans) {
        const mainFbCollection = collections.find(
          (c) => String(c.cropType).toLowerCase() === 'french-beans'
        );
        const mainPool =
          mainFbCollection != null ? cashPoolByCollection[mainFbCollection.id] : undefined;
        const mainRemaining = Number(mainPool?.remainingBalance ?? 0);

        if (mainRemaining > 0) {
          try {
            await registerHarvestCash({
              collectionId: id,
              projectId: effectiveProject.id,
              companyId,
              cropType: String(effectiveProject.cropType),
              cashReceived: mainRemaining,
              source: 'carry-forward',
              receivedBy: user?.name || user?.email || user?.id || 'system',
            });
            queryClient.invalidateQueries({ queryKey: ['harvestCashPools'] });
          } catch (e: any) {
            // If auto wallet setup fails, continue but inform the user
            toast({
              title: 'Wallet not linked automatically',
              description: e?.message ?? 'You may need to register harvest cash for this collection manually.',
              variant: 'destructive',
            });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['harvestCollections'] });
      setSelectedCollectionId(id);
      setViewMode('intake');
      setNewCollectionOpen(false);
      setNewCollectionName('');
      setNewHarvestDate(format(new Date(), 'yyyy-MM-dd'));
      setNewPricePerKgPicker('140');
      toast({ title: 'Collection created', description: 'Add pickers and weigh entries.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to create collection', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleAddPicker = async () => {
    if (!companyId || !selectedCollectionId) return;
    const num = Number(newPickerNumber || '0');
    const name = (newPickerName || '').trim();
    if (num <= 0 || !name) {
      toast({ title: 'Invalid input', description: 'Picker number and name required', variant: 'destructive' });
      return;
    }
    const numberTaken = pickersForCollection.some((p) => (p.pickerNumber ?? 0) === num);
    if (numberTaken) {
      toast({
        title: 'Number already used',
        description: 'One number can only have one picker in this collection. Use a different number.',
        variant: 'destructive',
      });
      return;
    }
    setAddingPicker(true);
    try {
      await addHarvestPicker({
        companyId,
        collectionId: selectedCollectionId,
        pickerNumber: num,
        pickerName: name,
      });
      queryClient.invalidateQueries({ queryKey: ['harvestPickers'] });
      setAddPickerOpen(false);
      setNewPickerNumber('');
      setNewPickerName('');
      toast({ title: 'Picker added' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to add picker', variant: 'destructive' });
    } finally {
      setAddingPicker(false);
    }
  };

  const handleAddWeigh = () => {
    if (!companyId || !selectedCollectionId || !weighPickerId || !selectedCollection) return;
    const kg = Number(weighKg || '0');
    const trip = Number(weighTrip || '1');
    if (kg <= 0) {
      toast({ title: 'Invalid weight', description: 'Weight must be > 0', variant: 'destructive' });
      return;
    }
    const pricePerKg = selectedCollection.pricePerKgPicker ?? 0;

    // Optimistic update: apply new totals in cache so UI updates instantly
    const updatedPickers = allPickers.map((p) =>
      p.id === weighPickerId
        ? {
            ...p,
            totalKg: (p.totalKg ?? 0) + kg,
            totalPay: Math.round(((p.totalKg ?? 0) + kg) * pricePerKg),
          }
        : p
    );
    const pickersInCollection = updatedPickers.filter((p) => p.collectionId === selectedCollectionId);
    const totalHarvestKg = pickersInCollection.reduce((s, p) => s + (p.totalKg ?? 0), 0);
    const totalPickerCost = pickersInCollection.reduce((s, p) => s + (p.totalPay ?? 0), 0);
    const updatedCollections = allCollections.map((c) =>
      c.id === selectedCollectionId ? { ...c, totalHarvestKg, totalPickerCost } : c
    );

    queryClient.setQueryData(['harvestPickers'], updatedPickers);
    queryClient.setQueryData(['harvestCollections'], updatedCollections);

    setAddWeighOpen(false);
    setWeighPickerId('');
    setWeighKg('');
    setWeighTrip('1');
    setWeighOpenedFromCard(false);
    requestAnimationFrame(() => {
      toast({ title: 'Saved' });
    });

    // Save to server in background; sync state when done
    addPickerWeighEntry({
      companyId,
      pickerId: weighPickerId,
      collectionId: selectedCollectionId,
      weightKg: kg,
      tripNumber: trip,
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['pickerWeighEntries'] });
        queryClient.invalidateQueries({ queryKey: ['harvestPickers'] });
        queryClient.invalidateQueries({ queryKey: ['harvestCollections'] });
      })
      .catch((e: any) => {
        toast({ title: 'Save failed', description: e?.message ?? 'Could not save weight', variant: 'destructive' });
        queryClient.invalidateQueries({ queryKey: ['pickerWeighEntries'] });
        queryClient.invalidateQueries({ queryKey: ['harvestPickers'] });
        queryClient.invalidateQueries({ queryKey: ['harvestCollections'] });
      });
  };

  const handleMarkPickerPaid = async (pickerId: string) => {
    const picker = allPickers.find((p) => p.id === pickerId);
    if (!picker) return;

    // Prevent double-marking an already paid picker
    if (picker.isPaid) {
      toast({
        title: 'Already paid',
        description: 'This picker is already marked as paid.',
      });
      return;
    }

    const payAmount = picker.totalPay ?? 0;

    if (isFrenchBeansCollection && selectedCollectionId && effectiveProject && user?.companyId) {
      try {
        await applyHarvestCashPayment({
          companyId: user.companyId,
          projectId: effectiveProject.id,
          cropType: String(effectiveProject.cropType),
          collectionId: selectedCollectionId,
          amount: payAmount,
        });
        // Refresh harvest cash pools and shared wallet so balances update in UI
        queryClient.invalidateQueries({ queryKey: ['harvestCashPools'] });
        queryClient.invalidateQueries({ queryKey: harvestWalletQueryKey });
      } catch (e: any) {
        toast({
          title: 'Cannot pay picker',
          description: e?.message ?? 'Not enough cash in Harvest Wallet.',
          variant: 'destructive',
        });
        return;
      }
    }

    const updatedPickers = allPickers.map((p) =>
      p.id === pickerId ? { ...p, isPaid: true, paidAt: new Date() } : p
    );
    queryClient.setQueryData(['harvestPickers'], updatedPickers);
    toast({ title: 'Paid' });
    markPickerCashPaid(pickerId).catch((e: any) => {
      toast({ title: 'Sync failed', description: e?.message, variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['harvestPickers'] });
    });
  };

  const togglePaySelection = (pickerId: string) => {
    setPaySelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pickerId)) next.delete(pickerId);
      else next.add(pickerId);
      return next;
    });
  };

  const handleMarkMultiplePaid = async (pickerIds: string[]) => {
    if (pickerIds.length === 0 || !selectedCollectionId || !companyId || !effectiveProject) return;

    // Only operate on pickers that are not yet paid to avoid
    // duplicate payment batches and "document already exists" errors.
    const unpaidIds = pickerIds.filter((id) => {
      const p = allPickers.find((x) => x.id === id);
      return p && !p.isPaid;
    });

    if (unpaidIds.length === 0) {
      toast({
        title: 'Nothing to pay',
        description: 'All selected pickers are already marked as paid.',
      });
      setPaySelectedIds(new Set());
      return;
    }

    if (isFrenchBeansCollection && user?.companyId && effectiveProject) {
      setPayingSelected(true);
      try {
        await payPickersFromWalletBatchFirestore({
          companyId,
          projectId: effectiveProject.id,
          cropType: String(effectiveProject.cropType),
          collectionId: selectedCollectionId,
          pickerIds: unpaidIds,
        });

        const updatedPickers = allPickers.map((p) =>
          unpaidIds.includes(p.id) ? { ...p, isPaid: true, paidAt: new Date() } : p
        );
        queryClient.setQueryData(['harvestPickers'], updatedPickers);
        // Refresh harvest cash pools and shared wallet so balances update in UI
        queryClient.invalidateQueries({ queryKey: ['harvestCashPools'] });
        queryClient.invalidateQueries({ queryKey: harvestWalletQueryKey });
        setPaySelectedIds(new Set());
        toast({ title: `${unpaidIds.length} marked paid` });
      } catch (e: any) {
        console.error('payPickersFromWalletBatchFirestore error', e);
        toast({
          title: 'Cannot pay selected pickers',
          description: e?.message ?? 'Not enough cash in Harvest Wallet.',
          variant: 'destructive',
        });
        return;
      } finally {
        setPayingSelected(false);
      }
      return;
    }

    // Non-wallet collections: mark paid locally & via batch as before
    const updatedPickers = allPickers.map((p) =>
      unpaidIds.includes(p.id) ? { ...p, isPaid: true, paidAt: new Date() } : p
    );
    queryClient.setQueryData(['harvestPickers'], updatedPickers);
    setPaySelectedIds(new Set());
    toast({ title: `${unpaidIds.length} marked paid` });
  };

  const handleSetBuyerPrice = async (markBuyerPaid: boolean) => {
    if (!selectedCollectionId) return;
    const price = Number(buyerPricePerKg || 0);
    if (price <= 0) {
      toast({ title: 'Invalid price', description: 'Buyer price per kg must be > 0', variant: 'destructive' });
      return;
    }
    if (markBuyerPaid && !allPickersPaid) {
      toast({
        title: 'Cannot close',
        description: 'All pickers must be marked cash paid before marking buyer paid.',
        variant: 'destructive',
      });
      return;
    }
    setMarkingBuyerPaid(true);
    try {
      await setBuyerPriceAndMaybeClose({
        collectionId: selectedCollectionId,
        pricePerKgBuyer: price,
        markBuyerPaid,
      });
      queryClient.invalidateQueries({ queryKey: ['harvestCollections'] });
      if (markBuyerPaid) {
        toast({ title: 'Buyer paid – harvest closed' });
        setBuyerPricePerKg('');
      } else {
        toast({ title: 'Buyer price saved' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed', variant: 'destructive' });
    } finally {
      setMarkingBuyerPaid(false);
    }
  };

  const syncTotals = async () => {
    if (!selectedCollectionId) return;
    try {
      await recalcCollectionTotals(selectedCollectionId);
      queryClient.invalidateQueries({ queryKey: ['harvestCollections'] });
      toast({ title: 'Totals synced' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to sync', variant: 'destructive' });
    }
  };

  if (!effectiveProject) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Harvest Collections</h1>
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="pt-6">
            <p className="text-foreground">
              {routeProjectId
                ? 'Project not found or you don’t have access. Select a project from the navbar or open Harvest Collections from the Harvest page for a French Beans project.'
                : 'Select a project from the navbar to manage field harvest collections (pickers, weigh-in, cash payouts, buyer settlement).'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
      <div className="px-2 sm:px-4 md:px-6 py-2 sm:py-4 md:py-6 space-y-3 sm:space-y-4 w-full min-w-0">
      {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {selectedCollectionId ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg gap-1 text-sm"
              onClick={() => {
                setSelectedCollectionId(null);
                setViewMode('list');
              }}
            >
              <ChevronLeft className="h-5 w-5" />
              Back
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg gap-1 text-sm"
              onClick={() => navigate('/harvest-sales')}
            >
              <ChevronLeft className="h-5 w-5" />
              Back
            </Button>
          )}
          <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate">
            {selectedCollectionId ? (selectedCollection?.name ?? 'Collection') : 'Harvest Collections'}
          </h1>
        </div>
        {!selectedCollectionId && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="text-sm min-h-9 px-4 rounded-lg shadow bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setNewCollectionOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New collection
            </Button>
            {hasFrenchBeansCollections && (() => {
              const fb = collections.find(
                (c) => String(c.cropType).toLowerCase() === 'french-beans'
              );
              if (!fb) return null;
              const pool = cashPoolByCollection[fb.id];
              // Use shared harvest wallet so balance deducts when paying from any collection
              const totalPaidOut = harvestWallet?.cashPaidOutTotal ?? pool?.totalPaidOut ?? 0;
              const remaining = harvestWallet?.currentBalance ?? pool?.remainingBalance ?? 0;
              const cashReceived = harvestWallet?.cashReceivedTotal ?? pool?.cashReceived ?? 0;
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs min-h-8 px-3 rounded-lg inline-flex items-center gap-1"
                      onClick={() => {
                        setCashDialogCollection(fb as any);
                        setCashPreviousAmount(cashReceived);
                        // For top-up UX, start with empty input so user types the new amount to add
                        setCashAmount('');
                        setCashSource((pool?.source as 'bank' | 'broker') ?? 'bank');
                        setCashDialogVisible(false);
                      }}
                    >
                      <Banknote className="h-3 w-3" />
                      <span>Wallet</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-sm bg-emerald-950/70 backdrop-blur-lg border-emerald-400/80 shadow-lg rounded-2xl text-emerald-50" align="center" side="bottom">
                    <div className="space-y-4 text-center relative">
                      <button
                        type="button"
                        className="absolute right-1.5 top-1.5 h-5 w-5 rounded-full bg-emerald-800 text-emerald-50 flex items-center justify-center text-xs"
                        onClick={() => setCashDialogVisible(false)}
                      >
                        ×
                      </button>
                      <div className="flex flex-col items-center gap-2 pt-4">
                        <p className="text-xs font-semibold text-emerald-50">Harvest Cash Wallet</p>
                        {/* Current balance big & blur-able with eye icon */}
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-[11px] text-emerald-100">Current balance</p>
                            <p
                              className={cn(
                                'text-xl font-extrabold tabular-nums text-emerald-50',
                                !cashDialogVisible && 'blur-sm select-none'
                              )}
                            >
                              KES {remaining.toLocaleString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="mt-3 inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-800 text-emerald-50"
                            onClick={() => setCashDialogVisible((v) => !v)}
                          >
                            {cashDialogVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {/* Paid out + Cash received */}
                        <div className="flex items-center justify-center gap-4 mt-1">
                          <div>
                            <p className="text-[11px] text-emerald-100">Paid out</p>
                            <p
                              className={cn(
                                'font-semibold tabular-nums text-emerald-50',
                                !cashDialogVisible && 'blur-sm select-none'
                              )}
                            >
                              KES {totalPaidOut.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-emerald-100">Cash received</p>
                            <p
                              className={cn(
                                'font-semibold tabular-nums text-emerald-50',
                                !cashDialogVisible && 'blur-sm select-none'
                              )}
                            >
                              KES {cashReceived.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Edit cash area */}
                      <div className="pt-3 border-t border-emerald-500/70 space-y-3 mt-2 text-left">
                        <div className="space-y-1">
                          <p className="text-[11px] text-emerald-100">Current cash received</p>
                          <p
                            className={cn(
                              'text-sm font-semibold text-emerald-50 tabular-nums',
                              !cashDialogVisible && 'blur-sm select-none'
                            )}
                          >
                            KES {cashReceived.toLocaleString()}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-emerald-100">Set cash received (KES)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={cashAmount}
                            onChange={(e) => setCashAmount(e.target.value)}
                            className="min-h-9 rounded-xl bg-emerald-900/60 border-emerald-400/80 text-emerald-50 placeholder:text-emerald-300"
                            placeholder="e.g. 150000"
                          />
                          <Label className="mt-2 text-xs text-emerald-100">Source</Label>
                          <UiSelect
                            value={cashSource}
                            onValueChange={(val) => setCashSource(val as 'bank' | 'broker' | 'custom')}
                          >
                            <SelectTrigger className="w-full min-h-9 rounded-xl border border-emerald-400/80 bg-emerald-900/60 px-3 py-1.5 text-xs text-emerald-50">
                              <SelectValue placeholder="Select source" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bank">Bank</SelectItem>
                              <SelectItem value="broker">Broker</SelectItem>
                              <SelectItem value="custom">Custom…</SelectItem>
                            </SelectContent>
                          </UiSelect>
                          {cashSource === 'custom' && (
                            <Input
                              value={cashSourceCustom}
                              onChange={(e) => setCashSourceCustom(e.target.value)}
                              className="min-h-9 rounded-xl bg-emerald-900/60 border-emerald-400/80 text-emerald-50 placeholder:text-emerald-300 mt-2"
                              placeholder="Enter custom source (e.g. Mpesa float)"
                            />
                          )}
                          <Button
                            size="sm"
                            className="mt-3 rounded-full bg-amber-100 text-emerald-900 border border-emerald-500 hover:bg-amber-200 hover:text-emerald-950 font-semibold shadow-sm"
                            disabled={cashDialogSaving}
                            onClick={() => {
                              setCashDialogCollection(fb as any);
                              handleSaveCash();
                            }}
                          >
                            {cashDialogSaving ? (
                              <>
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              'Add / Update Cash'
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })()}
          </div>
        )}
      </div>

      {/* List of collections */}
      {!selectedCollectionId && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Project: <span className="font-medium text-foreground">{effectiveProject.name}</span>
          </p>
          {loadingCollections ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : collections.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-center py-4">
                  No collections yet. Start a day session with &quot;New collection&quot;.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-3">
              {collections.map((c, index) => {
                const displayName = c.name?.trim() || formatDate(c.harvestDate);
                const totalPay = (c.totalPickerCost ?? 0);
                const totalWeight = (c.totalHarvestKg ?? 0);
                const isFrenchBeans = String(c.cropType).toLowerCase() === 'french-beans';
                const pool = cashPoolByCollection[c.id];
                const Icon = COLLECTION_ICONS[index % COLLECTION_ICONS.length];
                return (
                  <Card
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50 active:scale-[0.98] transition-all rounded-2xl flex flex-col overflow-hidden min-h-[160px] sm:min-h-[150px] md:min-h-[140px]"
                    onClick={() => {
                      setSelectedCollectionId(c.id);
                      setViewMode('intake');
                    }}
                  >
                    <CardContent className="p-4 sm:p-3 md:p-3 flex flex-col flex-1 justify-center items-center text-center min-h-0 relative">
                      <span
                        className={cn(
                          'absolute top-1.5 right-1.5 text-[9px] font-medium px-1.5 py-0.5 rounded',
                          c.status === 'closed' && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                          c.status === 'collecting' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                          c.status === 'payout_complete' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                          c.status === 'sold' && 'bg-slate-100 text-slate-700 dark:bg-slate-800/30 dark:text-slate-300'
                        )}
                      >
                        {c.status}
                      </span>
                      <div className="w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-muted flex items-center justify-center mb-2 shrink-0">
                        <Icon className="h-5 w-5 sm:h-5 sm:w-5 text-muted-foreground" />
                      </div>
                      <div className="w-full flex-1 flex flex-col justify-center min-h-0">
                        <span className="font-bold text-foreground text-base sm:text-sm leading-tight line-clamp-2 block">
                          {displayName}
                        </span>
                      </div>
                      <div className="w-full space-y-0.5 text-center mt-auto pt-1.5 border-t border-border">
                        <div className="text-sm font-bold text-foreground tabular-nums">
                          KES {totalPay.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">{(totalWeight).toFixed(1)} kg</div>
                        {/* No per-card wallet button – wallet is controlled from header and inside collection view */}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Collection detail: Intake / Pay / Buyer */}
      {selectedCollection && selectedCollectionId && (
        <>
          <div className="flex items-start gap-2">
            {statsExpanded && (
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 py-2 px-2 sm:px-3 rounded-xl bg-muted/40">
                  <span className="font-semibold text-foreground text-sm sm:text-base">
                    {selectedCollection.name?.trim() || formatDate(selectedCollection.harvestDate)}
                  </span>
                  {selectedCollection.pricePerKgPicker != null && (
                    <span className="text-xs text-muted-foreground">@{selectedCollection.pricePerKgPicker}/kg</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SimpleStatCard
                    layout="mobile-compact"
                    title="Total kg"
                    value={((totalsFromPickers.totalKg ?? selectedCollection.totalHarvestKg) ?? 0).toFixed(1)}
                    icon={Scale}
                    iconVariant="primary"
                    className="py-2 px-2 text-sm"
                  />
                  <SimpleStatCard
                    layout="mobile-compact"
                    title="Total amount"
                    value={`KES ${((totalsFromPickers.totalPay ?? selectedCollection.totalPickerCost) ?? 0).toLocaleString()}`}
                    icon={Banknote}
                    iconVariant="primary"
                    className="py-2 px-2 text-sm"
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setStatsExpanded((e) => !e)}
              className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-muted touch-manipulation"
              aria-expanded={statsExpanded}
              title={statsExpanded ? 'Hide totals' : 'Show totals'}
            >
              {statsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {isFrenchBeansCollection && selectedCollection && (
            <div className="mt-3 flex justify-end">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                    onClick={() => {
                      setCashDialogCollection(selectedCollection as any);
                      const existingReceived = Number(cashPoolForCollection?.cashReceived ?? 0);
                      setCashPreviousAmount(existingReceived);
                      // For top-up UX, keep input empty so user types the new amount to add
                      setCashAmount('');
                      setCashSource((cashPoolForCollection?.source as 'bank' | 'broker') ?? 'bank');
                      setCashDialogVisible(false);
                    }}
                  >
                    <Banknote className="h-3 w-3" />
                    <span>Wallet</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 md:w-[420px] text-sm bg-emerald-950/70 backdrop-blur-lg border-emerald-400/80 shadow-lg rounded-2xl text-emerald-50"
                  align="center"
                  side="bottom"
                >
                  <div className="space-y-4 text-center py-3">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-xs font-semibold text-emerald-50">Harvest Cash Wallet</p>
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p className="text-[11px] text-emerald-100">Current balance (shared)</p>
                        <div className="flex items-center justify-center gap-2">
                          <p
                            className={cn(
                              'text-xl font-extrabold tabular-nums text-emerald-50',
                              !cashDialogVisible && 'blur-sm select-none'
                            )}
                          >
                            KES {(harvestWallet?.currentBalance ?? cashPoolForCollection?.remainingBalance ?? 0).toLocaleString()}
                          </p>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-800 text-emerald-50"
                            onClick={() => setCashDialogVisible((v) => !v)}
                          >
                            {cashDialogVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-full">
            <div className="flex flex-nowrap gap-1.5 sm:gap-2 overflow-x-auto pb-1 min-w-0">
              <button
                type="button"
                onClick={() => setViewMode('intake')}
                className={cn(
                  'flex-shrink-0 min-h-9 sm:min-h-10 px-2.5 sm:px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 shadow-md border-2 transition-all touch-manipulation',
                  viewMode === 'intake'
                    ? 'bg-emerald-500 text-white border-emerald-600 ring-2 ring-emerald-400/50'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
                )}
              >
                <Scale className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                Intake
              </button>
              <button
                type="button"
                onClick={() => setViewMode('pay')}
                className={cn(
                  'flex-shrink-0 min-h-9 sm:min-h-10 px-2.5 sm:px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 shadow-md border-2 transition-all touch-manipulation',
                  viewMode === 'pay'
                    ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-400/50'
                    : 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800'
                )}
              >
                <Banknote className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                Pay mode
              </button>
              <button
                type="button"
                onClick={() => setViewMode('buyer')}
                className={cn(
                  'flex-shrink-0 min-h-9 sm:min-h-10 px-2.5 sm:px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 shadow-md border-2 transition-all touch-manipulation',
                  viewMode === 'buyer'
                    ? 'bg-violet-500 text-white border-violet-600 ring-2 ring-violet-400/50'
                    : 'bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800'
                )}
              >
                <ShoppingCart className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                Buyer
              </button>
            </div>

            <TabsContent value="intake" className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
              <div className="flex flex-wrap gap-2 items-stretch">
                <Button
                  size="sm"
                  className="min-h-9 rounded-lg touch-manipulation flex-shrink-0 text-xs"
                  onClick={() => {
                    setNewPickerNumber(String(nextPickerNumber));
                    setAddPickerOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add picker
                </Button>
                {pickersForCollection.length > 0 && (
                  <div className="relative max-w-xs flex-1 min-w-[180px]">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search name or number..."
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      className="pl-7 min-h-9 rounded-lg text-sm bg-muted/50 border-muted-foreground/20 w-full"
                    />
                  </div>
                )}
              </div>
              {pickersForCollection.length === 0 ? (
                <p className="text-muted-foreground text-sm">Add pickers, then tap a card to add weight.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {filteredPickers.length === 0 ? (
                      <p className="w-full text-muted-foreground text-sm">No picker matches &quot;{pickerSearch}&quot;</p>
                    ) : (
                      filteredPickers.map((p) => {
                        const tripCount = tripCountForPicker[p.id] ?? 0;
                        const nextTrip = nextTripForPicker[p.id] ?? 1;
                        const isPaid = p.isPaid;
                        return (
                          <Card
                            key={p.id}
                            className={cn(
                              'relative transition-all w-[48%] min-w-[145px] sm:w-[160px] min-h-[130px] flex flex-col overflow-hidden shrink-0',
                              isPaid
                                ? 'opacity-75 cursor-not-allowed bg-muted/50'
                                : 'cursor-pointer hover:bg-muted/50 active:scale-[0.98]'
                            )}
                            onClick={isPaid ? undefined : () => {
                              setWeighPickerId(p.id);
                              setWeighTrip(String(nextTrip));
                              setWeighKg('');
                              setWeighOpenedFromCard(true);
                              setAddWeighOpen(true);
                            }}
                          >
                            <CardContent className="p-2 flex flex-col flex-1 justify-between min-h-0 text-center">
                              <div className="absolute top-1 right-1 px-1.5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold tabular-nums text-foreground">
                                {tripCount}
                              </div>
                              <div className="flex justify-center flex-shrink-0 pt-1">
                                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold tabular-nums shadow-lg ring-2 ring-background">
                                  {p.pickerNumber}
                                </div>
                              </div>
                              <div className="font-semibold text-foreground text-xs sm:text-sm leading-tight line-clamp-2 mt-1">
                                {p.pickerName}
                              </div>
                              <div className="text-[11px] sm:text-xs font-semibold text-muted-foreground tabular-nums mt-0.5">
                                {(p.totalKg ?? 0).toFixed(1)} kg · KES {(p.totalPay ?? 0).toLocaleString()}
                              </div>
                              <div className={cn(
                                'text-[10px] border-t border-border pt-1.5 mt-1',
                                isPaid ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'
                              )}>
                                {isPaid ? 'Paid' : '+ add'}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="pay" className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {pickersForCollection.length > 0 && (
                  <div className="relative max-w-xs">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search name or number..."
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      className="pl-7 min-h-9 rounded-lg text-sm bg-muted/50 border-muted-foreground/20"
                    />
                  </div>
                )}
                {paySelectedIds.size > 0 && (
                  <Button
                    size="sm"
                    className="min-h-9 rounded-lg font-semibold"
                    disabled={payingSelected}
                    onClick={() => handleMarkMultiplePaid(Array.from(paySelectedIds))}
                  >
                    {payingSelected ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Paying selected ({paySelectedIds.size}) — KES {selectedTotalPay.toLocaleString()}
                      </>
                    ) : (
                      <>Pay selected ({paySelectedIds.size}) — KES {selectedTotalPay.toLocaleString()}</>
                    )}
                  </Button>
                )}
              </div>
              <div className="space-y-4">
                {pickersForCollection.length === 0 ? (
                  <p className="w-full text-muted-foreground text-sm">Add pickers in Intake first.</p>
                ) : filteredPickersForPay.length === 0 ? (
                  <p className="w-full text-muted-foreground text-sm">No picker matches &quot;{pickerSearch}&quot;</p>
                ) : (
                  <>
                    {payUnpaidAndGroups.unpaid.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Unpaid</p>
                        <div className="flex flex-wrap gap-2">
                          {payUnpaidAndGroups.unpaid.map((p) => {
                            const selected = paySelectedIds.has(p.id);
                            const tripCount = tripCountForPicker[p.id] ?? 0;
                            return (
                              <Card
                                key={p.id}
                                className={cn(
                                  'relative w-[48%] min-w-[145px] sm:w-[160px] min-h-[130px] flex flex-col overflow-hidden transition-all active:scale-[0.98] shrink-0 cursor-pointer hover:bg-muted/50 bg-card',
                                  selected && 'ring-2 ring-primary ring-offset-2'
                                )}
                                onClick={() => togglePaySelection(p.id)}
                              >
                                <CardContent className="p-2 flex flex-col flex-1 justify-between min-h-0 text-center">
                                  <div className="absolute top-1 right-1 px-1.5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold tabular-nums text-foreground">
                                    {tripCount}
                                  </div>
                                  <div className="flex justify-center flex-shrink-0 pt-1">
                                    <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold tabular-nums shadow-lg ring-2 ring-background">
                                      {p.pickerNumber}
                                    </div>
                                  </div>
                                  <div className="font-medium text-foreground text-xs leading-tight line-clamp-2 mt-1">
                                    {p.pickerName}
                                  </div>
                                  <div className="border-t border-border pt-1.5 mt-1 space-y-0.5">
                                    <div className="text-lg font-bold text-foreground tabular-nums leading-none">
                                      KES {(p.totalPay ?? 0).toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground tabular-nums">
                                      {(p.totalKg ?? 0).toFixed(1)} kg
                                    </div>
                                  </div>
                                  <div className="min-h-7 flex items-center justify-center rounded bg-muted text-muted-foreground font-medium text-[10px] pt-1">
                                    {selected ? 'Selected' : 'Tap to select'}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Individuals section */}
                    {payUnpaidAndGroups.individuals.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Individuals</p>
                        <div className="flex flex-wrap gap-3">
                          {payUnpaidAndGroups.individuals.map(({ label, pickers }) => {
                            const p = pickers[0];
                            const tripCount = tripCountForPicker[p.id] ?? 0;
                            return (
                              <Card
                                key={p.id}
                                className="relative flex items-center gap-2 px-2 py-2 min-h-[72px] bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 flex-1 min-w-[230px] max-w-sm"
                              >
                                <div className="absolute top-1 right-1 px-1.5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold tabular-nums text-foreground">
                                  {tripCount}
                                </div>
                                <div className="flex items-center gap-2 flex-1">
                                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-base font-bold tabular-nums shadow ring-2 ring-background">
                                    {p.pickerNumber}
                                  </div>
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="font-semibold text-xs text-foreground truncate">{p.pickerName}</p>
                                      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                      <span className="text-[11px] font-bold tabular-nums text-foreground">
                                        KES {(p.totalPay ?? 0).toLocaleString()}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground tabular-nums">
                                        {(p.totalKg ?? 0).toFixed(1)} kg
                                      </span>
                                    </div>
                                    <div className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 font-medium mt-0.5">
                                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                                      <span>PAID</span>
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Group section */}
                    {payUnpaidAndGroups.groups.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Groups</p>
                        <div className="flex flex-wrap gap-3">
                          {payUnpaidAndGroups.groups.map(({ label, pickers }) => (
                            <div
                              key={label}
                              className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-3 flex-1 min-w-[260px] max-w-md"
                            >
                              <p className="text-sm font-semibold text-foreground mb-2 text-center">{label}</p>
                              <div className="flex flex-col gap-2">
                                {pickers.map((p) => {
                                  const tripCount = tripCountForPicker[p.id] ?? 0;
                                  return (
                                    <Card
                                      key={p.id}
                                      className="relative flex items-center gap-2 px-2 py-2 min-h-[72px] bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                                    >
                                      <div className="absolute top-1 right-1 px-1.5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold tabular-nums text-foreground">
                                        {tripCount}
                                      </div>
                                      <div className="flex items-center gap-2 flex-1">
                                        <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-base font-bold tabular-nums shadow ring-2 ring-background">
                                          {p.pickerNumber}
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-0">
                                          <p className="font-semibold text-xs text-foreground truncate">{p.pickerName}</p>
                                          <div className="flex items-center justify-between gap-2 mt-0.5">
                                            <span className="text-[11px] font-bold tabular-nums text-foreground">
                                              KES {(p.totalPay ?? 0).toLocaleString()}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground tabular-nums">
                                              {(p.totalKg ?? 0).toFixed(1)} kg
                                            </span>
                                          </div>
                                          <div className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 font-medium mt-0.5">
                                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                                            <span>PAID</span>
                                          </div>
                                        </div>
                                      </div>
                                    </Card>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="buyer" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Buyer sale</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Price per kg (buyer) — KES</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 180"
                      value={buyerPricePerKg}
                      onChange={(e) => setBuyerPricePerKg(e.target.value)}
                      className="text-lg min-h-12 rounded-xl"
                    />
                  </div>
                  {Number(buyerPricePerKg || 0) > 0 && (
                    <div className="space-y-1 text-sm">
                      <p>
                        Total revenue: <strong>KES {totalRevenue.toLocaleString()}</strong>
                      </p>
                      <p>
                        Profit: <strong className={profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          KES {profit.toLocaleString()}
                        </strong>
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      size="lg"
                      variant="outline"
                      className="min-h-12 rounded-xl flex-1"
                      disabled={!buyerPricePerKg || markingBuyerPaid}
                      onClick={() => handleSetBuyerPrice(false)}
                    >
                      Save buyer price
                    </Button>
                    <Button
                      size="lg"
                      className="min-h-12 rounded-xl flex-1 bg-green-600 hover:bg-green-700"
                      disabled={!buyerPricePerKg || !allPickersPaid || markingBuyerPaid || selectedCollection.status === 'closed'}
                      onClick={() => handleSetBuyerPrice(true)}
                    >
                      MARK BUYER PAID
                    </Button>
                  </div>
                  {!allPickersPaid && pickersForCollection.length > 0 && (
                    <p className="text-amber-600 dark:text-amber-400 text-sm">
                      All pickers must be marked cash paid before closing.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* New collection dialog */}
      <Dialog open={newCollectionOpen} onOpenChange={setNewCollectionOpen}>
        <DialogContent className="w-full max-w-sm sm:max-w-md rounded-2xl mx-2 max-h-[80vh] sm:max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>Name the collection, set date and rate. Totals auto-calculate from weights.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Collection name</Label>
              <Input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="e.g. Morning shift, Block A"
                className="mt-1 min-h-11 rounded-xl"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={newHarvestDate}
                onChange={(e) => setNewHarvestDate(e.target.value)}
                className="mt-1 min-h-11 rounded-xl"
              />
            </div>
            <div>
              <Label>Price per kg (picker) — KES</Label>
              <Input
                type="number"
                min="1"
                value={newPricePerKgPicker}
                onChange={(e) => setNewPricePerKgPicker(e.target.value)}
                placeholder="140"
                className="mt-1 min-h-11 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCollectionOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCollection} disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Harvest cash wallet now uses popovers attached to Wallet buttons (no full-screen modal). */}

      {/* Add picker dialog */}
      <Dialog open={addPickerOpen} onOpenChange={setAddPickerOpen}>
        <DialogContent className="w-[88vw] max-w-xs sm:max-w-md rounded-2xl mx-auto max-h-[80vh] sm:max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add picker</DialogTitle>
            <DialogDescription>Number auto-fills (next in sequence). One number per picker in this collection.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Picker number</Label>
              <Input
                type="number"
                min="1"
                value={newPickerNumber}
                onChange={(e) => setNewPickerNumber(e.target.value)}
                placeholder={String(nextPickerNumber)}
                className="mt-1 min-h-11 rounded-xl"
              />
            </div>
            <div>
              <Label>Picker name</Label>
              <Input
                value={newPickerName}
                onChange={(e) => setNewPickerName(e.target.value)}
                placeholder="e.g. John"
                className="mt-1 min-h-11 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPickerOpen(false)}>Cancel</Button>
            <Button onClick={handleAddPicker} disabled={addingPicker}>
              {addingPicker ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add weigh entry dialog — opened from card (picker set) or standalone */}
      <Dialog
        open={addWeighOpen}
        onOpenChange={(open) => {
          setAddWeighOpen(open);
          if (!open) setWeighOpenedFromCard(false);
        }}
      >
        <DialogContent className="w-[88vw] max-w-xs sm:max-w-md rounded-2xl mx-auto max-h-[80vh] sm:max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add weight</DialogTitle>
            <DialogDescription>
              {weighOpenedFromCard && weighPickerId
                ? `Trip #${weighTrip}. Totals update when you save.`
                : 'Weight and trip for the picker.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {weighOpenedFromCard && weighPickerId ? (
              <p className="font-medium text-foreground">
                #{pickersForCollection.find((x) => x.id === weighPickerId)?.pickerNumber}{' '}
                {pickersForCollection.find((x) => x.id === weighPickerId)?.pickerName}
              </p>
            ) : (
              <div>
                <Label>Picker</Label>
                <select
                  value={weighPickerId}
                  onChange={(e) => {
                    setWeighPickerId(e.target.value);
                    const pid = e.target.value;
                    setWeighTrip(String(nextTripForPicker[pid] ?? 1));
                  }}
                  className="w-full mt-1 min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select picker</option>
                  {pickersForCollection.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.pickerNumber} {p.pickerName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label>Weight</Label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={weighKg}
                onChange={(e) => setWeighKg(e.target.value)}
                placeholder="e.g. 5.2"
                className="mt-1 min-h-12 rounded-xl text-lg"
                autoFocus
              />
            </div>
            <div>
              <Label>Trip number</Label>
              <Input
                type="number"
                min="1"
                value={weighTrip}
                onChange={(e) => setWeighTrip(e.target.value)}
                className="mt-1 min-h-11 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddWeighOpen(false)}>Cancel</Button>
            <Button onClick={handleAddWeigh} disabled={!weighPickerId || !weighKg.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
