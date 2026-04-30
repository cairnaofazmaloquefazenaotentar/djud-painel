"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";
import { StatusBadge } from "./status-badge";
import { formatDateTime } from "@/lib/utils";

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  changes?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date | string;
}

interface AuditLogTableProps {
  data: AuditLog[];
  loading?: boolean;
  onRowClick?: (log: AuditLog) => void;
}

const columns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: "createdAt",
    header: "Data/Hora",
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    accessorKey: "userId",
    header: "Usuário",
  },
  {
    accessorKey: "action",
    header: "Ação",
    cell: ({ row }) => {
      const action = row.original.action;
      const actionMap: Record<string, { status: "active" | "inactive" | "pending" | "error" | "warning" }> = {
        CREATE: { status: "active" },
        READ: { status: "pending" },
        UPDATE: { status: "warning" },
        DELETE: { status: "error" },
      };

      const config = actionMap[action] || { status: "pending" };
      return <StatusBadge status={config.status}>{action}</StatusBadge>;
    },
  },
  {
    accessorKey: "entity",
    header: "Entidade",
  },
  {
    accessorKey: "entityId",
    header: "ID",
    cell: ({ row }) => (
      <span className="text-xs font-mono text-muted-foreground">
        {row.original.entityId.substring(0, 12)}...
      </span>
    ),
  },
  {
    accessorKey: "ipAddress",
    header: "IP",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.ipAddress || "-"}
      </span>
    ),
  },
];

export function AuditLogTable({
  data,
  loading,
  onRowClick,
}: AuditLogTableProps) {
  return (
    <DataTable<AuditLog>
      columns={columns}
      data={data}
      loading={loading}
      onRowClick={onRowClick}
      pageSize={20}
      renderEmptyState={() => (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Nenhum registro de auditoria encontrado
          </p>
        </div>
      )}
    />
  );
}
