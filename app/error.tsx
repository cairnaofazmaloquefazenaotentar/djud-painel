"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error for observability
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-md px-4">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Algo deu errado</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ocorreu um erro inesperado na aplicação. Por favor, tente novamente.
            Se o problema persistir, entre em contato com o suporte COAJUD/CONJUR.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/60 font-mono">
              Código de diagnóstico: {error.digest}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          DJUD Painel — Sistema de Demandas Judiciais em Saúde
        </p>
      </div>
    </div>
  );
}
