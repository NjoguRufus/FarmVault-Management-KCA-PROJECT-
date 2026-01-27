import React, { useState } from 'react';
import { Plus, Search, Star, Phone, Mail, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { Supplier } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';

export default function SuppliersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const formatRating = (rating: number) => {
    return rating.toFixed(1);
  };

  const getStatusBadge = (status: string) => {
    return status === 'active' ? 'fv-badge--active' : 'bg-muted text-muted-foreground';
  };

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('Seeds');
  const [saving, setSaving] = useState(false);
  const { data: suppliers = [], isLoading } = useCollection<Supplier>('suppliers', 'suppliers');

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.companyId) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'suppliers'), {
        name,
        contact,
        email: email || null,
        category,
        rating: 0,
        status: 'active',
        companyId: user.companyId,
        createdAt: serverTimestamp(),
      });
      
      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      
      setAddOpen(false);
      setName('');
      setContact('');
      setEmail('');
      setCategory('Seeds');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your supplier relationships
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <button className="fv-btn fv-btn--primary">
              <Plus className="h-4 w-4" />
              Add Supplier
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Supplier</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddSupplier} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Name</label>
                <input
                  className="fv-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Contact</label>
                <input
                  className="fv-input"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="+254 700 000 000"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Email</label>
                <input
                  type="email"
                  className="fv-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="supplier@example.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Category</label>
                <select
                  className="fv-select w-full"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Seeds">Seeds</option>
                  <option value="Fertilizers">Fertilizers</option>
                  <option value="Pesticides">Pesticides</option>
                  <option value="Equipment">Equipment</option>
                </select>
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
                  {saving ? 'Saving…' : 'Save Supplier'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search suppliers..."
            className="fv-input pl-10"
          />
        </div>
        <select className="fv-select">
          <option value="">All Categories</option>
          <option value="Seeds">Seeds</option>
          <option value="Fertilizers">Fertilizers</option>
          <option value="Pesticides">Pesticides</option>
          <option value="Equipment">Equipment</option>
        </select>
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading && (
          <p className="text-sm text-muted-foreground col-span-full">Loading suppliers…</p>
        )}
        {suppliers.map((supplier) => (
          <div key={supplier.id} className="fv-card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary font-semibold text-lg">
                  {supplier.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{supplier.name}</h3>
                  <p className="text-xs text-muted-foreground">{supplier.category}</p>
                </div>
              </div>
              <span className={cn('fv-badge capitalize', getStatusBadge(supplier.status))}>
                {supplier.status}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{supplier.contact}</span>
              </div>
              {supplier.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{supplier.email}</span>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 text-fv-gold fill-fv-gold" />
                <span className="font-medium">{formatRating(supplier.rating)}</span>
                <span className="text-xs text-muted-foreground">/5.0</span>
              </div>
              <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
