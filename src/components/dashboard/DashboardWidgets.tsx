import React, { useState, useMemo } from 'react';
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
import { BarChart3, PieChart as PieChartIcon, TrendingUp, LayoutList } from 'lucide-react';
import { InventoryItem } from '@/types';

const STAGE_COLORS = [
  'hsl(150 35% 25%)',
  'hsl(45 70% 50%)',
  'hsl(80 30% 45%)',
  'hsl(150 25% 40%)',
  'hsl(38 70% 55%)',
  'hsl(150 20% 55%)',
];

interface InventoryOverviewProps {
  inventoryItems?: InventoryItem[];
}

export function InventoryOverview({ inventoryItems: propInventoryItems = [] }: InventoryOverviewProps) {
  // If no inventory items provided, use empty array (will show nothing)
  const inventoryItems = propInventoryItems || [];
  
  // Group by category and calculate totals
  const categoryData = inventoryItems.reduce<Record<string, { quantity: number; value: number }>>((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) {
      acc[cat] = { quantity: 0, value: 0 };
    }
    acc[cat].quantity += item.quantity || 0;
    acc[cat].value += (item.quantity || 0) * (item.pricePerUnit || 0);
    return acc;
  }, {});

  const displayItems = Object.entries(categoryData)
    .map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      quantity: data.quantity,
      value: data.value,
    }))
    .slice(0, 4); // Show top 4 categories

  return (
    <div className="fv-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Inventory Overview</h3>
      <div className="space-y-4">
        {displayItems.length > 0 ? (
          displayItems.map((item) => (
            <div key={item.name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm font-medium">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{item.quantity.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">
                  KES {(item.value / 1000).toFixed(0)}k
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No inventory data available</p>
        )}
      </div>
    </div>
  );
}

export interface RecentTransactionItem {
  id: string;
  type: 'sale' | 'expense';
  date: Date;
  label: string;
  amount: number;
  status?: string;
}

interface RecentTransactionsProps {
  transactions?: RecentTransactionItem[];
}

export function RecentTransactions({ transactions: propTransactions = [] }: RecentTransactionsProps) {
  const transactions = propTransactions || [];
  const sorted = useMemo(
    () => [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10),
    [transactions],
  );
  const formatCurrency = (amount: number) => `KES ${(amount / 1000).toFixed(0)}k`;
  const formatDate = (d: Date) => d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="fv-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Recent Transactions</h3>
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No recent transactions</p>
        ) : (
          sorted.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div>
                <span className="text-sm font-medium text-foreground">{tx.label}</span>
                <span className="block text-xs text-muted-foreground">{formatDate(tx.date)}</span>
                {tx.status && (
                  <span className={`ml-0 mt-0.5 inline-block fv-badge text-xs ${
                    tx.status === 'completed' ? 'fv-badge--active' : 'fv-badge--warning'
                  }`}>
                    {tx.status}
                  </span>
                )}
              </div>
              <span className={`text-sm font-semibold ${tx.type === 'sale' ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>
                {tx.type === 'sale' ? '+' : '-'}{formatCurrency(tx.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface CropStageProgressProps {
  stages?: Array<{
    id?: string;
    name?: string;
    stageName?: string;
    startDate?: Date | unknown;
    endDate?: Date | unknown;
    stageIndex?: number;
    projectId?: string;
    status?: 'pending' | 'in-progress' | 'completed';
  }>;
}

export function CropStageProgress({ stages: propStages = [] }: CropStageProgressProps) {
  const stages = propStages || [];

  const toDate = (raw: Date | unknown) => {
    if (!raw) return undefined;
    const d = raw as { toDate?: () => Date };
    if (typeof d.toDate === 'function') return d.toDate();
    return new Date(raw as Date);
  };

  // Calculate progress from real data: respect stored status (completed) then dates
  const stagesWithProgress = stages
    .map((stage, index) => {
      const today = new Date();
      const start = stage.startDate ? toDate(stage.startDate) : undefined;
      const end = stage.endDate ? toDate(stage.endDate) : undefined;
      const displayName = stage.stageName || stage.name || `Stage ${stage.stageIndex ?? index}`;

      let progress = 0;
      if (stage.status === 'completed') {
        progress = 100;
      } else if (start && end) {
        if (today < start) {
          progress = 0;
        } else if (today > end) {
          progress = 100;
        } else {
          const total = end.getTime() - start.getTime();
          const elapsed = today.getTime() - start.getTime();
          progress = Math.round((elapsed / total) * 100);
        }
      }

      const uniqueKey = stage.id || `${stage.projectId || 'unknown'}-${stage.stageIndex ?? index}-${displayName}`;

      return {
        key: uniqueKey,
        name: displayName,
        progress,
        stageIndex: stage.stageIndex ?? index,
      };
    })
    .sort((a, b) => {
      // Sort by stage index
      return (a.stageIndex || 0) - (b.stageIndex || 0);
    });

  return (
    <div className="fv-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Crop Stage Progress</h3>
      <div className="space-y-4">
        {stagesWithProgress.length > 0 ? (
          stagesWithProgress.map((stage) => (
          <div key={stage.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{stage.name}</span>
              <span className="text-xs text-muted-foreground">{stage.progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${stage.progress}%` }}
              />
            </div>
          </div>
        ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No stage data available</p>
        )}
      </div>
    </div>
  );
}

