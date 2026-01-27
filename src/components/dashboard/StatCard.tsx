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
  compact?: boolean;
  responsive?: boolean;
}

export function StatCard({ 
  title, 
  value, 
  change, 
  changeLabel,
  icon,
  variant = 'default',
  compact = false,
  responsive = true
}: StatCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  const iconBgClasses = {
    primary: 'bg-primary/15 text-primary',
    gold: 'bg-fv-gold-soft/60 text-fv-olive',
    default: 'bg-muted/60 text-muted-foreground',
  };

  const cardBase =
    "relative overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm transition-all";

  const padding = responsive ? "p-3 sm:p-4" : "p-3";

  const accent =
    "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent";

  if (compact) {
    return (
      <div className={cn(cardBase, padding, accent)}>
        <div className="flex items-center justify-between mb-1">
          <span className={cn(
            'text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground'
          )}>{title}</span>
          {icon && (
            <div className={cn(
              'flex items-center justify-center rounded-lg shrink-0',
              responsive ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-7 w-7',
              iconBgClasses[variant]
            )}>
              <div className={responsive ? "scale-75 sm:scale-90" : "scale-75"}>{icon}</div>
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-1.5 flex-wrap mt-1">
          <span className={cn(
            'font-heading font-bold tracking-tight',
            responsive ? 'text-lg sm:text-xl' : 'text-lg'
          )}>{value}</span>
          {change !== undefined && (
            <span className={cn(
              'fv-stat-change inline-flex items-center gap-0.5 text-[10px] sm:text-xs',
              isPositive && 'fv-stat-change--positive',
              isNegative && 'fv-stat-change--negative'
            )}>
              {isPositive && <TrendingUp className="h-2.5 w-2.5" />}
              {isNegative && <TrendingDown className="h-2.5 w-2.5" />}
              {isPositive ? '+' : ''}{change}%
            </span>
          )}
        </div>
        {changeLabel && (
          <span className="text-[10px] sm:text-xs text-muted-foreground mt-1">{changeLabel}</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn(cardBase, padding, accent)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {icon && (
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
            iconBgClasses[variant]
          )}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-heading font-bold tracking-tight text-xl">{value}</span>
        {change !== undefined && (
          <span className={cn(
            'fv-stat-change inline-flex items-center gap-0.5 text-xs',
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
        <span className="text-xs text-muted-foreground mt-1">{changeLabel}</span>
      )}
    </div>
  );
}
