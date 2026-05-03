"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { AttachmentsManager } from "@/components/attachments-manager";
import { DemandaExportModal } from "@/components/demanda-export-modal";
import { Loader2, Download } from "lucide-react";

// ── Schema ────────────────────────────────────────────────────────────────────

const demandaFormSchema = z.object({
  numero: z.string().min(1, "Número é obrigatório"),
  titulo: z.string().min(3, "Título deve ter no mínimo 3 caracteres"),
  descricao: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  organizacaoId: z.string().optional(),
  responsavelId: z.string().optional(),
  dataInicio: z.string().optional(),
  dataVencimento: z.string().optional(),
  tags: z.array(z.string()).optional(),
  projeto: z.string().optional(),
  ano: z.string().optional(),
  origemDemanda: z.string().optional(),
  // Dados judiciais
  numeroProcesso: z.string().optional(),
  areaTematica: z.string().optional(),
  regiaoBrasil: z.string().optional(),
  objetoAcao: z.string().optional(),
  principioAtivo: z.string().optional(),
  dataEntradaDJUD: z.string().optional(),
  trfRegiao: z.string().optional(),
  pontoControle: z.string().optional(),
});

type DemandaFormData = z.infer<typeof demandaFormSchema>;

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: { id: string; name: string };
  storagePath: string;
}

interface Demanda {
  id: string;
  numero: string;
  titulo: string;
  descricao: string;
  status?: string;
  prioridade?: string;
  organizacaoId?: string;
  responsavelId?: string;
  dataInicio?: string;
  dataVencimento?: string;
  tags?: string[];
  projeto?: string;
  ano?: number;
  origemDemanda?: string;
  numeroProcesso?: string | null;
  areaTematica?: string | null;
  regiaoBrasil?: string | null;
  objetoAcao?: string | null;
  principioAtivo?: string | null;
  dataEntradaDJUD?: string | null;
  trfRegiao?: number | null;
  pontoControle?: string | null;
  organizacao?: { id: string; name: string };
  responsavel?: { id: string; name: string };
  attachments?: Attachment[];
}

// ── Classe padrão para <select> nativo (igual ao shadcn Input) ────────────────
const selectCn =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

// ── Componente ────────────────────────────────────────────────────────────────

