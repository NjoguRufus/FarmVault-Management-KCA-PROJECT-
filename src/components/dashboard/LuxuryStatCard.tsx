import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface LuxuryStatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  iconVariant?: "success" | "warning" | "info" | "destructive" | "primary" | "muted" | "gold";
  subtitle?: string;
  className?: string;
  variant?: "default" | "gold";
  responsive?: boolean;
}

export function LuxuryStatCard({
  title,
  value,
  icon: Icon,
  iconVariant = "primary",
  subtitle,
  className,
  variant = "default",
  responsive = true,
}: LuxuryStatCardProps) {
  const iconBgClasses = {
    success: "bg-fv-success/15 text-fv-success",
    warning: "bg-fv-warning/15 text-fv-warning",
    info: "bg-fv-info/15 text-fv-info",
    destructive: "bg-destructive/15 text-destructive",
    primary: "bg-primary/15 text-primary",
    gold: "bg-fv-gold-soft/60 text-fv-olive",
    muted: "bg-muted/60 text-muted-foreground",
  };

  const cardBase =
    "relative overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm transition-all";

  const padding = responsive ? "p-4 sm:p-5" : "p-4";

  // Enhanced accent for luxury feel
  const accent =
    variant === "gold"
      ? "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-gradient-to-r after:from-fv-gold-soft after:via-fv-olive/60 after:to-transparent"
      : "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent";

  return (
    <div className={cn(cardBase, padding, accent, className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {title}
          </p>
          <p
            className={cn(
              "font-heading font-bold tracking-tight",
              responsive ? "text-2xl sm:text-3xl" : "text-2xl",
              variant === "gold" ? "text-fv-olive" : "text-foreground"
            )}
          >
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-[10px] sm:text-xs text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-lg",
              responsive ? "h-10 w-10 sm:h-12 sm:w-12" : "h-10 w-10",
              iconBgClasses[iconVariant]
            )}
          >
            <Icon className={responsive ? "h-5 w-5 sm:h-6 sm:w-6" : "h-5 w-5"} />
          </div>
        )}
      </div>
    </div>
  );
}
