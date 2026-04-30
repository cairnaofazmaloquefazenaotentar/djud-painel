import { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
  className?: string;
}

export function MetricCard({
  title,
  value,
  icon,
  trend,
  loading,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg p-6 space-y-4",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <div className="mt-2 h-8 w-24 bg-muted rounded animate-pulse" />
          ) : (
            <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
          )}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>

      {trend && !loading && (
        <div className="flex items-center gap-2 text-sm">
          <span
            className={trend.isPositive ? "text-green-600" : "text-red-600"}
          >
            {trend.isPositive ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
          </span>
          <span
            className={cn(
              "font-medium",
              trend.isPositive ? "text-green-700" : "text-red-700"
            )}
          >
            {trend.isPositive ? "+" : "-"}
            {Math.abs(trend.value)}%
          </span>
          <span className="text-muted-foreground">vs mês anterior</span>
        </div>
      )}
    </div>
  );
}
