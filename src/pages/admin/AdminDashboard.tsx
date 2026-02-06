import React from 'react';
import { ShieldCheck, Globe2, Building2, Users } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { Company, Employee, User } from '@/types';

export default function AdminDashboard() {
  const { data: companies = [] } = useCollection<Company>('admin-companies', 'companies');
  const { data: users = [] } = useCollection<User>('admin-users', 'users');
  const { data: employees = [] } = useCollection<Employee>('admin-employees', 'employees');

  const totalCompanies = companies.length;
  const activeCompanies = companies.filter(c => c.status === 'active').length;
  const disabledCompanies = companies.filter(c => c.status === 'inactive').length;

  const nonDeveloperUsers = users.filter(u => u.role !== 'developer');
  const pendingUsers = nonDeveloperUsers.filter(u => !u.companyId);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-primary" />
            Platform Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global visibility into all FarmVault tenants, users and employees.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1 text-xs text-primary bg-primary/5">
            <ShieldCheck className="h-3 w-3" />
            Developer Admin
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="fv-card">
          <p className="text-xs text-muted-foreground mb-1">Total Companies</p>
          <p className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {totalCompanies}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {activeCompanies} active • {disabledCompanies} disabled
          </p>
        </div>
        <div className="fv-card">
          <p className="text-xs text-muted-foreground mb-1">Total Users</p>
          <p className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {nonDeveloperUsers.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {pendingUsers.length} pending / unassigned
          </p>
        </div>
        <div className="fv-card">
          <p className="text-xs text-muted-foreground mb-1">Employees (all tenants)</p>
          <p className="text-2xl font-semibold">{employees.length}</p>
        </div>
        <div className="fv-card">
          <p className="text-xs text-muted-foreground mb-1">System Health</p>
          <p className="text-sm text-fv-success">All core services operational</p>
        </div>
      </div>
    </div>
  );
}
