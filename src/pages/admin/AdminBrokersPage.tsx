import React from 'react';
import { Briefcase } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { Employee, Company } from '@/types';

export default function AdminBrokersPage() {
  const { data: employees = [], isLoading } = useCollection<Employee>('admin-employees-brokers', 'employees');
  const { data: companies = [] } = useCollection<Company>('admin-companies-for-brokers', 'companies');

  const brokers = employees.filter((e) => e.role === 'broker');

  const getCompanyName = (companyId: string) =>
    companies.find((c) => c.id === companyId)?.name || companyId;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Brokers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All crop brokers across the FarmVault platform.
          </p>
        </div>
      </div>

      <div className="fv-card">
        {isLoading && (
          <p className="text-sm text-muted-foreground mb-4">Loading brokers…</p>
        )}
        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {brokers.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{getCompanyName(b.companyId)}</td>
                  <td className="capitalize">{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

