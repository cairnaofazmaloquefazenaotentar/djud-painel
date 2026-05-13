"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/layout/page-header";
import {
  DataTable,
  FilterBar,
  FilterInput,
  FilterSelect,
  FilterDateRange,
  StatusBadge,
  EmptyState,
} from "@/components/backoffice";
import { formatDateTime } from "@/lib/utils";
import { ENTITY_LABELS, parseChanges } from "@/lib/log-labels";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  changes: any;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null };
}

type ActionStatus = "active" | "inactive" | "pending" | "error" | "warning";

const actionConfig: Record<string, { status: ActionStatus; label: string }> = {
  CREATE: { status: "active", label: "Criação" },
  READ:   { status: "pending", label: "Leitura" },
  UPDATE: { status: "warning", label: "Atualização" },
  DELETE: { status: "error",   label: "Exclusão" },
  LOGIN:  { status: "active",  label: "Login" },
  LOGOUT: { status: "inactive",label: "Logout" },
  EXPORT: { status: "pending", label: "Exportação" },
  IMPORT: { status: "pending", label: "Importação" },
};

export default function LogsPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [page, setPage] = useState(searchParams.get("page") || "1");
  const [busca, setBusca] = useState(searchParams.get("busca") || "");
  const [action, setAction] = useState(searchParams.get("action") || "");
  const [entity, setEntity] = useState(searchParams.get("entity") || "");
  const [dataInicio, setDataInicio] = useState(searchParams.get("dataInicio") || "");
  const [dataFim, setDataFim] = useState(searchParams.get("dataFim") || "");

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("page", page);
        params.append("pageSize", "20");
        if (busca) params.append("busca", busca);
        if (action) params.append("action", action);
        if (entity) params.append("entity", entity);
        if (dataInicio) params.append("dataInicio", dataInicio);
        if (dataFim) params.append("dataFim", dataFim);

        const res = await fetch(`/api/logs?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.data);
          setTotal(data.pagination.total);
          setTotalPages(data.pagination.totalPages);
        }
      } catch (error) {
        console.error("Erro ao carregar logs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [page, busca, action, entity, dataInicio, dataFim]);

  const handleExport = async () => {
    const params = new URLSearchParams();
    params.append("pageSize", "1000");
    if (busca) params.append("busca", busca);
    if (action) params.append("action", action);
    if (entity) params.append("entity", entity);
    if (dataInicio) params.append("dataInicio", dataInicio);
    if (dataFim) params.append("dataFim", dataFim);

    const res = await fetch(`/api/logs?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();

    const csv = [
      ["Data/Hora", "Usuário", "Email", "Ação", "Entidade", "ID Entidade"].join(","),
      ...data.data.map((log: AuditLog) =>
        [
          formatDateTime(log.createdAt),
          log.user.name || "",
          log.user.email || "",
          log.action,
          log.entity,
          log.entityId || "",
        ]
          .map((v) => `"${v}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: "createdAt",
      header: "Data/Hora",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      accessorKey: "user",
      header: "Usuário",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.user.name || "—"}</p>
          <p className="text-xs text-muted-foreground">{row.original.user.email}</p>
        </div>
      ),
    },
    {
      accessorKey: "action",
      header: "Ação",
      cell: ({ row }) => {
        const cfg = actionConfig[row.original.action] ?? {
          status: "pending" as ActionStatus,
          label: row.original.action,
        };
        return <StatusBadge status={cfg.status}>{cfg.label}</StatusBadge>;
      },
    },
    {
      accessorKey: "entity",
      header: "Entidade",
      cell: ({ row }) => (
        <span className="text-sm font-medium">
          {ENTITY_LABELS[row.original.entity] ?? row.original.entity}
        </span>
      ),
    },
    {
      accessorKey: "entityId",
      header: "ID",
      cell: ({ row }) =>
        row.original.entityId ? (
          <span
            className="text-xs font-mono text-muted-foreground"
            title={row.original.entityId}
          >
            #{row.original.entityId.slice(0, 8)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "details",
      header: "Detalhes",
      cell: ({ row }) =>
        row.original.changes ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs font-normal text-primary underline-offset-2"
            onClick={() =>
              setExpandedId(
                expandedId === row.original.id ? null : row.original.id
              )
            }
          >
            {expandedId === row.original.id ? "Fechar" : "Ver mudanças"}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
  ];

  const isFiltered = !!(busca || action || entity || dataInicio || dataFim);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Logs de Auditoria"
        description={`${total} registro${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}`}
        actions={
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        }
      />

      <FilterBar
        onReset={isFiltered ? () => { setBusca(""); setAction(""); setEntity(""); setDataInicio(""); setDataFim(""); } : undefined}
        isActive={isFiltered}
      >
        <FilterInput
          label="Buscar"
          placeholder="Usuário, entidade, ID..."
          value={busca}
          onChange={setBusca}
        />
        <FilterSelect
          label="Ação"
          value={action}
          onChange={setAction}
          options={[
            { value: "CREATE", label: "Criação" },
            { value: "UPDATE", label: "Atualização" },
            { value: "DELETE", label: "Exclusão" },
            { value: "READ",   label: "Leitura" },
            { value: "LOGIN",  label: "Login" },
            { value: "LOGOUT", label: "Logout" },
            { value: "EXPORT", label: "Exportação" },
            { value: "IMPORT", label: "Importação" },
          ]}
        />
        <FilterSelect
          label="Entidade"
          value={entity}
          onChange={setEntity}
          options={[
            { value: "Demanda",      label: "Demanda" },
            { value: "User",         label: "Usuário" },
            { value: "Organization", label: "Organização" },
          ]}
        />
        <FilterDateRange
          label="Período"
          startDate={dataInicio || ""}
          endDate={dataFim || ""}
          onStartDateChange={setDataInicio}
          onEndDateChange={setDataFim}
        />
      </FilterBar>

      <div className="space-y-2">
        <DataTable<AuditLog>
          columns={columns}
          data={logs}
          loading={loading}
          pageSize={20}
          renderEmptyState={() => (
            <EmptyState
              title="Nenhum log encontrado"
              description="Nenhuma ação registrada com os filtros selecionados"
            />
          )}
        />

        {/* Diff visual formatado */}
        {expandedId && (() => {
          const log = logs.find((l) => l.id === expandedId);
          if (!log?.changes) return null;
          const lines = parseChanges(log.changes as Record<string, unknown>);
          const entityLabel = ENTITY_LABELS[log.entity] ?? log.entity;
          const actionLabel = actionConfig[log.action]?.label ?? log.action;
          return (
            <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Mudanças — {entityLabel} · {actionLabel}
              </p>
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem detalhes registrados.</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {lines.map((line) => (
                    <div key={line.field} className="flex items-start gap-2 py-1.5 text-xs">
                      <span className="text-muted-foreground min-w-[140px] shrink-0 font-medium">
                        {line.label}
                      </span>
                      {line.before !== undefined || line.after !== undefined ? (
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="line-through text-muted-foreground/60">{line.before}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-foreground font-medium">{line.after}</span>
                        </span>
                      ) : (
                        <span className="text-foreground">{line.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
