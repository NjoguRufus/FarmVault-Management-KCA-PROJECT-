import React from 'react';
import { UserCog } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { Employee, Company } from '@/types';

export default function AdminManagersPage() {
  const { data: employees = [], isLoading } = useCollection<Employee>('admin-employees', 'employees');
  const { data: companies = [] } = useCollection<Company>('admin-companies-for-managers', 'companies');

  const managers = employees.filter((e) => e.role === 'manager');

  const getCompanyName = (companyId: string) =>
    companies.find((c) => c.id === companyId)?.name || companyId;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Managers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-tenant overview of all farm managers.
          </p>
        </div>
      </div>

      <div className="fv-card">
        {isLoading && (
          <p className="text-sm text-muted-foreground mb-4">Loading managers…</p>
        )}
        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Company</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.department}</td>
                  <td>{getCompanyName(m.companyId)}</td>
                  <td className="capitalize">{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

