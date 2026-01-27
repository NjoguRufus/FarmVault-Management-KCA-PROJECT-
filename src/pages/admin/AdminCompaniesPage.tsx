import React from 'react';
import { Building2, PlusCircle } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { Company } from '@/types';
import { CompaniesTable } from '@/components/dashboard/CompaniesTable';

export default function AdminCompaniesPage() {
  const { data: companies = [], isLoading } = useCollection<Company>('admin-companies-list', 'companies');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Companies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All tenants registered in the FarmVault platform.
          </p>
        </div>
        <button className="fv-btn fv-btn--primary">
          <PlusCircle className="h-4 w-4" />
          New Company
        </button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading companies…</p>
      )}

      <CompaniesTable companies={companies} />
    </div>
  );
}

