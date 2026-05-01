"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Plus, Trash2, Edit2, Download, Lock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { rolePermissions } from "@/lib/permissions";

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
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    demandaId?: string;
    demandaNumero?: string;
  }>({ open: false });

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
      try {
        const params = new URLSearchParams();
        params.append("page", page);
        params.append("pageSize", "10");
        if (busca) params.append("busca", busca);
        if (status) params.append("status", status);
        if (prioridade) params.append("prioridade", prioridade);
        if (areaTematica) params.append("areaTematica", areaTematica);
        if (trfRegiao) params.append("trfRegiao", trfRegiao);
        if (regiaoBrasil) params.append("regiaoBrasil", regiaoBrasil);

        const res = await fetch(`/api/demandas?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setDemandas(data.data);
          setTotal(data.pagination.total);
          setTotalPages(data.pagination.totalPages);
        }
      } catch (error) {
        console.error("Erro ao carregar demandas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDemandas();
  }, [page, busca, status, prioridade, areaTematica, trfRegiao, regiaoBrasil]);

  const handleDelete = async () => {
    if (!deleteDialog.demandaId) return;

    try {
      const res = await fetch(`/api/demandas/${deleteDialog.demandaId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDemandas(demandas.filter((d) => d.id !== deleteDialog.demandaId));
        setDeleteDialog({ open: false });
      }
    } catch (error) {
      console.error("Erro ao deletar demanda:", error);
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    params.append("pageSize", "5000");
    if (busca) params.append("busca", busca);
    if (status) params.append("status", status);
    if (prioridade) params.append("prioridade", prioridade);
    if (areaTematica) params.append("areaTematica", areaTematica);
    if (trfRegiao) params.append("trfRegiao", trfRegiao);
    if (regiaoBrasil) params.append("regiaoBrasil", regiaoBrasil);

    const res = await fetch(`/api/demandas?${params.toString()}`);
    if (!res.ok) return;
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
  };

  const columns: ColumnDef<Demanda>[] = [
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
          <p className="font-medium text-sm truncate" title={row.original.titulo}>
            {row.original.titulo}
          </p>
          {row.original.objetoAcao && (
            <p
              className="text-xs text-muted-foreground truncate"
              title={row.original.objetoAcao}
            >
              {row.original.objetoAcao}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "areaTematica",
      header: "Grupo Temático",
      cell: ({ row }) =>
        row.original.areaTematica ? (
          <span
            className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap max-w-[160px] truncate block"
            title={row.original.areaTematica}
          >
            {row.original.areaTematica}
          </span>
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
              className="h-8 px-2"
              title="Editar demanda"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="h-8 px-2 opacity-50 cursor-not-allowed"
              title="Sem permissão para editar"
            >
              <Lock className="h-4 w-4" />
            </Button>
          )}
          {canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDeleteDialog({
                  open: true,
                  demandaId: row.original.id,
                  demandaNumero: row.original.numero,
                })
              }
              className="h-8 px-2 text-destructive hover:text-destructive/90"
              title="Deletar demanda"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="h-8 px-2 opacity-50 cursor-not-allowed"
              title="Sem permissão para deletar"
            >
              <Lock className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const isFiltered = !!(busca || status || prioridade || areaTematica || trfRegiao || regiaoBrasil);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Demandas"
        description={`${total.toLocaleString("pt-BR")} demanda${total !== 1 ? "s" : ""} encontrada${total !== 1 ? "s" : ""}`}
        actions={
          <div className="flex gap-2">
            {canExport && (
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
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
          onChange={(v) => { setBusca(v); setPage("1"); }}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => { setStatus(v); setPage("1"); }}
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
          onChange={(v) => { setPrioridade(v); setPage("1"); }}
          options={[
            { value: "Baixa", label: "Baixa" },
            { value: "Media", label: "Média" },
            { value: "Alta", label: "Alta" },
            { value: "Critica", label: "Crítica" },
          ]}
        />
        <FilterSelect
          label="Grupo Temático"
          value={areaTematica}
          onChange={(v) => { setAreaTematica(v); setPage("1"); }}
          options={AREAS_TEMATICAS.map((a) => ({ value: a, label: a }))}
        />
        <FilterSelect
          label="TRF Região"
          value={trfRegiao}
          onChange={(v) => { setTrfRegiao(v); setPage("1"); }}
          options={TRF_REGIOES}
        />
        <FilterSelect
          label="Região Brasil"
          value={regiaoBrasil}
          onChange={(v) => { setRegiaoBrasil(v); setPage("1"); }}
          options={REGIOES_BRASIL.map((r) => ({ value: r, label: r }))}
        />
      </FilterBar>

      <DataTable<Demanda>
        columns={columns}
        data={demandas}
        loading={loading}
        pageSize={10}
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

      {/* Paginação simples */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages.toLocaleString("pt-BR")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === "1"}
              onClick={() => setPage(String(Math.max(1, parseInt(page) - 1)))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={parseInt(page) >= totalPages}
              onClick={() => setPage(String(Math.min(totalPages, parseInt(page) + 1)))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        title="Deletar demanda"
        description={`Tem certeza que deseja deletar a demanda "${deleteDialog.demandaNumero}"? Esta ação não pode ser desfeita.`}
        actionLabel="Deletar"
        isDestructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
