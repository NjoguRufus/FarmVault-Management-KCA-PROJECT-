import React from 'react';
import { DollarSign, TrendingUp, Package, Wallet, Calendar as CalendarIcon } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { ProjectsTable } from '@/components/dashboard/ProjectsTable';
import { InventoryOverview, SalesOverview, CropStageProgress } from '@/components/dashboard/DashboardWidgets';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Company, Expense, Harvest, Project, Sale } from '@/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

export function CompanyDashboard() {
  const { activeProject } = useProject();
  const { user } = useAuth();

  const companyId = user?.companyId || '';
  const { data: allProjects = [] } = useCollection<Project>('dashboard-projects', 'projects');
  const { data: allExpenses = [] } = useCollection<Expense>('dashboard-expenses', 'expenses');
  const { data: allHarvests = [] } = useCollection<Harvest>('dashboard-harvests', 'harvests');
  const { data: allSales = [] } = useCollection<Sale>('dashboard-sales', 'sales');

  const companyProjects = companyId
    ? allProjects.filter(p => p.companyId === companyId)
    : allProjects;

  const companyExpenses = companyId
    ? allExpenses.filter(e => e.companyId === companyId)
    : allExpenses;

  const companyHarvests = companyId
    ? allHarvests.filter(h => h.companyId === companyId)
    : allHarvests;

  const companySales = companyId
    ? allSales.filter(s => s.companyId === companyId)
    : allSales;

  const totalExpenses = companyExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalHarvest = companyHarvests.reduce((sum, h) => sum + h.quantity, 0);
  const totalSales = companySales.reduce((sum, s) => sum + s.totalAmount, 0);
  const netBalance = totalSales - totalExpenses;

  const expensesByCategory = Object.values(
    companyExpenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {}),
  ).length
    ? Object.entries(
        companyExpenses.reduce<Record<string, number>>((acc, e) => {
          acc[e.category] = (acc[e.category] || 0) + e.amount;
          return acc;
        }, {}),
      ).map(([category, amount]) => ({ category, amount }))
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Company Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of all farm operations and metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select defaultValue="this-month">
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="this-quarter">Thiis Quarter</SelectItem>
              <SelectItem value="this-year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Expenses"
          value={`KES ${totalExpenses.toLocaleString()}`}
          change={12.5}
          changeLabel="vs last month"
          icon={<DollarSign className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          title="Total Harvest"
          value={`${totalHarvest.toLocaleString()} kg`}
          change={8.2}
          changeLabel="vs last month"
          icon={<Package className="h-5 w-5" />}
          variant="primary"
        />
        <StatCard
          title="Total Sales"
          value={`KES ${totalSales.toLocaleString()}`}
          change={15.3}
          changeLabel="vs last month"
          icon={<TrendingUp className="h-5 w-5" />}
          variant="gold"
        />
        <StatCard
          title="Net Balance"
          value={`KES ${netBalance.toLocaleString()}`}
          change={22.1}
          changeLabel="vs last month"
          icon={<Wallet className="h-5 w-5" />}
          variant="primary"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityChart data={[]} />
        </div>
        <div>
          <ExpensesPieChart data={expensesByCategory} />
        </div>
      </div>

      {/* Bottom Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CropStageProgress />
        <InventoryOverview />
        <SalesOverview />
      </div>

      {/* Projects Table */}
      <ProjectsTable projects={companyProjects} />
    </div>
  );
}