export type CropStageViewMode = 'bars' | 'pie' | 'trend' | 'bar';

interface CropStageSectionProps {
  stages?: Array<{
    id?: string;
    name?: string;
    stageName?: string;
    startDate?: Date | unknown;
    endDate?: Date | unknown;
    stageIndex?: number;
    projectId?: string;
    status?: 'pending' | 'in-progress' | 'completed';
  }>;
}

function toDate(raw: Date | unknown): Date | undefined {
  if (!raw) return undefined;
  const d = raw as { toDate?: () => Date };
  if (typeof d.toDate === 'function') return d.toDate();
  return new Date(raw as Date);
}

function computeStagesWithProgress(stages: CropStageSectionProps['stages']) {
  const list = stages || [];
  const today = new Date();
  return list
    .map((stage, index) => {
      const start = stage?.startDate ? toDate(stage.startDate) : undefined;
      const end = stage?.endDate ? toDate(stage.endDate) : undefined;
      const displayName = stage?.stageName || stage?.name || `Stage ${stage?.stageIndex ?? index}`;
      let progress = 0;
      if (stage?.status === 'completed') progress = 100;
      else if (start && end) {
        if (today < start) progress = 0;
        else if (today > end) progress = 100;
        else {
          const total = end.getTime() - start.getTime();
          const elapsed = today.getTime() - start.getTime();
          progress = Math.round((elapsed / total) * 100);
        }
      }
      return {
        key: stage?.id || `${stage?.projectId || 'u'}-${stage?.stageIndex ?? index}-${displayName}`,
        name: displayName,
        progress,
        stageIndex: stage?.stageIndex ?? index,
      };
    })
    .sort((a, b) => a.stageIndex - b.stageIndex);
}

export function CropStageSection({ stages: propStages = [] }: CropStageSectionProps) {
  const [viewMode, setViewMode] = useState<CropStageViewMode>('bars');
  const stagesWithProgress = useMemo(() => computeStagesWithProgress(propStages), [propStages]);

  const toggleButtons: { mode: CropStageViewMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'bars', label: 'Bars', icon: <LayoutList className="h-4 w-4" /> },
    { mode: 'pie', label: 'Pie', icon: <PieChartIcon className="h-4 w-4" /> },
    { mode: 'trend', label: 'Trend', icon: <TrendingUp className="h-4 w-4" /> },
    { mode: 'bar', label: 'Chart', icon: <BarChart3 className="h-4 w-4" /> },
  ];

  const pieData = useMemo(
    () => stagesWithProgress.map((s) => ({ name: s.name, value: s.progress })),
    [stagesWithProgress],
  );
  const chartData = useMemo(
    () => stagesWithProgress.map((s) => ({ name: s.name, progress: s.progress })),
    [stagesWithProgress],
  );

  return (
    <div className="fv-card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-foreground">Crop Stage</h3>
        <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
          {toggleButtons.map(({ mode, label, icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={label}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {stagesWithProgress.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No stage data available</p>
      ) : (
        <>
          {viewMode === 'bars' && (
            <div className="space-y-4">
              {stagesWithProgress.map((stage) => (
                <div key={stage.key}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{stage.name}</span>
                    <span className="text-xs text-muted-foreground">{stage.progress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${stage.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'pie' && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={STAGE_COLORS[index % STAGE_COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value}%`, 'Progress']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {viewMode === 'trend' && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: number) => [value, 'Progress %']}
                  />
                  <Line type="monotone" dataKey="progress" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {viewMode === 'bar' && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: number) => [value, 'Progress %']}
                  />
                  <Bar dataKey="progress" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
