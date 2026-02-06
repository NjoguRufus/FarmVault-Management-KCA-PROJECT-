import React, { useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useCollection } from '@/hooks/useCollection';
import { useQuery } from '@tanstack/react-query';
import { Company } from '@/types';
import { cn } from '@/lib/utils';
import {
  getPlatformExpenses,
  groupExpensesByMonth,
  groupExpensesByCategory,
} from '@/services/platformExpenseService';

const PLAN_MRR: Record<string, number> = {
  starter: 2500,
  professional: 7500,
  enterprise: 15000,
};

function formatKESFull(v: number): string {
  return `KES ${Number(v).toLocaleString()}`;
}

export default function AdminFinancesPage() {
  const { data: companies = [], isLoading: companiesLoading } = useCollection<Company>('admin-finances-companies', 'companies');
  const { data: platformExpenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['platform-expenses'],
    queryFn: getPlatformExpenses,
  });

  const isLoading = companiesLoading || expensesLoading;

  const {
    totalRevenue,
    totalExpenses,
    profit,
    revenueByPlanPie,
    expenseByCategory,
    monthlyData,
  } = useMemo(() => {
    const planCounts: Record<string, number> = { starter: 0, professional: 0, enterprise: 0 };
    companies.forEach((c) => {
      const plan = (c.plan ?? c.subscriptionPlan ?? 'professional') as string;
      if (PLAN_MRR[plan] != null) planCounts[plan] = (planCounts[plan] ?? 0) + 1;
    });
    const totalRevenue =
      (planCounts.starter ?? 0) * PLAN_MRR.starter +
      (planCounts.professional ?? 0) * PLAN_MRR.professional +
      (planCounts.enterprise ?? 0) * PLAN_MRR.enterprise;

    const expensesByMonth = groupExpensesByMonth(platformExpenses);
    const totalExpenses = platformExpenses.reduce((s, e) => s + e.amount, 0);
    const profit = totalRevenue - totalExpenses;

    const revenueByPlan = [
      { name: 'Starter', value: (planCounts.starter ?? 0) * PLAN_MRR.starter },
      { name: 'Professional', value: (planCounts.professional ?? 0) * PLAN_MRR.professional },
      { name: 'Enterprise', value: (planCounts.enterprise ?? 0) * PLAN_MRR.enterprise },
    ].filter((r) => r.value > 0);
    const revenueByPlanPie = revenueByPlan.map((r) => ({ category: r.name, amount: r.value }));

    const expenseByCategory = groupExpensesByCategory(platformExpenses);

    const now = new Date();
    const monthlyData: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const rev = totalRevenue;
      const exp = expensesByMonth.get(monthKey) ?? 0;
      monthlyData.push({
        month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        revenue: rev,
        expenses: exp,
        profit: rev - exp,
      });
    }

    return {
      totalRevenue,
      totalExpenses,
      profit,
      revenueByPlanPie,
      expenseByCategory,
      monthlyData,
    };
  }, [companies, platformExpenses]);

  const COLORS = ['hsl(150 35% 25%)', 'hsl(45 70% 50%)', 'hsl(80 30% 45%)', 'hsl(150 25% 40%)', 'hsl(38 70% 55%)'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Finances
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            FarmVault SaaS revenue, expenses, and profit (real data)
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="fv-card flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                <DollarSign className="h-7 w-7 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Revenue (MRR)</p>
                <p className="text-2xl font-bold text-foreground">{formatKESFull(totalRevenue)}</p>
                <p className="text-xs text-muted-foreground">Monthly recurring</p>
              </div>
            </div>
            <div className="fv-card flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10">
                <TrendingDown className="h-7 w-7 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Expenses</p>
                <p className="text-2xl font-bold text-foreground">{formatKESFull(totalExpenses)}</p>
                <p className="text-xs text-muted-foreground">From platform expenses</p>
              </div>
            </div>
            <div className="fv-card flex items-center gap-4">
              <div className={cn(
                'flex h-14 w-14 items-center justify-center rounded-xl',
                profit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
              )}>
                <TrendingUp className={cn('h-7 w-7', profit >= 0 ? 'text-green-600' : 'text-red-600')} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Profit</p>
                <p className={cn('text-2xl font-bold', profit >= 0 ? 'text-foreground' : 'text-destructive')}>
                  {formatKESFull(profit)}
                </p>
                <p className="text-xs text-muted-foreground">Revenue − expenses</p>
              </div>
            </div>
            <div className="fv-card flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-fv-gold-soft">
                <BarChart3 className="h-7 w-7 text-fv-olive" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Active subscriptions</p>
                <p className="text-2xl font-bold text-foreground">{companies.length}</p>
                <p className="text-xs text-muted-foreground">Companies</p>
              </div>
            </div>
          </div>

          {/* Line chart: Revenue & profit over time */}
          <div className="fv-card">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Revenue & profit (last 12 months)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(150 10% 45%)' }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(150 10% 45%)' }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(0 0% 100%)',
                      border: '1px solid hsl(40 15% 85%)',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-card)',
                    }}
                    formatter={(value: number) => [formatKESFull(value), '']}
                    labelFormatter={(label) => label}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(150 35% 35%)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(45 70% 45%)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar chart: Revenue vs expenses by month */}
          <div className="fv-card">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Revenue vs expenses by month
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(150 10% 45%)' }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(150 10% 45%)' }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(0 0% 100%)',
                      border: '1px solid hsl(40 15% 85%)',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-card)',
                    }}
                    formatter={(value: number) => [formatKESFull(value), '']}
                    labelFormatter={(label) => label}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(150 35% 35%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="expenses" name="Expenses" fill="hsl(38 70% 55%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pies: Revenue by plan + Expenses by category */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="fv-card">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <PieChartIcon className="h-5 w-5 text-primary" />
                Revenue by plan
              </h3>
              {revenueByPlanPie.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No subscription revenue yet
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenueByPlanPie}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                      >
                        {revenueByPlanPie.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(0 0% 100%)',
                          border: '1px solid hsl(40 15% 85%)',
                          borderRadius: '8px',
                          boxShadow: 'var(--shadow-card)',
                        }}
                        formatter={(value: number) => [formatKESFull(value), '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="fv-card">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <PieChartIcon className="h-5 w-5 text-primary" />
                Expenses by category
              </h3>
              {expenseByCategory.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No expenses yet. Add them in FarmVault Expenses.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseByCategory}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                      >
                        {expenseByCategory.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(0 0% 100%)',
                          border: '1px solid hsl(40 15% 85%)',
                          borderRadius: '8px',
                          boxShadow: 'var(--shadow-card)',
                        }}
                        formatter={(value: number) => [formatKESFull(value), '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