export default function EditDemandaPage() {
  const router = useRouter();
  const params = useParams();
  const demandaId = params.id as string;
  const isNew = demandaId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [demandaNumero, setDemandaNumero] = useState("");
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([]);
  const [responsaveis, setResponsaveis] = useState<Array<{ id: string; name: string }>>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const form = useForm<DemandaFormData>({
    resolver: zodResolver(demandaFormSchema),
    defaultValues: { status: "Aberta", prioridade: "Média", tags: [] },
  });

  // ── Carregar dados ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        const [orgRes, userRes] = await Promise.all([
          fetch("/api/organizations"),
          fetch("/api/users?pageSize=100"),
        ]);
        if (orgRes.ok) setOrganizations((await orgRes.json()).data || []);
        if (userRes.ok) setResponsaveis((await userRes.json()).data || []);
      } catch {
        toast.error("Erro ao carregar listas de organizações e responsáveis.");
      }
    };
    loadData();

    if (!isNew) {
      const loadDemanda = async () => {
        try {
          const [demandaRes, attachmentsRes] = await Promise.all([
            fetch(`/api/demandas/${demandaId}`),
            fetch(`/api/demandas/${demandaId}/attachments`),
          ]);
          if (demandaRes.ok) {
            const d: Demanda = await demandaRes.json();
            setDemandaNumero(d.numero);
            form.reset({
              numero: d.numero,
              titulo: d.titulo,
              descricao: d.descricao,
              status: d.status || "Aberta",
              prioridade: d.prioridade || "Média",
              organizacaoId: d.organizacao?.id || "",
              responsavelId: d.responsavel?.id || "",
              dataInicio: d.dataInicio ? new Date(d.dataInicio).toISOString().split("T")[0] : "",
              dataVencimento: d.dataVencimento ? new Date(d.dataVencimento).toISOString().split("T")[0] : "",
              tags: d.tags || [],
              projeto: d.projeto || "",
              ano: d.ano ? String(d.ano) : "",
              origemDemanda: d.origemDemanda || "",
              numeroProcesso: d.numeroProcesso || "",
              areaTematica: d.areaTematica || "",
              regiaoBrasil: d.regiaoBrasil || "",
              objetoAcao: d.objetoAcao || "",
              principioAtivo: d.principioAtivo || "",
              dataEntradaDJUD: d.dataEntradaDJUD
                ? new Date(d.dataEntradaDJUD).toISOString().split("T")[0]
                : "",
              trfRegiao: d.trfRegiao ? String(d.trfRegiao) : "",
              pontoControle: d.pontoControle || "",
            });
          }
          if (attachmentsRes.ok) setAttachments((await attachmentsRes.json()).data || []);
        } catch {
          toast.error("Erro ao carregar os dados da demanda.");
        } finally {
          setLoading(false);
        }
      };
      loadDemanda();
    }
  }, [demandaId, isNew, form]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const onSubmit = async (data: DemandaFormData) => {
    setSubmitting(true);
    try {
      const apiData = {
        ...data,
        ano: data.ano ? Number(data.ano) : undefined,
        trfRegiao: data.trfRegiao ? Number(data.trfRegiao) : undefined,
        organizacaoId: data.organizacaoId || undefined,
        responsavelId: data.responsavelId || undefined,
        origemDemanda: data.origemDemanda || undefined,
        numeroProcesso: data.numeroProcesso || undefined,
        areaTematica: data.areaTematica || undefined,
        regiaoBrasil: data.regiaoBrasil || undefined,
        objetoAcao: data.objetoAcao || undefined,
        principioAtivo: data.principioAtivo || undefined,
        dataEntradaDJUD: data.dataEntradaDJUD || undefined,
        pontoControle: data.pontoControle || undefined,
      };

      const res = await fetch(
        isNew ? "/api/demandas" : `/api/demandas/${demandaId}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiData),
        }
      );

      if (res.ok) {
        toast.success(isNew ? "Demanda criada com sucesso!" : "Demanda atualizada com sucesso!");
        router.push("/demandas");
        router.refresh();
      } else {
        const error = await res.json();
        if (error.error?.includes("número")) {
          form.setError("numero", { message: error.error });
        } else {
          form.setError("root", { message: error.error || "Erro ao salvar demanda" });
          toast.error(error.error || "Erro ao salvar demanda.");
        }
      }
    } catch {
      toast.error("Não foi possível conectar ao servidor.");
      form.setError("root", { message: "Erro de conexão com o servidor" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <PageHeader
        title={isNew ? "Nova Demanda" : "Editar Demanda"}
        description={
          isNew
            ? "Criar uma nova demanda judicial no sistema"
            : "Editar informações da demanda"
        }
      />

      <div className="bg-card border border-border rounded-xl p-6 max-w-4xl shadow-sm">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          {/* ── Informações Básicas ──────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Informações Básicas</SectionTitle>

            {/* Número */}
            <div className="space-y-1.5">
              <Label htmlFor="f-numero">
                Número <span className="text-destructive">*</span>
              </Label>
              <Input
                id="f-numero"
                placeholder="Ex: 2024/001"
                disabled={!isNew}
                {...form.register("numero")}
              />
              <FieldError message={form.formState.errors.numero?.message} />
            </div>

            {/* Título */}
            <div className="space-y-1.5">
              <Label htmlFor="f-titulo">
                Título <span className="text-destructive">*</span>
              </Label>
              <Input
                id="f-titulo"
                placeholder="Título da demanda"
                {...form.register("titulo")}
              />
              <FieldError message={form.formState.errors.titulo?.message} />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="f-descricao">
                Descrição <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="f-descricao"
                placeholder="Descrição detalhada da demanda"
                rows={4}
                {...form.register("descricao")}
              />
              <FieldError message={form.formState.errors.descricao?.message} />
            </div>
          </section>

          <Separator />

          {/* ── Classificação ────────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Classificação</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Status */}
              <div className="space-y-1.5">
                <Label htmlFor="f-status">Status</Label>
                <select id="f-status" {...form.register("status")} className={selectCn}>
                  <option value="">Selecionar status...</option>
                  <option value="Aberta">Aberta</option>
                  <option value="Fechada">Fechada</option>
                  <option value="Arquivada">Arquivada</option>
                  <option value="Pendente">Pendente</option>
                </select>
              </div>

              {/* Prioridade */}
              <div className="space-y-1.5">
                <Label htmlFor="f-prioridade">Prioridade</Label>
                <select id="f-prioridade" {...form.register("prioridade")} className={selectCn}>
                  <option value="">Selecionar prioridade...</option>
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Crítica">Crítica</option>
                </select>
              </div>

              {/* Projeto */}
              <div className="space-y-1.5">
                <Label htmlFor="f-projeto">Projeto</Label>
                <Input id="f-projeto" placeholder="Ex: PNCP" {...form.register("projeto")} />
              </div>

              {/* Ano */}
              <div className="space-y-1.5">
                <Label htmlFor="f-ano">Ano</Label>
                <Input
                  id="f-ano"
                  type="number"
                  placeholder="Ex: 2024"
                  {...form.register("ano")}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Responsabilidades ────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Responsabilidades</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Organização */}
              <div className="space-y-1.5">
                <Label htmlFor="f-org">Organização</Label>
                <select id="f-org" {...form.register("organizacaoId")} className={selectCn}>
                  <option value="">Selecionar organização...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Responsável */}
              <div className="space-y-1.5">
                <Label htmlFor="f-resp">Responsável</Label>
                <select id="f-resp" {...form.register("responsavelId")} className={selectCn}>
                  <option value="">Selecionar responsável...</option>
                  {responsaveis.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Datas e Informações Adicionais ───────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Datas e Informações Adicionais</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="f-data-inicio">Data Início</Label>
                <Input id="f-data-inicio" type="date" {...form.register("dataInicio")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-data-venc">Data Vencimento</Label>
                <Input id="f-data-venc" type="date" {...form.register("dataVencimento")} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="f-origem">Origem da Demanda</Label>
                <Input
                  id="f-origem"
                  placeholder="Ex: Ministerial, Judicial"
                  {...form.register("origemDemanda")}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Dados Judiciais ──────────────────────────────────────────── */}
          <section className="space-y-4">
            <div>
              <SectionTitle>Dados Judiciais</SectionTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Campos provenientes da base Redmine / processo judicial
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Número do Processo */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="f-numproc">Número do Processo</Label>
                <Input
                  id="f-numproc"
                  placeholder="Ex: 5000904-02.2021.4.03.6006"
                  className="font-mono"
                  {...form.register("numeroProcesso")}
                />
                <p className="text-xs text-muted-foreground">
                  Número CNJ do processo judicial originário
                </p>
              </div>

              {/* Data de Entrada DJUD */}
              <div className="space-y-1.5">
                <Label htmlFor="f-data-djud">Data de Entrada DJUD</Label>
                <Input id="f-data-djud" type="date" {...form.register("dataEntradaDJUD")} />
                <p className="text-xs text-muted-foreground">
                  Quando o processo foi registrado no DJUD
                </p>
              </div>

              {/* Ponto de Controle */}
              <div className="space-y-1.5">
                <Label htmlFor="f-pontoctrl">Ponto de Controle</Label>
                <Input
                  id="f-pontoctrl"
                  placeholder="Ex: Cessar Atos, Entrega Pendente"
                  {...form.register("pontoControle")}
                />
              </div>

              {/* Grupo Temático */}
              <div className="space-y-1.5">
                <Label htmlFor="f-area">Grupo Temático</Label>
                <select id="f-area" {...form.register("areaTematica")} className={selectCn}>
                  <option value="">Selecionar grupo temático...</option>
                  <option value="Medicamentos Oncológicos/Oftalmológicos">
                    Medicamentos Oncológicos / Oftalmológicos
                  </option>
                  <option value="Medicamentos Alto Impacto Financeiro">
                    Medicamentos Alto Impacto Financeiro
                  </option>
                  <option value="Assistência Farmacêutica Básica">
                    Assistência Farmacêutica Básica
                  </option>
                  <option value="Atenção à Saúde">Atenção à Saúde</option>
                  <option value="Insumos e Equipamentos">Insumos e Equipamentos</option>
                  <option value="Outros Medicamentos">Outros Medicamentos</option>
                </select>
              </div>

              {/* TRF Região */}
              <div className="space-y-1.5">
                <Label htmlFor="f-trf">
                  TRF Região
                </Label>
                <select id="f-trf" {...form.register("trfRegiao")} className={selectCn}>
                  <option value="">Selecionar TRF...</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}ª Região
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Tribunal Regional Federal responsável pelo processo
                </p>
              </div>

              {/* Região Brasil */}
              <div className="space-y-1.5">
                <Label htmlFor="f-regiao">Região Brasil</Label>
                <select id="f-regiao" {...form.register("regiaoBrasil")} className={selectCn}>
                  <option value="">Selecionar região...</option>
                  {["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Objeto da Ação */}
              <div className="space-y-1.5">
                <Label htmlFor="f-objeto">Objeto da Ação</Label>
                <Input
                  id="f-objeto"
                  placeholder="Ex: Medicamento - Oncológico"
                  {...form.register("objetoAcao")}
                />
              </div>

              {/* Princípio Ativo */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="f-principio">Princípio Ativo / Medicamento</Label>
                <Input
                  id="f-principio"
                  placeholder="Ex: Bevacizumabe, Pembrolizumabe"
                  {...form.register("principioAtivo")}
                />
                <p className="text-xs text-muted-foreground">
                  Nome genérico (DCI) do medicamento ou insumo pleiteado judicialmente
                </p>
              </div>
            </div>
          </section>

          {/* ── Anexos ──────────────────────────────────────────────────── */}
          {!isNew && (
            <>
              <Separator />
              <AttachmentsManager
                demandaId={demandaId}
                existingAttachments={attachments}
                onAttachmentsChange={setAttachments}
              />
            </>
          )}

          {/* ── Erro global ─────────────────────────────────────────────── */}
          {form.formState.errors.root && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
              {form.formState.errors.root.message}
            </div>
          )}

          {/* ── Botões ──────────────────────────────────────────────────── */}
          <div className="flex gap-3 justify-end pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={submitting}
            >
              Cancelar
            </Button>

            {!isNew && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsExportModalOpen(true)}
                disabled={submitting}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            )}

            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isNew ? "Criar Demanda" : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </div>

      <DemandaExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        demandaId={demandaId}
        demandaNumero={demandaNumero}
      />
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
