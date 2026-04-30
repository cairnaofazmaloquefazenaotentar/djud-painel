"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Plus, Trash2, Edit2 } from "lucide-react";

interface Demanda {
  id: string;
  numero: string;
  titulo: string;
  descricao: string;
  status?: string;
  prioridade?: string;
  organizacao?: { id: string; name: string } | null;
  responsavel?: { id: string; name: string } | null;
  criadoEm: string;
}

const statusColors: Record<string, "active" | "warning" | "error" | "pending"> = {
  "Aberta": "active",
  "Fechada": "error",
  "Arquivada": "warning",
  "Pendente": "pending",
};

const prioridadeColors: Record<string, "active" | "warning" | "error"> = {
  "Baixa": "active",
  "Média": "warning",
  "Alta": "error",
  "Crítica": "error",
};

export default function DemandasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    demandaId?: string;
    demandaNumero?: string;
  }>({ open: false });

  // Filtros
  const [page, setPage] = useState(searchParams.get("page") || "1");
  const [busca, setBusca] = useState(searchParams.get("busca") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [prioridade, setPrioridade] = useState(searchParams.get("prioridade") || "");

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
  }, [page, busca, status, prioridade]);

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

  const columns: ColumnDef<Demanda>[] = [
    {
      accessorKey: "numero",
      header: "Número",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.numero}</span>
      ),
    },
    {
      accessorKey: "titulo",
      header: "Título",
      cell: ({ row }) => (
        <div>
          <p className="font-medium max-w-xs truncate">{row.original.titulo}</p>
          <p className="text-xs text-muted-foreground max-w-xs truncate">
            {row.original.descricao}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={statusColors[row.original.status || "Pendente"] || "pending"}>
          {row.original.status || "Sem status"}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "prioridade",
      header: "Prioridade",
      cell: ({ row }) => (
        <StatusBadge status={prioridadeColors[row.original.prioridade || "Média"] || "warning"}>
          {row.original.prioridade || "Média"}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "responsavel",
      header: "Responsável",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.responsavel?.name || "-"}</span>
      ),
    },
    {
      accessorKey: "criadoEm",
      header: "Criado em",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.criadoEm).toLocaleDateString("pt-BR")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Ações",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(`/demandas/${row.original.id}/edit`)
            }
            className="h-8 px-2"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
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
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const isFiltered = !!(busca || status || prioridade);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Demandas"
        description={`${total} demanda${total !== 1 ? "s" : ""} encontrada${total !== 1 ? "s" : ""}`}
        actions={
          <Button onClick={() => router.push("/demandas/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Demanda
          </Button>
        }
      />

      <FilterBar
        onReset={isFiltered ? () => { setBusca(""); setStatus(""); setPrioridade(""); } : undefined}
        isActive={!!isFiltered}
      >
        <FilterInput
          label="Buscar"
          placeholder="Número, título, descrição..."
          value={busca}
          onChange={setBusca}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "Aberta", label: "Aberta" },
            { value: "Fechada", label: "Fechada" },
            { value: "Arquivada", label: "Arquivada" },
            { value: "Pendente", label: "Pendente" },
          ]}
        />
        <FilterSelect
          label="Prioridade"
          value={prioridade}
          onChange={setPrioridade}
          options={[
            { value: "Baixa", label: "Baixa" },
            { value: "Média", label: "Média" },
            { value: "Alta", label: "Alta" },
            { value: "Crítica", label: "Crítica" },
          ]}
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
            description="Comece criando uma nova demanda no sistema"
            action={
              <Button onClick={() => router.push("/demandas/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Demanda
              </Button>
            }
          />
        )}
      />

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
