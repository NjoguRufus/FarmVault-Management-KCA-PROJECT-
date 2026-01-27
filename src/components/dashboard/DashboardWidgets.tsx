import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { mockActivityData } from '@/data/mockData';
import { InventoryItem } from '@/types';

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

interface CropStageProgressProps {
  stages?: Array<{ id?: string; name: string; startDate?: Date; endDate?: Date; stageIndex?: number; projectId?: string }>;
}

export function CropStageProgress({ stages: propStages = [] }: CropStageProgressProps) {
  const stages = propStages || [];
  
  // Calculate progress for each stage
  const stagesWithProgress = stages
    .map((stage, index) => {
      const today = new Date();
      const start = stage.startDate ? new Date(stage.startDate) : undefined;
      const end = stage.endDate ? new Date(stage.endDate) : undefined;
      
      let progress = 0;
      if (start && end) {
        if (today < start) {
          progress = 0; // Not started
        } else if (today > end) {
          progress = 100; // Completed
        } else {
          // In progress - calculate percentage
          const total = end.getTime() - start.getTime();
          const elapsed = today.getTime() - start.getTime();
          progress = Math.round((elapsed / total) * 100);
        }
      }
      
      // Create unique key using id, or projectId + stageIndex, or fallback to index
      const uniqueKey = stage.id || `${stage.projectId || 'unknown'}-${stage.stageIndex ?? index}-${stage.name}`;
      
      return {
        key: uniqueKey,
        name: stage.name || `Stage ${stage.stageIndex || 0}`,
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
