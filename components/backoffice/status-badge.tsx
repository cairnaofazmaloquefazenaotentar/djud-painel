import { cn } from "@/lib/utils";

type StatusVariant = "active" | "inactive" | "pending" | "error" | "warning";

interface StatusBadgeProps {
  status: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

// ── Estilos de pill ─────────────────────────────────────────────────────────────

const statusStyles: Record<StatusVariant, string> = {
  active:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  inactive:
    "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20",
  pending:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  error:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  warning:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
};

// ── Spell: dot colorido — "active" pulsa, demais são estáticos ─────────────────

const dotStyles: Record<StatusVariant, string> = {
  active:  "bg-emerald-500",
  inactive: "bg-slate-400",
  pending: "bg-amber-500",
  error:   "bg-red-500",
  warning: "bg-orange-500",
};

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
        statusStyles[status],
        className
      )}
    >
      {/* Indicador de status com pulse em "active" */}
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {status === "active" && (
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-60",
              dotStyles[status]
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full h-1.5 w-1.5",
            dotStyles[status]
          )}
        />
      </span>
      {children}
    </span>
  );
}
