"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
  FilterMultiSelect,
  StatusBadge,
  ConfirmDialog,
  EmptyState,
} from "@/components/backoffice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  Edit2,
  Download,
  Lock,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckSquare,
  Square,
  Columns3,
  Eye,
  EyeOff,
  RotateCcw,
  Copy,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { rolePermissions } from "@/lib/permissions";
import { normalizarPrincipioAtivo } from "@/lib/principio-ativo";
import {
  ATALHOS_STATUS,
  ROTULO_CAMPO,
  comSelecao,
  filtroAtivo,
  filtroParaQuery,
  lerFiltroDemandas,
  parametrosDoFiltro,
  type CampoDemanda,
  type FiltroDemandas,
} from "@/lib/demandas-filtro-tipos";
import { useDemandasLista, useOpcoesDemandas, type DemandaLista } from "@/hooks/useDemandas";
import { ExportarDialog } from "@/components/demandas/exportar-dialog";
import { VisoesMenu } from "@/components/demandas/visoes-menu";
import { apiPath } from "@/lib/url";
import { toast } from "sonner";

type Demanda = DemandaLista;

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

/** Filtros sempre à vista; os demais ficam em "Mais filtros". */
const CAMPOS_PRINCIPAIS: CampoDemanda[] = ["status", "pontoControle", "areaTematica", "trfRegiao", "ufResidencia"];
const CAMPOS_SECUNDARIOS: CampoDemanda[] = [
  "prioridade",
  "regiaoBrasil",
  "objetoAcao",
  "formaCumprimento",
  "origemDemanda",
  "responsavelId",
];

/** Pausa antes de aplicar o que foi digitado: busca 400 ms (A4), código 450 ms. */
const PAUSA_BUSCA = 400;
const PAUSA_CODIGO = 450;

function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  return (
    <button
      type="button"
      aria-label={`Copiar ${rotulo}`}
      title={`Copiar ${rotulo}`}
      className="rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard
          .writeText(texto)
          .then(() => toast.success(`${rotulo} copiado.`))
          .catch(() => toast.error("Não foi possível copiar."));
      }}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

