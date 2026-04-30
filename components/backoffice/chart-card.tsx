import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  description,
  children,
  actions,
  className,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg p-6 space-y-4",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>

      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
