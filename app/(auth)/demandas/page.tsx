"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "next-auth/react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/layout/page-header";
import {
  DataTable,
  FilterBar,
  FilterInput,
  FilterSelect,
  StatusBadge,
  ConfirmDialog,
  EmptyState,
} from "@/components/backoffice";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2, Download, Lock, Pencil, ChevronLeft, ChevronRight, AlertCircle, CheckSquare, Square, FileSpreadsheet, Columns3, Eye, EyeOff, RotateCcw } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { rolePermissions } from "@/lib/permissions";
import { apiPath } from "@/lib/url";
import { toast } from "sonner";

interface Demanda {
  id: string;
  numero: string;
  titulo: string;
  descricao: string;
  status?: string;
  prioridade?: string;
  // Sprint 8 — campos Redmine Excel
  numeroProcesso?: string | null;
  areaTematica?: string | null;
  trfRegiao?: number | null;
  regiaoBrasil?: string | null;
  objetoAcao?: string | null;
  principioAtivo?: string | null;
  dataEntradaDJUD?: string | null;
  organizacao?: { id: string; name: string } | null;
  responsavel?: { id: string; name: string } | null;
  criadoEm: string;
  attachmentCount?: number;
}

// Inclui os status do Redmine importados
const statusColors: Record<string, "active" | "warning" | "error" | "pending"> = {
  // Status originais
  Aberta: "active",
  Fechada: "error",
  Arquivada: "warning",
  Pendente: "pending",
  // Status Redmine
  "Em Análise": "pending",
  "Em Análise COAJUD": "pending",
  "Em Análise CONJUR": "pending",
  "Em Análise DECIIS": "pending",
  "Em Análise SCTIE": "pending",
  "Em Análise SECTICS": "pending",
  Concluída: "active",
  "Cessar Atos": "warning",
  "Entrega Pendente": "warning",
  Suspensa: "warning",
  Cancelada: "error",
  Encerrada: "error",
  "Em Recurso": "pending",
  "Aguardando Informações": "pending",
};

const prioridadeColors: Record<string, "active" | "warning" | "error"> = {
  Baixa: "active",
  Media: "warning",
  Média: "warning",
  Alta: "error",
  Crítica: "error",
  Critica: "error",
};

// Opções de Grupo Temático (valores reais do Redmine)
const AREAS_TEMATICAS = [
  "Medicamentos Oncológicos/Oftalmológicos",
  "Medicamentos Alto Impacto Financeiro",
  "Assistência Farmacêutica Básica",
  "Atenção à Saúde",
  "Insumos e Equipamentos",
  "Outros Medicamentos",
];

// Regiões do Brasil
const REGIOES_BRASIL = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

// TRF Regiões (1 a 6)
const TRF_REGIOES = [
  { value: "1", label: "1ª Região" },
  { value: "2", label: "2ª Região" },
  { value: "3", label: "3ª Região" },
  { value: "4", label: "4ª Região" },
  { value: "5", label: "5ª Região" },
  { value: "6", label: "6ª Região" },
];

