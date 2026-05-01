"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createDemandaSchema } from "@/lib/schemas";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AttachmentsManager } from "@/components/attachments-manager";
import { DemandaExportModal } from "@/components/demanda-export-modal";
import { Loader2, Download } from "lucide-react";

// Use a form-specific schema that matches HTML form inputs (strings)
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
  // Sprint 8 — dados judiciais
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
  uploadedBy: {
    id: string;
    name: string;
  };
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
  // Sprint 8
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

export default function EditDemandaPage() {
  const router = useRouter();
  const params = useParams();
  const demandaId = params.id as string;
  const isNew = demandaId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [demandaNumero, setDemandaNumero] = useState("");
  const [organizations, setOrganizations] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [responsaveis, setResponsaveis] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const form = useForm<DemandaFormData>({
    resolver: zodResolver(demandaFormSchema),
    defaultValues: {
      status: "Aberta",
      prioridade: "Média",
      tags: [],
    },
  });

  // Load organizations and responsaveis
  useEffect(() => {
    const loadData = async () => {
      try {
        const [orgRes, userRes] = await Promise.all([
          fetch("/api/organizations"),
          fetch("/api/users?pageSize=100"),
        ]);

        if (orgRes.ok) {
          const data = await orgRes.json();
          setOrganizations(data.data || []);
        }

        if (userRes.ok) {
          const data = await userRes.json();
          setResponsaveis(data.data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      }
    };

    loadData();

    // Load demanda if editing
    if (!isNew) {
      const loadDemanda = async () => {
        try {
          const [demandaRes, attachmentsRes] = await Promise.all([
            fetch(`/api/demandas/${demandaId}`),
            fetch(`/api/demandas/${demandaId}/attachments`),
          ]);

          if (demandaRes.ok) {
            const demanda: Demanda = await demandaRes.json();
            setDemandaNumero(demanda.numero);
            form.reset({
              numero: demanda.numero,
              titulo: demanda.titulo,
              descricao: demanda.descricao,
              status: demanda.status || "Aberta",
              prioridade: demanda.prioridade || "Média",
              organizacaoId: demanda.organizacao?.id || "",
              responsavelId: demanda.responsavel?.id || "",
              dataInicio: demanda.dataInicio
                ? new Date(demanda.dataInicio).toISOString().split("T")[0]
                : "",
              dataVencimento: demanda.dataVencimento
                ? new Date(demanda.dataVencimento).toISOString().split("T")[0]
                : "",
              tags: demanda.tags || [],
              projeto: demanda.projeto || "",
              ano: demanda.ano ? String(demanda.ano) : "",
              origemDemanda: demanda.origemDemanda || "",
              // Sprint 8 — dados judiciais
              numeroProcesso: demanda.numeroProcesso || "",
              areaTematica: demanda.areaTematica || "",
              regiaoBrasil: demanda.regiaoBrasil || "",
              objetoAcao: demanda.objetoAcao || "",
              principioAtivo: demanda.principioAtivo || "",
              dataEntradaDJUD: demanda.dataEntradaDJUD
                ? new Date(demanda.dataEntradaDJUD).toISOString().split("T")[0]
                : "",
              trfRegiao: demanda.trfRegiao ? String(demanda.trfRegiao) : "",
              pontoControle: demanda.pontoControle || "",
            });
          }

          if (attachmentsRes.ok) {
            const data = await attachmentsRes.json();
            setAttachments(data.data || []);
          }
        } catch (error) {
          console.error("Erro ao carregar demanda:", error);
        } finally {
          setLoading(false);
        }
      };

      loadDemanda();
    }
  }, [demandaId, isNew, form]);

  const onSubmit = async (data: DemandaFormData) => {
    setSubmitting(true);
    try {
      // Convert form data to API format
      const apiData = {
        numero: data.numero,
        titulo: data.titulo,
        descricao: data.descricao,
        status: data.status || undefined,
        prioridade: data.prioridade || undefined,
        organizacaoId: data.organizacaoId || undefined,
        responsavelId: data.responsavelId || undefined,
        dataInicio: data.dataInicio || undefined,
        dataVencimento: data.dataVencimento || undefined,
        tags: data.tags || [],
        projeto: data.projeto || undefined,
        ano: data.ano ? Number(data.ano) : undefined,
        origemDemanda: data.origemDemanda || undefined,
        // Sprint 8
        numeroProcesso: data.numeroProcesso || undefined,
        areaTematica: data.areaTematica || undefined,
        regiaoBrasil: data.regiaoBrasil || undefined,
        objetoAcao: data.objetoAcao || undefined,
        principioAtivo: data.principioAtivo || undefined,
        dataEntradaDJUD: data.dataEntradaDJUD || undefined,
        trfRegiao: data.trfRegiao ? Number(data.trfRegiao) : undefined,
        pontoControle: data.pontoControle || undefined,
      };

      const method = isNew ? "POST" : "PUT";
      const url = isNew ? "/api/demandas" : `/api/demandas/${demandaId}`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiData),
      });

      if (res.ok) {
        router.push("/demandas");
        router.refresh();
      } else {
        const error = await res.json();
        form.setError("root", { message: error.error || "Erro ao salvar demanda" });
      }
    } catch (error) {
      form.setError("root", { message: "Erro ao salvar demanda" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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

      <div className="bg-card border border-border rounded-lg p-6 max-w-4xl">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Seção: Informações Básicas */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-foreground">
              Informações Básicas
            </h3>
            <div className="space-y-4">
              {/* Número */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Número <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: 2024/001"
                  disabled={!isNew}
                  {...form.register("numero")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                {form.formState.errors.numero && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.numero.message}
                  </p>
                )}
              </div>

              {/* Título */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Título <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Título da demanda"
                  {...form.register("titulo")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {form.formState.errors.titulo && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.titulo.message}
                  </p>
                )}
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Descrição <span className="text-destructive">*</span>
                </label>
                <textarea
                  placeholder="Descrição detalhada da demanda"
                  rows={4}
                  {...form.register("descricao")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {form.formState.errors.descricao && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.descricao.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Seção: Classificação */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4 text-foreground">
              Classificação
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Status
                </label>
                <select
                  {...form.register("status")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecionar status...</option>
                  <option value="Aberta">Aberta</option>
                  <option value="Fechada">Fechada</option>
                  <option value="Arquivada">Arquivada</option>
                  <option value="Pendente">Pendente</option>
                </select>
              </div>

              {/* Prioridade */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Prioridade
                </label>
                <select
                  {...form.register("prioridade")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecionar prioridade...</option>
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Crítica">Crítica</option>
                </select>
              </div>

              {/* Projeto */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Projeto
                </label>
                <input
                  type="text"
                  placeholder="Ex: PNCP"
                  {...form.register("projeto")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Ano */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Ano
                </label>
                <input
                  type="number"
                  placeholder="Ex: 2024"
                  {...form.register("ano", { valueAsNumber: true })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Seção: Organização e Responsável */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4 text-foreground">
              Responsabilidades
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Organização */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Organização
                </label>
                <select
                  {...form.register("organizacaoId")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecionar organização...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Responsável */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Responsável
                </label>
                <select
                  {...form.register("responsavelId")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecionar responsável...</option>
                  {responsaveis.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Seção: Datas e Metadados */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4 text-foreground">
              Datas e Informações Adicionais
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Data Início */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Data Início
                </label>
                <input
                  type="date"
                  {...form.register("dataInicio")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Data Vencimento */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Data Vencimento
                </label>
                <input
                  type="date"
                  {...form.register("dataVencimento")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Origem Demanda */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  Origem da Demanda
                </label>
                <input
                  type="text"
                  placeholder="Ex: Ministerial, Judicial"
                  {...form.register("origemDemanda")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Seção: Dados Judiciais (Sprint 8) */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-1 text-foreground">
              Dados Judiciais
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Campos provenientes da base Redmine / processo judicial
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Número do Processo */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  Número do Processo
                </label>
                <input
                  type="text"
                  placeholder="Ex: 5000904-02.2021.4.03.6006"
                  {...form.register("numeroProcesso")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono text-sm"
                />
              </div>

              {/* Data de Entrada DJUD */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Data de Entrada DJUD
                </label>
                <input
                  type="date"
                  {...form.register("dataEntradaDJUD")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Ponto de Controle */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Ponto de Controle
                </label>
                <input
                  type="text"
                  placeholder="Ex: Cessar Atos, Entrega Pendente"
                  {...form.register("pontoControle")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Grupo Temático */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Grupo Temático
                </label>
                <select
                  {...form.register("areaTematica")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecionar grupo temático...</option>
                  <option value="Medicamentos Oncológicos/Oftalmológicos">
                    Medicamentos Oncológicos/Oftalmológicos
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
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  TRF Região
                </label>
                <select
                  {...form.register("trfRegiao")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecionar TRF...</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}ª Região
                    </option>
                  ))}
                </select>
              </div>

              {/* Região Brasil */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Região Brasil
                </label>
                <select
                  {...form.register("regiaoBrasil")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecionar região...</option>
                  <option value="Norte">Norte</option>
                  <option value="Nordeste">Nordeste</option>
                  <option value="Centro-Oeste">Centro-Oeste</option>
                  <option value="Sudeste">Sudeste</option>
                  <option value="Sul">Sul</option>
                </select>
              </div>

              {/* Objeto da Ação */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Objeto da Ação
                </label>
                <input
                  type="text"
                  placeholder="Ex: Medicamento - Oncológico"
                  {...form.register("objetoAcao")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Princípio Ativo */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  Princípio Ativo / Medicamento
                </label>
                <input
                  type="text"
                  placeholder="Ex: Bevacizumabe, Pembrolizumabe"
                  {...form.register("principioAtivo")}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Seção: Anexos - apenas em edit */}
          {!isNew && (
            <div className="border-t border-border pt-6">
              <AttachmentsManager
                demandaId={demandaId}
                existingAttachments={attachments}
                onAttachmentsChange={setAttachments}
              />
            </div>
          )}

          {/* Error Message */}
          {form.formState.errors.root && (
            <div className="p-3 bg-destructive/10 border border-destructive/50 rounded-md text-sm text-destructive">
              {form.formState.errors.root.message}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-6 border-t border-border">
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

      {/* Export Modal */}
      <DemandaExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        demandaId={demandaId}
        demandaNumero={demandaNumero}
      />
    </div>
  );
}
