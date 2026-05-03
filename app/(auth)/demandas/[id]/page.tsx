"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/backoffice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Edit2,
  Calendar,
  User,
  Building2,
  Scale,
  MapPin,
  Pill,
  FileText,
  Tag,
  Clock,
  Hash,
  Layers,
  Paperclip,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { rolePermissions } from "@/lib/permissions";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Demanda {
  id: string;
  numero: string;
  titulo: string;
  descricao: string;
  status?: string | null;
  prioridade?: string | null;
  projeto?: string | null;
  ano?: number | null;
  origemDemanda?: string | null;
  pontoControle?: string | null;
  // Dados Judiciais (Sprint 8)
  numeroProcesso?: string | null;
  areaTematica?: string | null;
  regiaoBrasil?: string | null;
  objetoAcao?: string | null;
  principioAtivo?: string | null;
  dataEntradaDJUD?: string | null;
  trfRegiao?: number | null;
  // Relações
  organizacao?: { id: string; name: string } | null;
  responsavel?: { id: string; name: string } | null;
  criadoPor?: { id: string; name: string } | null;
  dataInicio?: string | null;
  dataVencimento?: string | null;
  tags?: string[];
  criadoEm: string;
  atualizadoEm: string;
  _count?: { attachments: number };
}

// ── Status/prioridade colors ───────────────────────────────────────────────────

const statusColors: Record<string, "active" | "warning" | "error" | "pending" | "inactive"> = {
  Aberta: "active",
  Fechada: "error",
  Arquivada: "warning",
  Pendente: "pending",
  Concluída: "active",
  "Em Análise": "pending",
  "Em Análise COAJUD": "pending",
  "Em Análise CONJUR": "pending",
  "Cessar Atos": "warning",
  "Entrega Pendente": "warning",
  Suspensa: "warning",
  Cancelada: "error",
  Encerrada: "error",
};

const prioridadeColors: Record<string, "active" | "warning" | "error"> = {
  Baixa: "active",
  Média: "warning",
  Alta: "error",
  Crítica: "error",
};

// ── Framer Motion variants ─────────────────────────────────────────────────────

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 28 } },
};

// ── Sub-componente: linha de campo ────────────────────────────────────────────

