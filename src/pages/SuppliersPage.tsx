import React, { useState, useMemo } from 'react';
import { Plus, Search, Star, Phone, Mail, List, LayoutGrid, Pencil, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { Supplier, InventoryItem } from '@/types';
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const CATEGORIES = ['Seeds', 'Fertilizers', 'Pesticides', 'Equipment'];

export default function SuppliersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const formatRating = (rating: number) => rating.toFixed(1);

  const getStatusBadge = (status: string) =>
    status === 'active' ? 'fv-badge--active' : 'bg-muted text-muted-foreground';

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [categories, setCategories] = useState<string[]>(['Seeds']);
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCategory, setEditCategory] = useState('Seeds');
  const [editSaving, setEditSaving] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewSaving, setReviewSaving] = useState(false);

  const { data: suppliers = [], isLoading } = useCollection<Supplier>('suppliers', 'suppliers');
  const { data: allInventoryItems = [] } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');

  const companySuppliers = useMemo(
    () => (user?.companyId ? suppliers.filter((s) => s.companyId === user.companyId) : suppliers),
    [suppliers, user?.companyId],
  );

  const filteredSuppliers = useMemo(() => {
    let list = companySuppliers;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) => {
          const cats = supplierCategories(s);
          return (
            s.name.toLowerCase().includes(q) ||
            (s.email?.toLowerCase().includes(q)) ||
            s.contact.includes(q) ||
            cats.some((cat) => cat.toLowerCase().includes(q))
          );
        },
      );
    }
    if (categoryFilter) {
      list = list.filter((s) => supplierCategories(s).includes(categoryFilter));
    }
    return list;
  }, [companySuppliers, search, categoryFilter]);

  const supplierCategories = (s: Supplier) => (s.categories && s.categories.length > 0) ? s.categories : (s.category ? [s.category] : []);

  const openDetail = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setEditName(supplier.name);
    setEditContact(supplier.contact);
    setEditEmail(supplier.email ?? '');
    setEditCategories(supplierCategories(supplier));
    setReviewNotes(supplier.reviewNotes ?? '');
    setReviewRating(supplier.rating ?? 0);
    setIsEditingSupplier(false);
    setDetailOpen(true);
  };

  const toggleAddCategory = (c: string) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };
  const toggleEditCategory = (c: string) => {
    setEditCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const linkedItems = useMemo(() => {
    if (!selectedSupplier?.id || !user?.companyId) return [];
    return allInventoryItems.filter(
      (item) => item.companyId === user.companyId && item.supplierId === selectedSupplier.id,
    );
  }, [allInventoryItems, selectedSupplier?.id, user?.companyId]);

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.companyId) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'suppliers'), {
        name,
        contact,
        email: email || null,
        category: categories[0] ?? null,
        categories: categories.length ? categories : null,
        rating: 0,
        status: 'active',
        companyId: user.companyId,
        createdAt: serverTimestamp(),
      });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setAddOpen(false);
      setName('');
      setContact('');
      setEmail('');
      setCategories(['Seeds']);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedSupplier) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, 'suppliers', selectedSupplier.id), {
        name: editName.trim(),
        contact: editContact.trim(),
        email: editEmail.trim() || null,
        category: editCategories[0] ?? null,
        categories: editCategories.length ? editCategories : null,
      });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setSelectedSupplier({ ...selectedSupplier, name: editName.trim(), contact: editContact.trim(), email: editEmail.trim() || undefined, category: editCategories[0], categories: editCategories });
      setIsEditingSupplier(false);
    } finally {
      setEditSaving(false);
    }
  };

  const handleSaveReview = async () => {
    if (!selectedSupplier) return;
    setReviewSaving(true);
    try {
      await updateDoc(doc(db, 'suppliers', selectedSupplier.id), {
        rating: reviewRating,
        reviewNotes: reviewNotes.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setSelectedSupplier({ ...selectedSupplier, rating: reviewRating, reviewNotes: reviewNotes.trim() || undefined });
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your supplier relationships</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Supplier</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddSupplier} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Name</label>
                <input className="fv-input w-full" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Contact</label>
                <input className="fv-input w-full" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+254 700 000 000" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Email</label>
                <input type="email" className="fv-input w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="supplier@example.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Categories</label>
                <div className="rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[2.5rem] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <div className="flex flex-wrap gap-3">
                    {CATEGORIES.map((c) => (
                      <label key={c} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={categories.includes(c)}
                          onCheckedChange={() => toggleAddCategory(c)}
                        />
                        <span className="text-foreground">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Select all categories this supplier provides</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Supplier'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search suppliers..."
            className="fv-input pl-10 w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="fv-input w-full sm:w-[180px]"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="flex rounded-lg border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn('rounded-md p-2', viewMode === 'list' ? 'bg-background shadow' : 'text-muted-foreground')}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('card')}
            className={cn('rounded-md p-2', viewMode === 'card' ? 'bg-background shadow' : 'text-muted-foreground')}
            title="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading suppliers…</p>
      )}

      {viewMode === 'list' && !isLoading && (
        <div className="fv-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Rating</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(supplier)}
                  >
                    <td className="font-medium">{supplier.name}</td>
                    <td>{supplierCategories(supplier).join(', ') || '—'}</td>
                    <td>{supplier.contact}</td>
                    <td className="text-muted-foreground">{supplier.email || '—'}</td>
                    <td>{formatRating(supplier.rating)}/5</td>
                    <td>
                      <span className={cn('fv-badge capitalize text-xs', getStatusBadge(supplier.status))}>
                        {supplier.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredSuppliers.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">No suppliers match your filters.</p>
          )}
        </div>
      )}

      {viewMode === 'card' && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              onClick={() => openDetail(supplier)}
              className={cn(
                'fv-card p-5 cursor-pointer transition-all duration-200',
                'hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5',
                'border border-border/80 rounded-xl',
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-xl">
                  {supplier.name.charAt(0)}
                </div>
                <span className={cn('fv-badge capitalize text-xs shrink-0', getStatusBadge(supplier.status))}>
                  {supplier.status}
                </span>
              </div>
              <h3 className="font-semibold text-foreground text-lg mb-0.5">{supplier.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{supplier.category}</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{supplier.contact}</span>
                </div>
                {supplier.email && (
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                )}
              </div>
              <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                  <span className="font-medium">{formatRating(supplier.rating)}</span>
                  <span className="text-xs text-muted-foreground">/5.0</span>
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Pencil className="h-3 w-3" /> Click to view & edit
                </span>
              </div>
            </div>
          ))}
          {filteredSuppliers.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground text-center py-8">No suppliers match your filters.</p>
          )}
        </div>
      )}

      <Sheet open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setIsEditingSupplier(false); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Supplier details</SheetTitle>
            <SheetDescription>View and edit supplier information.</SheetDescription>
          </SheetHeader>
          {selectedSupplier && (
            <div className="mt-6 space-y-6">
              {/* Basic info: view or edit mode */}
              {!isEditingSupplier ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</p>
                    <p className="text-foreground font-medium">{selectedSupplier.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact</p>
                    <p className="text-foreground">{selectedSupplier.contact}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</p>
                    <p className="text-foreground">{selectedSupplier.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categories</p>
                    <p className="text-foreground">{supplierCategories(selectedSupplier).join(', ') || '—'}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setIsEditingSupplier(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Name</label>
                    <input className="fv-input w-full" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Contact</label>
                    <input className="fv-input w-full" value={editContact} onChange={(e) => setEditContact(e.target.value)} placeholder="+254 700 000 000" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Email</label>
                    <input type="email" className="fv-input w-full" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="supplier@example.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Categories</label>
                    <div className="rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[2.5rem] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                      <div className="flex flex-wrap gap-3">
                        {CATEGORIES.map((c) => (
                          <label key={c} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={editCategories.includes(c)}
                              onCheckedChange={() => toggleEditCategory(c)}
                            />
                            <span className="text-foreground">{c}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => { setIsEditingSupplier(false); setEditName(selectedSupplier.name); setEditContact(selectedSupplier.contact); setEditEmail(selectedSupplier.email ?? ''); setEditCategories(supplierCategories(selectedSupplier)); }}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveEdit} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save changes'}</Button>
                  </div>
                </div>
              )}

              {/* Review section: notes + functional star rating */}
              <div className="pt-4 border-t space-y-4">
                <h4 className="text-sm font-semibold text-foreground">Review</h4>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-primary"
                      onClick={() => setReviewRating(star)}
                      aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    >
                      <Star
                        className={cn('h-8 w-8 transition-colors', reviewRating >= star ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/40')}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground">{reviewRating}/5</span>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Notes (for future reference)</label>
                  <textarea
                    className="fv-input w-full min-h-[80px] resize-y"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Short notes about this supplier…"
                    rows={3}
                  />
                </div>
                <Button type="button" size="sm" onClick={handleSaveReview} disabled={reviewSaving}>
                  {reviewSaving ? 'Saving…' : 'Save review'}
                </Button>
              </div>

              {/* Linked inventory items */}
              <div className="pt-4 border-t space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Linked items ({linkedItems.length})
                </h4>
                {linkedItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No inventory items linked to this supplier.</p>
                ) : (
                  <ul className="space-y-2">
                    {linkedItems.map((item) => (
                      <li key={item.id} className="text-sm p-2 rounded-lg bg-muted/50 border border-border/50">
                        <span className="font-medium text-foreground">{item.name}</span>
                        <span className="text-muted-foreground"> · {item.quantity} {item.unit}</span>
                        {item.pickupDate && (
                          <span className="text-muted-foreground text-xs block mt-0.5">Pickup: {item.pickupDate}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
