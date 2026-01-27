import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'gold';
}

export function StatCard({ 
  title, 
  value, 
  change, 
  changeLabel,
  icon,
  variant = 'default' 
}: StatCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <div className="fv-stat-card">
      <div className="flex items-center justify-between">
        <span className="fv-stat-label">{title}</span>
        {icon && (
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            variant === 'primary' && 'bg-primary/10 text-primary',
            variant === 'gold' && 'bg-fv-gold-soft text-fv-olive',
            variant === 'default' && 'bg-muted text-muted-foreground'
          )}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="fv-stat-value">{value}</span>
        {change !== undefined && (
          <span className={cn(
            'fv-stat-change inline-flex items-center gap-0.5',
            isPositive && 'fv-stat-change--positive',
            isNegative && 'fv-stat-change--negative'
          )}>
            {isPositive && <TrendingUp className="h-3 w-3" />}
            {isNegative && <TrendingDown className="h-3 w-3" />}
            {isPositive ? '+' : ''}{change}%
          </span>
        )}
      </div>
      {changeLabel && (
        <span className="text-xs text-muted-foreground">{changeLabel}</span>
      )}
    </div>
  );
}