export default function DemandasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number>(
    parseInt(searchParams.get("pageSize") || "50")
  );
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    demandaId?: string;
    demandaNumero?: string;
  }>({ open: false });

  // Batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Column visibility (chaves = accessorKey ou id da coluna)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(["regiaoBrasil", "dataEntradaDJUD"]));
  const [showColPicker, setShowColPicker] = useState(false);

  const toggleCol = (col: string) =>
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedIds((prev) =>
      prev.size === demandas.length ? new Set() : new Set(demandas.map((d) => d.id))
    );

  // Helper: sincroniza filtros com a URL
  const updateUrl = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    router.replace(`/demandas?${params.toString()}`, { scroll: false });
  };

  // Verificar permissões
  const userRole = (session?.user as any)?.role || "OPERATOR";
  const permissions = rolePermissions[userRole as keyof typeof rolePermissions] || [];
  const canCreate = permissions.includes("demandas:write");
  const canEdit = permissions.includes("demandas:write");
  const canDelete = permissions.includes("demandas:delete");
  const canExport = permissions.includes("export:csv");

  // Filtros básicos
  const [page, setPage] = useState(searchParams.get("page") || "1");
  const [busca, setBusca] = useState(searchParams.get("busca") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [prioridade, setPrioridade] = useState(searchParams.get("prioridade") || "");
  // Filtros Sprint 8
  const [areaTematica, setAreaTematica] = useState(searchParams.get("areaTematica") || "");
  const [trfRegiao, setTrfRegiao] = useState(searchParams.get("trfRegiao") || "");
  const [regiaoBrasil, setRegiaoBrasil] = useState(searchParams.get("regiaoBrasil") || "");

  useEffect(() => {
    const fetchDemandas = async () => {
      setLoading(true);
      setErro(null);
      try {
        const params = new URLSearchParams();
        params.append("page", page);
        params.append("pageSize", pageSize.toString());
        if (busca) params.append("busca", busca);
        if (status) params.append("status", status);
        if (prioridade) params.append("prioridade", prioridade);
        if (areaTematica) params.append("areaTematica", areaTematica);
        if (trfRegiao) params.append("trfRegiao", trfRegiao);
        if (regiaoBrasil) params.append("regiaoBrasil", regiaoBrasil);

        console.log("🔄 Buscando demandas...", params.toString());
        const res = await fetch(apiPath(`/api/demandas?${params.toString()}`));

        if (res.ok) {
          const data = await res.json();
          console.log("✅ Demandas carregadas:", data.data.length, "de", data.pagination.total);
          setDemandas(data.data);
          setTotal(data.pagination.total);
          setTotalPages(data.pagination.totalPages);
        } else {
          const errorData = await res.json();
          const errorMsg = errorData.error || `Erro ${res.status}`;
          console.error("❌ Erro ao carregar:", errorMsg);
          setErro(errorMsg);
          setDemandas([]);
        }
      } catch (error: any) {
        const msg = error.message || "Erro ao carregar demandas";
        console.error("❌ Erro de rede:", msg);
        setErro(msg);
        setDemandas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDemandas();
  }, [page, pageSize, busca, status, prioridade, areaTematica, trfRegiao, regiaoBrasil]);

  const handleDelete = async () => {
    if (!deleteDialog.demandaId) return;
    const numero = deleteDialog.demandaNumero;

    try {
      const res = await fetch(apiPath(`/api/demandas/${deleteDialog.demandaId}`), {
        method: "DELETE",
      });

      if (res.ok) {
        setDemandas(demandas.filter((d) => d.id !== deleteDialog.demandaId));
        setDeleteDialog({ open: false });
        toast.success(`Demanda "${numero}" excluída com sucesso.`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao excluir demanda.");
      }
    } catch {
      toast.error("Não foi possível conectar ao servidor.");
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    // pageSize = 10000 para garantir exportação completa sem ultrapassar o limite do schema
    params.append("pageSize", "10000");
    if (busca) params.append("busca", busca);
    if (status) params.append("status", status);
    if (prioridade) params.append("prioridade", prioridade);
    if (areaTematica) params.append("areaTematica", areaTematica);
    if (trfRegiao) params.append("trfRegiao", trfRegiao);
    if (regiaoBrasil) params.append("regiaoBrasil", regiaoBrasil);

    const res = await fetch(apiPath(`/api/demandas?${params.toString()}`));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Erro ao exportar demandas.");
      return;
    }
    const data = await res.json();

    const csv = [
      [
        "Número DJUD",
        "Número Processo",
        "Título",
        "Status",
        "Prioridade",
        "Grupo Temático",
        "TRF Região",
        "Região Brasil",
        "Objeto da Ação",
        "Princípio Ativo",
        "Data Entrada DJUD",
        "Responsável",
        "Criado em",
      ].join(","),
      ...data.data.map((d: Demanda) =>
        [
          d.numero,
          d.numeroProcesso || "",
          d.titulo,
          d.status || "",
          d.prioridade || "",
          d.areaTematica || "",
          d.trfRegiao ? `${d.trfRegiao}ª Região` : "",
          d.regiaoBrasil || "",
          d.objetoAcao || "",
          d.principioAtivo || "",
          d.dataEntradaDJUD ? new Date(d.dataEntradaDJUD).toLocaleDateString("pt-BR") : "",
          d.responsavel?.name || "",
          new Date(d.criadoEm).toLocaleDateString("pt-BR"),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `demandas_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setBusca("");
    setStatus("");
    setPrioridade("");
    setAreaTematica("");
    setTrfRegiao("");
    setRegiaoBrasil("");
    setPage("1");
    setSelectedIds(new Set());
    router.replace("/demandas", { scroll: false });
  };

  // Exportação XLSX (usa dados já carregados; para exportação completa faz novo fetch)
  const handleExportXlsx = async () => {
    toast.loading("Gerando XLSX...", { id: "xlsx-export" });
    try {
      const params = new URLSearchParams();
      params.append("pageSize", "10000");
      if (busca) params.append("busca", busca);
      if (status) params.append("status", status);
      if (prioridade) params.append("prioridade", prioridade);
      if (areaTematica) params.append("areaTematica", areaTematica);
      if (trfRegiao) params.append("trfRegiao", trfRegiao);
      if (regiaoBrasil) params.append("regiaoBrasil", regiaoBrasil);

      const res = await fetch(apiPath(`/api/demandas?${params.toString()}`));
      if (!res.ok) { toast.error("Erro ao buscar dados.", { id: "xlsx-export" }); return; }
      const { data } = await res.json();

      const rows = data.map((d: Demanda) => ({
        "Número DJUD": d.numero,
        "Número Processo": d.numeroProcesso || "",
        "Título": d.titulo,
        "Status": d.status || "",
        "Prioridade": d.prioridade || "",
        "Grupo Temático": d.areaTematica || "",
        "TRF Região": d.trfRegiao ? `${d.trfRegiao}ª Região` : "",
        "Região Brasil": d.regiaoBrasil || "",
        "Objeto da Ação": d.objetoAcao || "",
        "Princípio Ativo": d.principioAtivo || "",
        "Data Entrada DJUD": d.dataEntradaDJUD ? new Date(d.dataEntradaDJUD).toLocaleDateString("pt-BR") : "",
        "Responsável": d.responsavel?.name || "",
        "Criado em": new Date(d.criadoEm).toLocaleDateString("pt-BR"),
      }));

      // Importar xlsx dinamicamente para não aumentar o bundle inicial
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Demandas");
      XLSX.writeFile(wb, `demandas_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`XLSX gerado com ${rows.length} demandas.`, { id: "xlsx-export" });
    } catch {
      toast.error("Erro ao gerar XLSX.", { id: "xlsx-export" });
    }
  };

  // Batch delete — move para lixeira
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Mover ${selectedIds.size} demanda(s) para a lixeira?`)) return;

    setBatchDeleting(true);
    let success = 0;
    let failed = 0;

    for (const id of selectedIds) {
      const res = await fetch(apiPath(`/api/demandas/${id}`), { method: "DELETE" });
      if (res.ok) success++;
      else failed++;
    }

    setDemandas((prev) => prev.filter((d) => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
    setBatchDeleting(false);

    if (failed === 0) toast.success(`${success} demanda(s) movida(s) para a lixeira.`);
    else toast.warning(`${success} excluída(s), ${failed} com erro.`);
  };

  const ALL_COLUMNS = [
    "numero", "numeroProcesso", "titulo", "areaTematica",
    "status", "prioridade", "trfRegiao", "regiaoBrasil",
    "dataEntradaDJUD", "responsavel",
  ];

  const COL_LABELS: Record<string, string> = {
    numero: "Nº DJUD", numeroProcesso: "Nº Processo", titulo: "Título",
    areaTematica: "Grupo Temático", status: "Status", prioridade: "Prioridade",
    trfRegiao: "TRF", regiaoBrasil: "Região Brasil", dataEntradaDJUD: "Entrada DJUD",
    responsavel: "Responsável",
  };

  const allSelected = demandas.length > 0 && selectedIds.size === demandas.length;

  const columns: ColumnDef<Demanda>[] = [
    // Coluna de seleção para batch ops
    {
      id: "select",
      header: () => (
        <button
          onClick={toggleSelectAll}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={allSelected ? "Desselecionar todos" : "Selecionar todos"}
        >
          {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>
      ),
      cell: ({ row }) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleSelect(row.original.id); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {selectedIds.has(row.original.id)
            ? <CheckSquare className="h-4 w-4 text-primary" />
            : <Square className="h-4 w-4" />}
        </button>
      ),
    },
    {
      accessorKey: "numero",
      header: "Nº DJUD",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium whitespace-nowrap">
          {row.original.numero}
        </span>
      ),
    },
    {
      accessorKey: "numeroProcesso",
      header: "Nº Processo",
      cell: ({ row }) =>
        row.original.numeroProcesso ? (
          <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
            {row.original.numeroProcesso}
          </span>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        ),
    },
    {
      accessorKey: "titulo",
      header: "Título / Objeto",
      cell: ({ row }) => (
        <div className="max-w-[220px]">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="font-medium text-sm truncate cursor-default">
                  {row.original.titulo}
                </p>
              </TooltipTrigger>
              {row.original.titulo.length > 30 && (
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {row.original.titulo}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {row.original.objetoAcao && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground truncate cursor-default">
                    {row.original.objetoAcao}
                  </p>
                </TooltipTrigger>
                {row.original.objetoAcao.length > 35 && (
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {row.original.objetoAcao}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ),
    },
    {
      accessorKey: "areaTematica",
      header: "Grupo Temático",
      cell: ({ row }) =>
        row.original.areaTematica ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full whitespace-nowrap max-w-[160px] truncate block border border-border cursor-default">
                  {row.original.areaTematica}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {row.original.areaTematica}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={statusColors[row.original.status || ""] || "pending"}>
          {row.original.status || "Sem status"}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "prioridade",
      header: "Prior.",
      cell: ({ row }) => (
        <StatusBadge status={prioridadeColors[row.original.prioridade || ""] || "warning"}>
          {row.original.prioridade || "Média"}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "trfRegiao",
      header: "TRF",
      cell: ({ row }) =>
        row.original.trfRegiao ? (
          <span className="text-xs font-medium whitespace-nowrap">
            {row.original.trfRegiao}ª Região
          </span>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        ),
    },
    {
      accessorKey: "regiaoBrasil",
      header: "Região",
      cell: ({ row }) =>
        row.original.regiaoBrasil ? (
          <span className="text-xs whitespace-nowrap">{row.original.regiaoBrasil}</span>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        ),
    },
    {
      accessorKey: "dataEntradaDJUD",
      header: "Entrada DJUD",
      cell: ({ row }) =>
        row.original.dataEntradaDJUD ? (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(row.original.dataEntradaDJUD).toLocaleDateString("pt-BR")}
          </span>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        ),
    },
    {
      accessorKey: "responsavel",
      header: "Responsável",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.responsavel?.name || "—"}</span>
      ),
    },
    {
      id: "actions",
      header: "Ações",
      cell: ({ row }) => (
        <div className="flex gap-1">
          {canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/demandas/${row.original.id}/edit`)}
              className="h-8 px-2 gap-1.5"
              title="Editar demanda"
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">Editar</span>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled className="h-8 px-2 opacity-40" title="Sem permissão para editar">
              <Lock className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteDialog({ open: true, demandaId: row.original.id, demandaNumero: row.original.numero })}
              className="h-8 px-2 gap-1.5 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
              title="Excluir demanda"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">Excluir</span>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled className="h-8 px-2 opacity-40" title="Sem permissão para excluir">
              <Lock className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const isFiltered = !!(busca || status || prioridade || areaTematica || trfRegiao || regiaoBrasil);

  // Filtrar colunas ocultas (preserva select + actions sempre)
  const visibleColumns = columns.filter(
    (col) => !col.id || col.id === "select" || col.id === "actions" || !hiddenCols.has((col as any).accessorKey || col.id)
  ).filter(
    (col) => {
      const key = (col as any).accessorKey as string | undefined;
      return !key || !hiddenCols.has(key);
    }
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Demandas"
        description={`${total.toLocaleString("pt-BR")} demanda${total !== 1 ? "s" : ""} encontrada${total !== 1 ? "s" : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Lixeira */}
            <Button variant="ghost" size="sm" onClick={() => router.push("/demandas/lixeira")} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lixeira</span>
            </Button>

            {/* Visibilidade de colunas */}
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowColPicker((v) => !v)} className="gap-1.5">
                <Columns3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Colunas</span>
              </Button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg p-3 w-48 space-y-1">
                  {ALL_COLUMNS.map((col) => (
                    <button
                      key={col}
                      onClick={() => toggleCol(col)}
                      className="flex items-center gap-2 w-full text-left text-sm px-2 py-1 rounded hover:bg-muted transition-colors"
                    >
                      {hiddenCols.has(col)
                        ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        : <Eye className="h-3.5 w-3.5 text-primary" />}
                      {COL_LABELS[col] || col}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {canExport && (
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">CSV</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportXlsx} className="gap-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">XLSX</span>
                </Button>
              </div>
            )}
            {canCreate ? (
              <Button onClick={() => router.push("/demandas/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Demanda
              </Button>
            ) : (
              <Button disabled title="Sem permissão para criar demandas">
                <Plus className="h-4 w-4 mr-2" />
                Nova Demanda
              </Button>
            )}
          </div>
        }
      />

      <FilterBar
        onReset={isFiltered ? handleReset : undefined}
        isActive={isFiltered}
      >
        <FilterInput
          label="Buscar"
          placeholder="Número, título, processo, medicamento..."
          value={busca}
          onChange={(v) => { setBusca(v); setPage("1"); updateUrl({ busca: v, page: "1" }); }}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => { setStatus(v); setPage("1"); updateUrl({ status: v, page: "1" }); }}
          options={[
            { value: "Em Análise", label: "Em Análise" },
            { value: "Em Análise COAJUD", label: "Em Análise COAJUD" },
            { value: "Em Análise CONJUR", label: "Em Análise CONJUR" },
            { value: "Concluída", label: "Concluída" },
            { value: "Cancelada", label: "Cancelada" },
            { value: "Suspensa", label: "Suspensa" },
            { value: "Entrega Pendente", label: "Entrega Pendente" },
            { value: "Cessar Atos", label: "Cessar Atos" },
            { value: "Aberta", label: "Aberta" },
            { value: "Fechada", label: "Fechada" },
            { value: "Arquivada", label: "Arquivada" },
          ]}
        />
        <FilterSelect
          label="Prioridade"
          value={prioridade}
          onChange={(v) => { setPrioridade(v); setPage("1"); updateUrl({ prioridade: v, page: "1" }); }}
          options={[
            { value: "Baixa", label: "Baixa" },
            { value: "Média", label: "Média" },
            { value: "Alta", label: "Alta" },
            { value: "Crítica", label: "Crítica" },
          ]}
        />
        <FilterSelect
          label="Grupo Temático"
          value={areaTematica}
          onChange={(v) => { setAreaTematica(v); setPage("1"); updateUrl({ areaTematica: v, page: "1" }); }}
          options={AREAS_TEMATICAS.map((a) => ({ value: a, label: a }))}
        />
        <FilterSelect
          label="TRF Região"
          value={trfRegiao}
          onChange={(v) => { setTrfRegiao(v); setPage("1"); updateUrl({ trfRegiao: v, page: "1" }); }}
          options={TRF_REGIOES}
        />
        <FilterSelect
          label="Região Brasil"
          value={regiaoBrasil}
          onChange={(v) => { setRegiaoBrasil(v); setPage("1"); updateUrl({ regiaoBrasil: v, page: "1" }); }}
          options={REGIOES_BRASIL.map((r) => ({ value: r, label: r }))}
        />
      </FilterBar>

      {/* Exibir erro se houver */}
      {erro && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          {erro}
        </div>
      )}

      {/* Skeleton de carregamento */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      )}

      {/* Batch toolbar — aparece quando há itens selecionados */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-primary">{selectedIds.size} demanda(s) selecionada(s)</span>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Limpar
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const ids = [...selectedIds];
              const params = new URLSearchParams();
              params.append("pageSize", "10000");
              ids.forEach((id) => {
                const d = demandas.find((x) => x.id === id);
                if (d) params.append("ids", d.id);
              });
              handleExport();
            }} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Exportar seleção
            </Button>
            {canDelete && (
              <Button
                variant="destructive"
                size="sm"
                disabled={batchDeleting}
                onClick={handleBatchDelete}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {batchDeleting ? "Excluindo..." : `Excluir ${selectedIds.size}`}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* DataTable — 100 itens por página */}
      {!loading && !erro && (
        <DataTable<Demanda>
          columns={visibleColumns}
          data={demandas}
          loading={false}
          pageSize={pageSize}
          onRowClick={(row) => router.push(`/demandas/${row.id}`)}
          renderEmptyState={() => (
            <EmptyState
              title="Nenhuma demanda encontrada"
              description={
                isFiltered
                  ? "Nenhuma demanda corresponde aos filtros aplicados. Tente redefinir os filtros."
                  : "Comece criando uma nova demanda ou importe dados do Excel."
              }
              action={
                isFiltered ? (
                  <Button variant="outline" onClick={handleReset}>
                    Limpar filtros
                  </Button>
                ) : (
                  <Button onClick={() => router.push("/demandas/new")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Demanda
                  </Button>
                )
              }
            />
          )}
        />
      )}

      {/* Paginação + pagesize selector */}
      <div className="flex items-center justify-between px-1 flex-wrap gap-3">
        {/* Pagesize selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Itens por página:</span>
          <div className="flex gap-1">
            {[20, 50, 100].map((size) => (
              <Button
                key={size}
                variant={pageSize === size ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  setPageSize(size);
                  setPage("1");
                  updateUrl({ pageSize: String(size), page: "1" });
                }}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              Página{" "}
              <span className="font-semibold text-foreground">{page}</span>{" "}
              de{" "}
              <span className="font-semibold text-foreground">
                {totalPages.toLocaleString("pt-BR")}
              </span>
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 transition-all hover:border-primary/40 hover:text-primary disabled:opacity-30"
                disabled={page === "1"}
                onClick={() => { const p = String(Math.max(1, parseInt(page) - 1)); setPage(p); updateUrl({ page: p }); }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 transition-all hover:border-primary/40 hover:text-primary disabled:opacity-30"
                disabled={parseInt(page) >= totalPages}
                onClick={() => { const p = String(Math.min(totalPages, parseInt(page) + 1)); setPage(p); updateUrl({ page: p }); }}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        title="Excluir demanda"
        description={`A demanda "${deleteDialog.demandaNumero}" será movida para a lixeira. Você pode restaurá-la em até 30 dias.`}
        actionLabel="Excluir"
        isDestructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
