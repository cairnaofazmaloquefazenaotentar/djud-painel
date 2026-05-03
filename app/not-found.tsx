"use client";

import Link from "next/link";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-md px-4">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Scale className="h-10 w-10 text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-7xl font-bold text-foreground tracking-tight">404</h1>
          <p className="text-xl font-semibold text-foreground">Página não encontrada</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A página que você está procurando não existe ou foi removida.
            Verifique o endereço ou retorne ao painel.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.history.back()}>
            Voltar
          </Button>
          <Button asChild>
            <Link href="/dashboard">Ir para o painel</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          DJUD Painel — Sistema de Demandas Judiciais em Saúde
        </p>
      </div>
    </div>
  );
}
