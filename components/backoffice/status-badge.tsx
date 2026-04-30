import { cn } from "@/lib/utils";

type StatusVariant = "active" | "inactive" | "pending" | "error" | "warning";

interface StatusBadgeProps {
  status: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

const statusStyles: Record<StatusVariant, string> = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400",
  inactive: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  error: "bg-red-500/10 text-red-700 dark:text-red-400",
  warning: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
};

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        statusStyles[status],
        className
      )}
    >
      {children}
    </span>
  );
}
