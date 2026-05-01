"use client";

import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  description?: string; // alias for subtext
  trend?: number; // percentage change
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  label,
  value,
  subtext,
  description,
  trend,
  icon,
  className,
}: MetricCardProps) {
  const subtitle = subtext ?? description;
  const isTrendPositive = trend && trend > 0;
  const trendIcon = isTrendPositive ? (
    <ArrowUp className="h-4 w-4" />
  ) : (
    <ArrowDown className="h-4 w-4" />
  );

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-6",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-primary/10 p-3 text-primary">
            {icon}
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className="mt-4 flex items-center gap-1">
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-medium",
              isTrendPositive ? "text-green-600" : "text-red-600"
            )}
          >
            {trendIcon}
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
          <span className="text-xs text-muted-foreground">período anterior</span>
        </div>
      )}
    </div>
  );
}
