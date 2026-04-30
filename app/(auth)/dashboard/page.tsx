"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Bem-vindo ao DJUD Painel — Etapa 2
        </p>
      </div>

      {/* User Info Card */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Informações do Usuário
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Autenticado via Auth.js v5 + Google OAuth
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Nome:</span>{" "}
            <span className="text-foreground font-medium">{session?.user?.name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Email:</span>{" "}
            <span className="text-foreground font-medium">{session?.user?.email}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Role:</span>{" "}
            <span className="inline-block mt-1 px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded">
              {(session?.user as any)?.role || "OPERATOR"}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <Button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="bg-destructive hover:bg-destructive/90"
          >
            Sair
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Status da Etapa 2
          </h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-green-500">✅</span>
            <span className="text-sm">Auth.js v5 + Google OAuth</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✅</span>
            <span className="text-sm">Middleware de proteção de rotas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✅</span>
            <span className="text-sm">Controle de acesso por role</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✅</span>
            <span className="text-sm">Página de login customizada</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✅</span>
            <span className="text-sm">Audit logging + Email templates</span>
          </div>
        </div>

        <div className="pt-4 border-t border-border text-sm text-muted-foreground">
          <p>
            Próximos passos: Etapa 3 — Layout base (Sidebar, Topbar, PageHeader)
          </p>
        </div>
      </div>
    </div>
  );
}
