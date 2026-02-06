import React from 'react';
import { DollarSign, TrendingUp, Package, Wallet, Calendar as CalendarIcon } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { ProjectsTable } from '@/components/dashboard/ProjectsTable';
import { InventoryOverview, SalesOverview, CropStageProgress } from '@/components/dashboard/DashboardWidgets';
import { InventoryItem, CropStage } from '@/types';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Company, Expense, Harvest, Project, Sale } from '@/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toDate } from '@/lib/dateUtils';

export function CompanyDashboard() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const [projectFilter, setProjectFilter] = React.useState<'all' | 'selected'>('selected');

  const companyId = user?.companyId || '';
  const { data: allProjects = [] } = useCollection<Project>('dashboard-projects', 'projects');
  const { data: allExpenses = [] } = useCollection<Expense>('dashboard-expenses', 'expenses');
  const { data: allHarvests = [] } = useCollection<Harvest>('dashboard-harvests', 'harvests');
  const { data: allSales = [] } = useCollection<Sale>('dashboard-sales', 'sales');
  const { data: allInventory = [] } = useCollection<InventoryItem>('dashboard-inventory', 'inventoryItems');
  const { data: allStages = [] } = useCollection<CropStage>('dashboard-stages', 'projectStages');

  const companyProjects = companyId
    ? allProjects.filter(p => p.companyId === companyId)
    : allProjects;

  // Filter by project if selected, otherwise show all company data
  const filteredExpenses = React.useMemo(() => {
    let filtered = companyId
      ? allExpenses.filter(e => e.companyId === companyId)
      : allExpenses;
    
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter(e => e.projectId === activeProject.id);
    }
    return filtered;
  }, [allExpenses, companyId, activeProject, projectFilter]);

  const filteredHarvests = React.useMemo(() => {
    let filtered = companyId
      ? allHarvests.filter(h => h.companyId === companyId)
      : allHarvests;
    
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter(h => h.projectId === activeProject.id);
    }
    return filtered;
  }, [allHarvests, companyId, activeProject, projectFilter]);

  const filteredSales = React.useMemo(() => {
    let filtered = companyId
      ? allSales.filter(s => s.companyId === companyId)
      : allSales;
    
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter(s => s.projectId === activeProject.id);
    }
    return filtered;
  }, [allSales, companyId, activeProject, projectFilter]);

  const filteredProjects = React.useMemo(() => {
    if (projectFilter === 'selected' && activeProject) {
      return [activeProject];
    }
    return companyProjects;
  }, [companyProjects, activeProject, projectFilter]);

  // Filter inventory and stages by company/project
  const filteredInventory = React.useMemo(() => {
    let filtered = companyId
      ? allInventory.filter(i => i.companyId === companyId)
      : allInventory;
    
    if (projectFilter === 'selected' && activeProject) {
      // For inventory, we might want to show all company inventory, but for now keep it company-wide
      // You can add project-specific filtering if needed
    }
    return filtered;
  }, [allInventory, companyId, activeProject, projectFilter]);

  const filteredStages = React.useMemo(() => {
    let filtered = companyId
      ? allStages.filter(s => s.companyId === companyId)
      : allStages;
    
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter(s => s.projectId === activeProject.id);
    }
    return filtered;
  }, [allStages, companyId, activeProject, projectFilter]);

  // Always show crop stages for the currently selected project in the widget
  const activeProjectStages = React.useMemo(() => {
    if (!activeProject) return [];
    return allStages.filter(
      (s) => s.companyId === companyId && s.projectId === activeProject.id,
    );
  }, [allStages, companyId, activeProject]);

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalHarvest = filteredHarvests.reduce((sum, h) => sum + h.quantity, 0);
  const totalSales = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const netBalance = totalSales - totalExpenses;
  
  // Calculate total budget from filtered projects
  const totalBudget = filteredProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const remainingBudget = totalBudget - totalExpenses;

  const expensesByCategory = Object.values(
    filteredExpenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {}),
  ).length
    ? Object.entries(
        filteredExpenses.reduce<Record<string, number>>((acc, e) => {
          acc[e.category] = (acc[e.category] || 0) + e.amount;
          return acc;
        }, {}),
      ).map(([category, amount]) => ({ category, amount }))
    : [];

  // Build activity data for bar chart: last 6 months, expenses + sales per month
  const activityChartData = React.useMemo(() => {
    const months: { month: string; expenses: number; sales: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = d.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      const expenses = filteredExpenses
        .filter((e) => {
          const t = toDate(e.date)?.getTime();
          return t != null && t >= monthStart && t <= monthEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);
      const sales = filteredSales
        .filter((s) => {
          const t = toDate(s.date)?.getTime();
          return t != null && t >= monthStart && t <= monthEnd;
        })
        .reduce((sum, s) => sum + s.totalAmount, 0);
      months.push({ month: monthKey, expenses, sales });
    }
    return months;
  }, [filteredExpenses, filteredSales]);

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
          <Select 
            value={projectFilter} 
            onValueChange={(value) => setProjectFilter(value as 'all' | 'selected')}
          >
            <SelectTrigger className="w-40 text-sm">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selected">
                {activeProject ? activeProject.name : 'Selected Project'}
              </SelectItem>
              <SelectItem value="all">All Projects</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Grid - Compact and Mobile Responsive */}
      <div className="space-y-3">
        {/* Row 1: Total Revenue and Total Expenses (same row on desktop) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatCard
            title="Total Revenue"
            value={`KES ${totalSales.toLocaleString()}`}
            change={15.3}
            changeLabel="vs last month"
            icon={<TrendingUp className="h-4 w-4" />}
            variant="gold"
            compact
          />
          <StatCard
            title="Total Expenses"
            value={`KES ${totalExpenses.toLocaleString()}`}
            change={12.5}
            changeLabel="vs last month"
            icon={<DollarSign className="h-4 w-4" />}
            variant="default"
            compact
          />
        </div>
        {/* Row 2: Profit and Loss + Remaining Budget (side by side on mobile) */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            title="Profit and Loss"
            value={`KES ${netBalance.toLocaleString()}`}
            change={netBalance >= 0 ? 22.1 : -5.2}
            changeLabel="vs last month"
            icon={<Wallet className="h-4 w-4" />}
            variant={netBalance >= 0 ? 'primary' : 'default'}
            compact
          />
          <StatCard
            title="Remaining Budget"
            value={`KES ${remainingBudget.toLocaleString()}`}
            change={undefined}
            changeLabel={`of KES ${totalBudget.toLocaleString()}`}
            icon={<CalendarIcon className="h-4 w-4" />}
            variant={remainingBudget >= 0 ? 'primary' : 'default'}
            compact
          />
        </div>
      </div>

      {/* Charts Row - Recent Activity and Expenses Category (same row on desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ActivityChart data={activityChartData} />
        <ExpensesPieChart data={expensesByCategory} />
      </div>

      {/* Bottom Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CropStageProgress stages={activeProject ? activeProjectStages : filteredStages} />
        <InventoryOverview inventoryItems={filteredInventory} />
        <SalesOverview />
      </div>

      {/* Projects Table */}
      <ProjectsTable projects={filteredProjects} compact />
    </div>
  );
}
