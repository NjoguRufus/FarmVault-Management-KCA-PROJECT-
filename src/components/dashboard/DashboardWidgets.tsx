import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { mockActivityData } from '@/data/mockData';

interface InventoryItem {
  name: string;
  quantity: number;
  trend: 'up' | 'down' | 'stable';
  change: number;
}

export function InventoryOverview() {
  const inventoryItems: InventoryItem[] = [
    { name: 'Fertilizers', quantity: 2850, trend: 'up', change: 12 },
    { name: 'Seeds', quantity: 1450, trend: 'down', change: -5 },
    { name: 'Pesticides', quantity: 680, trend: 'stable', change: 2 },
    { name: 'Equipment', quantity: 45, trend: 'up', change: 8 },
  ];

  return (
    <div className="fv-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Inventory Overview</h3>
      <div className="space-y-4">
        {inventoryItems.map((item) => (
          <div key={item.name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-sm font-medium">{item.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{item.quantity.toLocaleString()}</span>
              <span className={`text-xs font-medium ${
                item.trend === 'up' ? 'text-fv-success' :
                item.trend === 'down' ? 'text-destructive' :
                'text-muted-foreground'
              }`}>
                {item.change > 0 ? '+' : ''}{item.change}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SalesOverview() {
  const salesData = [
    { buyer: 'Metro Foods', amount: 350000, status: 'completed' },
    { buyer: 'FreshMart', amount: 256000, status: 'completed' },
    { buyer: 'Local Market Co', amount: 225000, status: 'pending' },
  ];

  const formatCurrency = (amount: number) => `KES ${(amount / 1000).toFixed(0)}k`;

  return (
    <div className="fv-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Recent Sales</h3>
      <div className="space-y-3">
        {salesData.map((sale, index) => (
          <div key={index} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <div>
              <span className="text-sm font-medium text-foreground">{sale.buyer}</span>
              <span className={`ml-2 fv-badge text-xs ${
                sale.status === 'completed' ? 'fv-badge--active' : 'fv-badge--warning'
              }`}>
                {sale.status}
              </span>
            </div>
            <span className="text-sm font-semibold">{formatCurrency(sale.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CropStageProgress() {
  const stages = [
    { name: 'Land Prep', progress: 100 },
    { name: 'Nursery', progress: 100 },
    { name: 'Transplant', progress: 65 },
    { name: 'Growth', progress: 0 },
    { name: 'Harvest', progress: 0 },
  ];

  return (
    <div className="fv-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Crop Stage Progress</h3>
      <div className="space-y-4">
        {stages.map((stage) => (
          <div key={stage.name}>
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
        ))}
      </div>
    </div>
  );
}
