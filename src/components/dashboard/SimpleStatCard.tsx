import React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface SimpleStatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  iconVariant?: "success" | "warning" | "info" | "destructive" | "primary" | "muted" | "gold";
  subtitle?: string;
  className?: string;
  layout?: "horizontal" | "vertical";
  valueVariant?: "default" | "success" | "warning" | "destructive";
  responsive?: boolean; // NEW – aligns with LuxuryStatCard
}

export function SimpleStatCard({
  title,
  value,
  icon: Icon,
  iconVariant = "muted",
  subtitle,
  className,
  layout = "horizontal",
  valueVariant = "default",
  responsive = true,
}: SimpleStatCardProps) {
  const iconBgClasses = {
    success: "bg-fv-success/15 text-fv-success",
    warning: "bg-fv-warning/15 text-fv-warning",
    info: "bg-fv-info/15 text-fv-info",
    destructive: "bg-destructive/15 text-destructive",
    primary: "bg-primary/15 text-primary",
    gold: "bg-fv-gold-soft/60 text-fv-olive",
    muted: "bg-muted/60 text-muted-foreground",
  };

  const valueColorClasses = {
    default: "text-foreground",
    success: "text-fv-success",
    warning: "text-fv-warning",
    destructive: "text-destructive",
  };

  const cardBase =
    "relative overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm transition-all";

  const padding = responsive ? "p-3 sm:p-4" : "p-3";

  // Decorative bottom accent (subtle, not loud)
  const accent =
    "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent";

  if (layout === "vertical") {
    return (
      <div className={cn(cardBase, padding, accent, className)}>
        {Icon && (
          <div
            className={cn(
              "mb-3 inline-flex items-center justify-center rounded-lg",
              responsive ? "h-8 w-8 sm:h-9 sm:w-9" : "h-8 w-8",
              iconBgClasses[iconVariant]
            )}
          >
            <Icon className={responsive ? "h-4 w-4 sm:h-5 sm:w-5" : "h-4 w-4"} />
          </div>
        )}

        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>

        <p
          className={cn(
            "mt-1 font-heading font-bold tracking-tight",
            responsive ? "text-lg sm:text-xl" : "text-lg",
            valueColorClasses[valueVariant]
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
    );
  }

  // Horizontal layout (default)
  return (
    <div className={cn(cardBase, padding, accent, "flex items-center gap-3", className)}>
      {Icon && (
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg",
            responsive ? "h-9 w-9 sm:h-10 sm:w-10" : "h-9 w-9",
            iconBgClasses[iconVariant]
          )}
        >
          <Icon className={responsive ? "h-4 w-4 sm:h-5 sm:w-5" : "h-4 w-4"} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>

        <p
          className={cn(
            "font-heading font-bold tracking-tight",
            responsive ? "text-lg sm:text-xl" : "text-lg",
            valueColorClasses[valueVariant]
          )}
        >
          {value}
        </p>

        {subtitle && (
          <p className="mt-0.5 text-[10px] sm:text-xs text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