function FieldRow({
  icon,
  label,
  value,
  mono = false,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  if (!value && value !== 0) return null;
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
          {label}
        </p>
        <p className={`text-sm text-foreground break-words ${mono ? "font-mono" : "font-medium"}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ── Sub-componente: card de seção ─────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-muted/30">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {children}
      </div>
    </motion.div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DemandaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const demandaId = params.id as string;
  const { data: session } = useSession();

  const [demanda, setDemanda] = useState<Demanda | null>(null);
  const [loading, setLoading] = useState(true);

  const userRole = (session?.user as any)?.role || "OPERATOR";
  const permissions = rolePermissions[userRole as keyof typeof rolePermissions] || [];
  const canEdit = permissions.includes("demandas:write");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/demandas/${demandaId}`);
        if (res.ok) {
          setDemanda(await res.json());
        } else {
          toast.error("Demanda não encontrada.");
          router.push("/demandas");
        }
      } catch {
        toast.error("Erro ao carregar demanda.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [demandaId, router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-20 rounded-xl bg-muted/40 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!demanda) return null;

  const statusColor = statusColors[demanda.status || ""] ?? "inactive";
  const prioridadeColor = prioridadeColors[demanda.prioridade || ""] ?? "warning";

  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <PageHeader
          title={demanda.titulo}
          description={demanda.numero}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/demandas")}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Voltar
              </Button>
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => router.push(`/demandas/${demandaId}/edit`)}
                >
                  <Edit2 className="h-4 w-4 mr-1.5" />
                  Editar
                </Button>
              )}
            </div>
          }
        />
      </motion.div>

      {/* ── Badges de status ────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
        {demanda.status && (
          <StatusBadge status={statusColor}>{demanda.status}</StatusBadge>
        )}
        {demanda.prioridade && (
          <StatusBadge status={prioridadeColor}>
            Prioridade: {demanda.prioridade}
          </StatusBadge>
        )}
        {demanda.pontoControle && (
          <Badge variant="outline" className="text-xs">
            {demanda.pontoControle}
          </Badge>
        )}
        {demanda._count?.attachments ? (
          <Badge variant="outline" className="text-xs gap-1">
            <Paperclip className="h-3 w-3" />
            {demanda._count.attachments} anexo{demanda._count.attachments !== 1 ? "s" : ""}
          </Badge>
        ) : null}
      </motion.div>

      {/* ── Grid de seções ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Identificação ──────────────────────────────────────────────── */}
        <SectionCard icon={<FileText className="h-4 w-4" />} title="Identificação">
          <FieldRow
            icon={<Hash className="h-4 w-4" />}
            label="Número DJUD"
            value={demanda.numero}
            mono
          />
          <FieldRow
            icon={<Scale className="h-4 w-4" />}
            label="Número do Processo"
            value={demanda.numeroProcesso}
            mono
          />
          <FieldRow
            icon={<Layers className="h-4 w-4" />}
            label="Grupo Temático"
            value={demanda.areaTematica}
          />
          <FieldRow
            icon={<Tag className="h-4 w-4" />}
            label="Objeto da Ação"
            value={demanda.objetoAcao}
          />
          <FieldRow
            icon={<FileText className="h-4 w-4" />}
            label="Descrição"
            value={demanda.descricao}
            className="sm:col-span-2"
          />
        </SectionCard>

        {/* ── Dados Judiciais ─────────────────────────────────────────────── */}
        <SectionCard icon={<Scale className="h-4 w-4" />} title="Dados Judiciais">
          <FieldRow
            icon={<MapPin className="h-4 w-4" />}
            label="TRF Região"
            value={demanda.trfRegiao ? `${demanda.trfRegiao}ª Região` : null}
          />
          <FieldRow
            icon={<MapPin className="h-4 w-4" />}
            label="Região do Brasil"
            value={demanda.regiaoBrasil}
          />
          <FieldRow
            icon={<Pill className="h-4 w-4" />}
            label="Princípio Ativo / Medicamento"
            value={demanda.principioAtivo}
          />
          <FieldRow
            icon={<Calendar className="h-4 w-4" />}
            label="Data de Entrada DJUD"
            value={
              demanda.dataEntradaDJUD
                ? new Date(demanda.dataEntradaDJUD).toLocaleDateString("pt-BR")
                : null
            }
          />
          {demanda.origemDemanda && (
            <FieldRow
              icon={<FileText className="h-4 w-4" />}
              label="Origem da Demanda"
              value={demanda.origemDemanda}
            />
          )}
          {demanda.projeto && (
            <FieldRow
              icon={<Layers className="h-4 w-4" />}
              label="Projeto"
              value={demanda.projeto}
            />
          )}
        </SectionCard>

        {/* ── Responsabilidade ────────────────────────────────────────────── */}
        <SectionCard icon={<User className="h-4 w-4" />} title="Responsabilidade">
          <FieldRow
            icon={<User className="h-4 w-4" />}
            label="Responsável"
            value={demanda.responsavel?.name}
          />
          <FieldRow
            icon={<Building2 className="h-4 w-4" />}
            label="Organização"
            value={demanda.organizacao?.name}
          />
          <FieldRow
            icon={<User className="h-4 w-4" />}
            label="Criado por"
            value={(demanda.criadoPor as any)?.name}
          />
        </SectionCard>

        {/* ── Datas ───────────────────────────────────────────────────────── */}
        <SectionCard icon={<Calendar className="h-4 w-4" />} title="Datas">
          <FieldRow
            icon={<Clock className="h-4 w-4" />}
            label="Criado em"
            value={formatDateTime(demanda.criadoEm)}
          />
          <FieldRow
            icon={<Clock className="h-4 w-4" />}
            label="Atualizado em"
            value={formatDateTime(demanda.atualizadoEm)}
          />
          {demanda.dataInicio && (
            <FieldRow
              icon={<Calendar className="h-4 w-4" />}
              label="Data de início"
              value={new Date(demanda.dataInicio).toLocaleDateString("pt-BR")}
            />
          )}
          {demanda.dataVencimento && (
            <FieldRow
              icon={<Calendar className="h-4 w-4" />}
              label="Data de vencimento"
              value={new Date(demanda.dataVencimento).toLocaleDateString("pt-BR")}
            />
          )}
          {demanda.ano && (
            <FieldRow
              icon={<Calendar className="h-4 w-4" />}
              label="Ano"
              value={String(demanda.ano)}
            />
          )}
        </SectionCard>

      </div>

      {/* ── Tags ────────────────────────────────────────────────────────────── */}
      {demanda.tags && demanda.tags.length > 0 && (
        <motion.div
          variants={fadeUp}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Tags</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {demanda.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Ações finais ─────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <Separator />
        <div className="flex justify-between items-center pt-4">
          <Button variant="outline" onClick={() => router.push("/demandas")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Voltar para Demandas
          </Button>
          {canEdit && (
            <Button onClick={() => router.push(`/demandas/${demandaId}/edit`)}>
              <Edit2 className="h-4 w-4 mr-1.5" />
              Editar esta Demanda
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
