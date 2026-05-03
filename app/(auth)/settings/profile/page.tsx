"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  User,
  Mail,
  Shield,
  Building2,
  Key,
  Check,
  X,
  Info,
  Loader2,
} from "lucide-react";

// ── Dados de papel ────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerenciador",
  OPERATOR: "Operador",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Acesso total ao sistema — criar, editar, excluir e exportar dados.",
  MANAGER: "Gerenciar demandas e usuários — criar e editar, sem permissão de exclusão.",
  OPERATOR: "Visualizar e acompanhar demandas — acesso somente leitura.",
};

// Usa variáveis CSS do tema — sem cores Tailwind hardcoded
const ROLE_BADGE_CLASS: Record<string, string> = {
  ADMIN: "bg-destructive/10 text-destructive border-destructive/20",
  MANAGER:
    "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  OPERATOR: "bg-primary/10 text-primary border-primary/20",
};

// ── Permissões ────────────────────────────────────────────────────────────────

const PERMISSIONS = [
  { key: "demandas:read", label: "Visualizar demandas" },
  { key: "demandas:write", label: "Criar / editar demandas" },
  { key: "demandas:delete", label: "Excluir demandas" },
  { key: "users:read", label: "Visualizar usuários" },
  { key: "users:write", label: "Criar / editar usuários" },
  { key: "users:delete", label: "Excluir usuários" },
  { key: "export:csv", label: "Exportar dados CSV" },
  { key: "logs:read", label: "Ver logs de auditoria" },
];

function hasPermission(role: string, key: string): boolean {
  if (role === "ADMIN") return true;
  if (role === "MANAGER")
    return ["demandas:read", "demandas:write", "users:read", "export:csv"].includes(key);
  if (role === "OPERATOR") return ["demandas:read"].includes(key);
  return false;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (pwForm.next.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch(`/api/users/${user?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: pwForm.current,
          password: pwForm.next,
        }),
      });
      if (res.ok) {
        toast.success("Senha alterada com sucesso!");
        setPwForm({ current: "", next: "", confirm: "" });
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao alterar a senha.");
      }
    } catch {
      toast.error("Não foi possível conectar ao servidor.");
    } finally {
      setPwLoading(false);
    }
  };

  if (!user) return null;

  const role = user.role || "OPERATOR";
  const initials = (user.name || user.email || "?")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Configurações"
        description="Perfil e preferências da sua conta"
      />

      {/* ── Informações do Perfil ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b pb-6">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Informações do Perfil</CardTitle>
          </div>
          <CardDescription>Dados da sua conta no sistema DJUD</CardDescription>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Avatar + identidade */}
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold shrink-0 select-none">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-base truncate">
                {user.name || "Sem nome"}
              </p>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
              <Badge
                variant="outline"
                className={`mt-1.5 text-xs font-medium ${ROLE_BADGE_CLASS[role] ?? ""}`}
              >
                {ROLE_LABELS[role] ?? role}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Grid de campos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoTile icon={<User className="h-4 w-4" />} label="Nome">
              {user.name || "—"}
            </InfoTile>
            <InfoTile icon={<Mail className="h-4 w-4" />} label="E-mail">
              {user.email || "—"}
            </InfoTile>
            <InfoTile icon={<Shield className="h-4 w-4" />} label="Função">
              {ROLE_LABELS[role] ?? role}
            </InfoTile>
            {user.organizationId && (
              <InfoTile icon={<Building2 className="h-4 w-4" />} label="Organização">
                {user.organizationId}
              </InfoTile>
            )}
          </div>

          {/* Descrição do papel */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 bg-primary/10 border border-primary/20 rounded-lg">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-primary leading-relaxed">
              {ROLE_DESCRIPTIONS[role]}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Permissões da Conta ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b pb-6">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Permissões da Conta</CardTitle>
          </div>
          <CardDescription>
            Ações disponíveis para a função <strong>{ROLE_LABELS[role]}</strong>
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {PERMISSIONS.map(({ key, label }) => {
              const granted = hasPermission(role, key);
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    granted ? "text-foreground" : "text-muted-foreground/50"
                  }`}
                >
                  {granted ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
                  )}
                  {label}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Alterar Senha ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b pb-6">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Alterar Senha</CardTitle>
          </div>
          <CardDescription>
            Escolha uma senha forte com no mínimo 8 caracteres
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
            <div className="space-y-1.5">
              <Label htmlFor="pw-current">Senha atual</Label>
              <Input
                id="pw-current"
                type="password"
                value={pwForm.current}
                onChange={(e) =>
                  setPwForm((p) => ({ ...p, current: e.target.value }))
                }
                autoComplete="current-password"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pw-next">Nova senha</Label>
              <Input
                id="pw-next"
                type="password"
                value={pwForm.next}
                onChange={(e) =>
                  setPwForm((p) => ({ ...p, next: e.target.value }))
                }
                autoComplete="new-password"
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">Confirmar nova senha</Label>
              <Input
                id="pw-confirm"
                type="password"
                value={pwForm.confirm}
                onChange={(e) =>
                  setPwForm((p) => ({ ...p, confirm: e.target.value }))
                }
                autoComplete="new-password"
                required
              />
            </div>

            <Button type="submit" disabled={pwLoading}>
              {pwLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {pwLoading ? "Alterando..." : "Alterar Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Sobre o Sistema ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b pb-6">
          <CardTitle className="text-base">Sobre o Sistema</CardTitle>
          <CardDescription>
            Informações técnicas sobre esta instância do DJUD Painel
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ["Sistema", "DJUD Painel"],
              ["Versão", "v1.0.0"],
              ["Base de dados", "51.401 demandas judiciais"],
              ["Fonte", "Base Redmine — Ministério da Saúde"],
              ["Período", "Dados até março de 2026"],
              ["Suporte", "COAJUD / CONJUR — MS"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                  {label}
                </dt>
                <dd className="text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-componente: tile de info ──────────────────────────────────────────────

function InfoTile({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-lg">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </p>
        <p className="text-sm font-medium mt-0.5">{children}</p>
      </div>
    </div>
  );
}