export default function DemandasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // ── Estado da URL: a única fonte do filtro ─────────────────────────────────
  const chaveUrl = searchParams.toString();
  const filtro = useMemo(() => lerFiltroDemandas(new URLSearchParams(chaveUrl)), [chaveUrl]);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const pageSize = [20, 50, 100].includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 50;

  /** Reescreve a URL com o filtro novo (página volta para 1). */
  const navegar = useCallback(
    (novo: FiltroDemandas, extras: Record<string, string | null> = {}) => {
      const sp = new URLSearchParams(chaveUrl);
      for (const k of parametrosDoFiltro()) sp.delete(k);
      sp.delete("page");
      filtroParaQuery(novo, sp);
      for (const [k, v] of Object.entries(extras)) {
        if (v === null) sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`/demandas?${sp.toString()}`, { scroll: false });
    },
    [chaveUrl, router]
  );

  // ── Busca e código: o digitado só vira filtro depois de uma pausa ─────────
  const [buscaInput, setBuscaInput] = useState(filtro.busca ?? "");
  const [catmatInput, setCatmatInput] = useState(filtro.catmat ?? "");
  const timerBusca = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerCodigo = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerBusca.current) clearTimeout(timerBusca.current);
      if (timerCodigo.current) clearTimeout(timerCodigo.current);
    },
    []
  );
  const onBusca = (v: string) => {
    setBuscaInput(v);
    if (timerBusca.current) clearTimeout(timerBusca.current);
    timerBusca.current = setTimeout(() => navegar({ ...filtro, busca: v.trim() || null }), PAUSA_BUSCA);
  };
  const onCatmat = (v: string) => {
    setCatmatInput(v);
    if (timerCodigo.current) clearTimeout(timerCodigo.current);
    timerCodigo.current = setTimeout(() => navegar({ ...filtro, catmat: v.trim() || null }), PAUSA_CODIGO);
  };

  // ── Dados ──────────────────────────────────────────────────────────────────
  const qs = useMemo(() => {
    const sp = filtroParaQuery(filtro);
    sp.set("page", String(page));
    sp.set("pageSize", String(pageSize));
    return sp.toString();
  }, [filtro, page, pageSize]);
  const { data, isFetching, isLoading, error } = useDemandasLista(qs);
  const { data: opcoes, isLoading: carregandoOpcoes } = useOpcoesDemandas();

  const demandas = useMemo(() => data?.data ?? [], [data]);
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;
  const filtroCatmat = data?.filtroCatmat ?? null;
  const buscaAplicada = data?.busca ?? null;

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    demandaId?: string;
    demandaNumero?: string;
  }>({ open: false });

  // Batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [exportar, setExportar] = useState<null | "filtro" | "selecao">(null);
  const [maisFiltros, setMaisFiltros] = useState(() =>
    CAMPOS_SECUNDARIOS.some((c) => !!filtro.campos[c]) || !!(filtro.dataEntradaDe || filtro.dataEntradaAte)
  );

  // Column visibility (chaves = accessorKey ou id da coluna)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    new Set(["regiaoBrasil", "dataEntradaDJUD", "pontoControle", "ufResidencia"])
  );
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

  // Verificar permissões
  const userRole = (session?.user as any)?.role || "OPERATOR";
  const permissions = rolePermissions[userRole as keyof typeof rolePermissions] || [];
  const canCreate = permissions.includes("demandas:write");
  const canEdit = permissions.includes("demandas:write");
  const canDelete = permissions.includes("demandas:delete");
  const canExport = permissions.includes("export:csv");

  const atualizarLista = () => queryClient.invalidateQueries({ queryKey: ["demandas"] });

  const handleDelete = async () => {
    if (!deleteDialog.demandaId) return;
    const numero = deleteDialog.demandaNumero;

    try {
      const res = await fetch(apiPath(`/api/demandas/${deleteDialog.demandaId}`), {
        method: "DELETE",
      });

      if (res.ok) {
        setDeleteDialog({ open: false });
        toast.success(`Demanda "${numero}" excluída com sucesso.`);
        atualizarLista();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao excluir demanda.");
      }
    } catch {
      toast.error("Não foi possível conectar ao servidor.");
    }
  };

  const handleReset = () => {
    if (timerBusca.current) clearTimeout(timerBusca.current);
    if (timerCodigo.current) clearTimeout(timerCodigo.current);
    setBuscaInput("");
    setCatmatInput("");
    setSelectedIds(new Set());
    router.replace(`/demandas?pageSize=${pageSize}`, { scroll: false });
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

    setSelectedIds(new Set());
    setBatchDeleting(false);
    atualizarLista();

    if (failed === 0) toast.success(`${success} demanda(s) movida(s) para a lixeira.`);
    else toast.warning(`${success} excluída(s), ${failed} com erro.`);
  };

  const ALL_COLUMNS = [
    "numero", "numeroProcesso", "nupSei", "titulo", "areaTematica",
    "status", "pontoControle", "prioridade", "trfRegiao", "regiaoBrasil",
    "ufResidencia", "dataEntradaDJUD", "responsavel",
  ];

  const COL_LABELS: Record<string, string> = {
    numero: "Nº DJUD", numeroProcesso: "Nº Processo", nupSei: "Nº SEI", titulo: "Título / Princípio Ativo",
    areaTematica: "Grupo Temático", status: "Status", pontoControle: "Ponto de controle", prioridade: "Prioridade",
    trfRegiao: "TRF", regiaoBrasil: "Região Brasil", ufResidencia: "UF", dataEntradaDJUD: "Entrada DJUD",
    responsavel: "Responsável",
  };

  const allSelected = demandas.length > 0 && selectedIds.size === demandas.length;

  const traco = <span className="text-muted-foreground/40 text-xs">—</span>;

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
          <span className="group inline-flex items-center gap-1 font-mono text-xs text-muted-foreground whitespace-nowrap">
            {row.original.numeroProcesso}
            <Copiar texto={row.original.numeroProcesso} rotulo="Nº do processo" />
          </span>
        ) : traco,
    },
    {
      accessorKey: "nupSei",
      header: "Nº SEI",
      cell: ({ row }) =>
        row.original.nupSei ? (
          <span className="group inline-flex items-center gap-1 font-mono text-xs text-muted-foreground whitespace-nowrap">
            {row.original.nupSei}
            <Copiar texto={row.original.nupSei} rotulo="Nº SEI" />
          </span>
        ) : traco,
    },
    {
      accessorKey: "titulo",
      header: "Título / Princípio Ativo",
      cell: ({ row }) => {
        // Demandas de serviço/material não têm medicamento — daí o traço.
        const principios = row.original.medicamento ?? normalizarPrincipioAtivo(row.original.principioAtivo);
        return (
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
            {principios ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-xs text-muted-foreground truncate cursor-default">
                      {principios}
                    </p>
                  </TooltipTrigger>
                  {principios.length > 35 && (
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      {principios}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ) : (
              <p className="text-xs text-muted-foreground/40">—</p>
            )}
          </div>
        );
      },
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
        ) : traco,
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
      accessorKey: "pontoControle",
      header: "Ponto de controle",
      cell: ({ row }) =>
        row.original.pontoControle ? (
          <span className="block max-w-[180px] truncate text-xs" title={row.original.pontoControle}>
            {row.original.pontoControle}
          </span>
        ) : traco,
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
        ) : traco,
    },
    {
      accessorKey: "regiaoBrasil",
      header: "Região",
      cell: ({ row }) =>
        row.original.regiaoBrasil ? (
          <span className="text-xs whitespace-nowrap">{row.original.regiaoBrasil}</span>
        ) : traco,
    },
    {
      accessorKey: "ufResidencia",
      header: "UF",
      cell: ({ row }) =>
        row.original.ufResidencia ? <span className="text-xs">{row.original.ufResidencia}</span> : traco,
    },
    {
      accessorKey: "dataEntradaDJUD",
      header: "Entrada DJUD",
      cell: ({ row }) =>
        row.original.dataEntradaDJUD ? (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(row.original.dataEntradaDJUD).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
          </span>
        ) : traco,
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
              onClick={(e) => { e.stopPropagation(); router.push(`/demandas/${row.original.id}/edit`); }}
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
              onClick={(e) => { e.stopPropagation(); setDeleteDialog({ open: true, demandaId: row.original.id, demandaNumero: row.original.numero }); }}
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

  const isFiltered = filtroAtivo(filtro);

  // Filtrar colunas ocultas (preserva select + actions sempre)
  const visibleColumns = columns.filter((col) => {
    const key = (col as any).accessorKey as string | undefined;
    return !key || !hiddenCols.has(key);
  });

  const multi = (campo: CampoDemanda) => {
    const lista = opcoes?.[campo] ?? [];
    // Campo só com "(não informado)" (p.ex. responsável, hoje vazio na base) não vira filtro.
    if (!carregandoOpcoes && lista.length <= 1 && !filtro.campos[campo]) return null;
    return (
      <FilterMultiSelect
        key={campo}
        label={ROTULO_CAMPO[campo]}
        opcoes={lista}
        carregando={carregandoOpcoes}
        valor={filtro.campos[campo]}
        atalhos={campo === "status" ? ATALHOS_STATUS : []}
        onChange={(s) => navegar(comSelecao(filtro, campo, s))}
      />
    );
  };

  const setPagina = (p: number) => {
    const sp = new URLSearchParams(chaveUrl);
    sp.set("page", String(p));
    router.replace(`/demandas?${sp.toString()}`, { scroll: false });
  };

  const termosTexto = buscaAplicada?.interpretacao.tipo === "texto" ? buscaAplicada.interpretacao.termos : [];
  const buscaReescrita =
    termosTexto.length > 0 && termosTexto.join(" ") !== (filtro.busca ?? "").trim().toLowerCase();

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

            <VisoesMenu
              querystring={filtroParaQuery({ ...filtro, ids: [] }).toString()}
              onAplicar={(q) => router.replace(`/demandas?${q}${q ? "&" : ""}pageSize=${pageSize}`, { scroll: false })}
            />

            {/* Visibilidade de colunas */}
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowColPicker((v) => !v)} className="gap-1.5">
                <Columns3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Colunas</span>
              </Button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg p-3 w-52 space-y-1">
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
              <Button variant="outline" size="sm" onClick={() => setExportar("filtro")} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Exportar</span>
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
          placeholder="Nome, nº DJUD, nº do processo, NUP SEI ou CATMAT…"
          value={buscaInput}
          onChange={onBusca}
        />
        <FilterInput
          label="CATMAT / Registro ANVISA"
          placeholder="Ex.: 457888 ou 1006811570015"
          value={catmatInput}
          onChange={onCatmat}
        />
        {CAMPOS_PRINCIPAIS.map(multi)}
        {maisFiltros && (
          <>
            {CAMPOS_SECUNDARIOS.map(multi)}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Entrada no DJUD</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  aria-label="Entrada no DJUD a partir de"
                  className="h-8 text-sm"
                  value={filtro.dataEntradaDe ?? ""}
                  onChange={(e) => navegar({ ...filtro, dataEntradaDe: e.target.value || null })}
                />
                <span className="text-xs text-muted-foreground">a</span>
                <Input
                  type="date"
                  aria-label="Entrada no DJUD até"
                  className="h-8 text-sm"
                  value={filtro.dataEntradaAte ?? ""}
                  onChange={(e) => navegar({ ...filtro, dataEntradaAte: e.target.value || null })}
                />
              </div>
            </div>
          </>
        )}
        <div className="flex items-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMaisFiltros((v) => !v)}
            aria-expanded={maisFiltros}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {maisFiltros ? "Menos filtros" : "Mais filtros"}
          </Button>
        </div>
      </FilterBar>

      {/* Como a busca foi lida (A4) */}
      {filtro.busca && buscaAplicada && (buscaAplicada.codigo || buscaAplicada.interpretacao.tipo === "numero" || buscaReescrita) && (
        <div className="-mt-4 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {buscaAplicada.codigo ? (
            <>
              “{filtro.busca}” interpretado como{" "}
              <span className="font-medium text-foreground">
                {buscaAplicada.codigo.tipo === "REGISTRO"
                  ? `registro ANVISA ${buscaAplicada.codigo.registro}`
                  : `CATMAT ${buscaAplicada.codigo.catmat}`}
              </span>{" "}
              — {buscaAplicada.codigo.descricao} (substâncias: {buscaAplicada.codigo.grupos.map((g) => g.rotulo).join(" ou ")}). A
              busca inclui também as demandas que citam o número.
            </>
          ) : buscaAplicada.interpretacao.tipo === "numero" ? (
            <>
              Procurando o número <span className="font-mono text-foreground">{buscaAplicada.interpretacao.digitos}</span> (só os
              dígitos) no Nº DJUD, no nº do processo e no NUP SEI.
            </>
          ) : (
            <>
              Busca sem acento, pelo radical das palavras longas:{" "}
              <span className="font-mono text-foreground">{termosTexto.join(" ")}</span>
            </>
          )}
        </div>
      )}

      {/* Tradução do código: a Demanda não tem CATMAT, o filtro é por substância */}
      {filtro.catmat && filtroCatmat && (
        filtroCatmat.encontrado ? (
          <div className="-mt-4 rounded-md border bg-muted/30 px-3 py-2 text-xs flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">
              {filtroCatmat.tipo === "REGISTRO"
                ? `Registro ANVISA ${filtroCatmat.registro}`
                : `CATMAT ${filtroCatmat.catmat}`}
            </span>
            {filtroCatmat.tipo === "REGISTRO" && filtroCatmat.catmat && (
              <span className="text-muted-foreground">· CATMAT {filtroCatmat.catmat}</span>
            )}
            <span className="text-muted-foreground truncate max-w-xl" title={filtroCatmat.descricao ?? ""}>
              · {filtroCatmat.descricao}
            </span>
            <span className="basis-full text-muted-foreground">
              Demandas cujo medicamento corresponde a:{" "}
              <span className="text-foreground">{filtroCatmat.grupos.map((g) => g.rotulo).join(" ou ")}</span>
            </span>
          </div>
        ) : (
          <div className="-mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {filtroCatmat.motivo}
          </div>
        )
      )}

      {/* Erro amigável (o detalhe fica no log do servidor) */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          {error.message}
        </div>
      )}

      {/* Skeleton só na primeira carga; depois a tabela fica com os dados anteriores */}
      {isLoading && (
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
            {canExport && (
              <Button variant="outline" size="sm" onClick={() => setExportar("selecao")} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Exportar seleção
              </Button>
            )}
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

      {!isLoading && !error && (
        <div className={isFetching ? "relative opacity-60 transition-opacity" : "relative"}>
          {isFetching && (
            <Loader2 className="absolute right-2 -top-6 h-4 w-4 animate-spin text-muted-foreground" aria-label="Atualizando" />
          )}
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
        </div>
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
                  const sp = new URLSearchParams(chaveUrl);
                  sp.set("pageSize", String(size));
                  sp.delete("page");
                  router.replace(`/demandas?${sp.toString()}`, { scroll: false });
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
                disabled={page <= 1}
                onClick={() => setPagina(Math.max(1, page - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 transition-all hover:border-primary/40 hover:text-primary disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPagina(Math.min(totalPages, page + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {exportar && (
        <ExportarDialog
          aberto
          onOpenChange={(v) => !v && setExportar(null)}
          filtro={filtro}
          total={total}
          selecionados={Array.from(selectedIds)}
          escopoInicial={exportar}
        />
      )}

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
