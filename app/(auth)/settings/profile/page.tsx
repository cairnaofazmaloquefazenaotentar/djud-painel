"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { User, Mail, Shield, Building2, Key, Check, AlertCircle } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  ADMIN:    "Administrador",
  MANAGER:  "Gerenciador",
  OPERATOR: "Operador",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN:    "Acesso total ao sistema — criar, editar, excluir e exportar dados",
  MANAGER:  "Gerenciar demandas e usuários — criar e editar, sem exclusão",
  OPERATOR: "Visualizar e acompanhar demandas — acesso somente leitura",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN:    "bg-red-100 text-red-700 border-red-200",
  MANAGER:  "bg-yellow-100 text-yellow-700 border-yellow-200",
  OPERATOR: "bg-green-100 text-green-700 border-green-200",
};

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwStatus, setPwStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [pwError, setPwError] = useState("");

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      setPwError("As senhas não coincidem.");
      setPwStatus("error");
      return;
    }
    if (pwForm.next.length < 8) {
      setPwError("A nova senha deve ter pelo menos 8 caracteres.");
      setPwStatus("error");
      return;
    }
    setPwStatus("loading");
    setPwError("");
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
        setPwStatus("ok");
        setPwForm({ current: "", next: "", confirm: "" });
        setTimeout(() => setPwStatus("idle"), 3000);
      } else {
        const err = await res.json();
        setPwError(err.error || "Erro ao alterar senha.");
        setPwStatus("error");
      }
    } catch {
      setPwError("Erro ao alterar senha.");
      setPwStatus("error");
    }
  };

  if (!user) return null;

  const role      = user.role || "OPERATOR";
  const initials  = (user.name || user.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader
        title="Configurações"
        description="Perfil e preferências da sua conta"
      />

      {/* Card: Informações do Perfil */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold flex-shrink-0">
            {initials}
          </div>
          <div>
            <h2 className="text-lg font-semibold">{user.name || "Sem nome"}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Nome</p>
              <p className="text-sm font-medium mt-0.5">{user.name || "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
            <Mail className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">E-mail</p>
              <p className="text-sm font-medium mt-0.5">{user.email || "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
            <Shield className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Papel</p>
              <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded border ${ROLE_COLORS[role] || ""}`}>
                {ROLE_LABELS[role] || role}
              </span>
            </div>
          </div>
          {user.organizationId && (
            <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Organização</p>
                <p className="text-sm font-medium mt-0.5">{user.organizationId}</p>
              </div>
            </div>
          )}
        </div>

        {/* Descrição do papel */}
        <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <Shield className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
      </div>

      {/* Card: Permissões */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Permissões da Conta
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { key: "demandas:read",   label: "Ver demandas" },
            { key: "demandas:write",  label: "Criar/editar demandas" },
            { key: "demandas:delete", label: "Excluir demandas" },
            { key: "users:read",      label: "Ver usuários" },
            { key: "users:write",     label: "Criar/editar usuários" },
            { key: "users:delete",    label: "Excluir usuários" },
            { key: "export:csv",      label: "Exportar dados CSV" },
            { key: "logs:read",       label: "Ver logs de auditoria" },
          ].map(({ key, label }) => {
            const hasIt =
              role === "ADMIN" ||
              (role === "MANAGER" && ["demandas:read", "demandas:write", "users:read", "export:csv"].includes(key)) ||
              (role === "OPERATOR" && ["demandas:read"].includes(key));
            return (
              <div key={key} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                hasIt ? "text-foreground" : "text-muted-foreground/50"
              }`}>
                <Check className={`h-3.5 w-3.5 flex-shrink-0 ${hasIt ? "text-green-600" : "text-muted-foreground/30"}`} />
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Card: Alterar Senha */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Key className="h-4 w-4" />
          Alterar Senha
        </h3>
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Senha atual</label>
            <input
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nova senha</label>
            <input
              type="password"
              value={pwForm.next}
              onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirmar nova senha</label>
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          {pwStatus === "error" && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {pwError}
            </div>
          )}
          {pwStatus === "ok" && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md border border-green-200">
              <Check className="h-4 w-4 flex-shrink-0" />
              Senha alterada com sucesso!
            </div>
          )}

          <Button type="submit" disabled={pwStatus === "loading"}>
            {pwStatus === "loading" ? "Alterando..." : "Alterar Senha"}
          </Button>
        </form>
      </div>

      {/* Card: Informações do Sistema */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-base font-semibold mb-4">Sobre o Sistema</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            ["Sistema",       "DJUD Painel"],
            ["Versão",        "v1.0.0"],
            ["Base de dados", "51.401 demandas judiciais importadas"],
            ["Fonte",         "Base Redmine — Ministério da Saúde"],
            ["Período",       "Dados até março de 2026"],
            ["Suporte",       "COAJUD/CONJUR — MS"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
