import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface ExpensesPieChartProps {
  data: Array<{
    category: string;
    amount: number;
  }>;
}

const COLORS = [
  'hsl(150 35% 25%)',   // Dark green
  'hsl(45 70% 50%)',    // Gold
  'hsl(80 30% 45%)',    // Olive
  'hsl(150 25% 40%)',   // Medium green
  'hsl(38 70% 55%)',    // Amber
  'hsl(150 20% 55%)',   // Light green
];

export function ExpensesPieChart({ data }: ExpensesPieChartProps) {
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="fv-card h-full">
      <h3 className="text-lg font-semibold text-foreground mb-4">Expenses by Category</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="amount"
              nameKey="category"
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={COLORS[index % COLORS.length]}
                  stroke="none"
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(0 0% 100%)',
                border: '1px solid hsl(40 15% 85%)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-card)',
              }}
              formatter={(value: number) => [`KES ${value.toLocaleString()}`, '']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        {data.map((item, index) => (
          <div key={item.category} className="flex items-center gap-2">
            <div 
              className="h-3 w-3 rounded-sm shrink-0" 
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-xs text-muted-foreground truncate">{item.category}</span>
            <span className="text-xs font-medium ml-auto">
              {Math.round((item.amount / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
