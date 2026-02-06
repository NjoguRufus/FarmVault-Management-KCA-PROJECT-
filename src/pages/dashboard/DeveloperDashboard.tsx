import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, DollarSign, TrendingUp } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { CompaniesTable } from '@/components/dashboard/CompaniesTable';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { mockActivityData } from '@/data/mockData';
import { useCollection } from '@/hooks/useCollection';
import { Company } from '@/types';

export function DeveloperDashboard() {
  const navigate = useNavigate();
  const { data: companies = [], isLoading } = useCollection<Company>('companies', 'companies');
  const totalUsers = companies.reduce((sum, c) => sum + (c.userCount ?? 0), 0);
  const totalRevenue = companies.reduce((sum, c) => sum + (c.revenue ?? 0), 0);
  const activeCompanies = companies.filter(c => c.status === 'active').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Developer Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            System-wide overview and company management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/companies')}
            className="fv-btn fv-btn--primary"
          >
            <Building2 className="h-4 w-4" />
            Add Company
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Registered Companies"
          value={companies.length}
          change={8.5}
          changeLabel="vs last month"
          icon={<Building2 className="h-5 w-5" />}
          variant="primary"
        />
        <StatCard
          title="Active Users"
          value={totalUsers.toLocaleString()}
          change={12.2}
          changeLabel="vs last month"
          icon={<Users className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          title="System Revenue"
          value={`KES ${(totalRevenue / 1000).toFixed(0)}k`}
          change={18.7}
          changeLabel="vs last month"
          icon={<DollarSign className="h-5 w-5" />}
          variant="gold"
        />
        <StatCard
          title="Active Companies"
          value={activeCompanies}
          changeLabel={`of ${companies.length} total`}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="primary"
        />
      </div>

      {/* Companies Table */}
      <CompaniesTable companies={companies} loading={isLoading} />

      {/* Activity Chart */}
      <ActivityChart data={mockActivityData} />
    </div>
  );
}
