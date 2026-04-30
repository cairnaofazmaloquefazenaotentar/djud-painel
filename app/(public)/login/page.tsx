"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [isLoading, setIsLoading] = useState(false);
  const error = searchParams.get("error");

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    await signIn("google", {
      callbackUrl,
      redirect: true,
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo / Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">DJUD Painel</h1>
          <p className="text-sm text-muted-foreground">
            Painel de Saúde — Demandas Judiciais
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Ministério da Saúde
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-lg border border-border p-8 space-y-6">
          {/* Error message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-3 rounded">
              {error === "OAuthSignin"
                ? "Erro ao conectar com Google. Tente novamente."
                : error === "OAuthCallback"
                  ? "Domínio de email não autorizado."
                  : "Erro ao fazer login. Tente novamente."}
            </div>
          )}

          {/* Google Sign In Button */}
          <Button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <svg
                  className="mr-2 h-4 w-4"
                  aria-hidden="true"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M15.545 6.558a9.42 9.42 0 0 1 .139 1.626c0 2.449-.356 4.68-1.64 6.29a6.036 6.036 0 0 1-2.521 2.04c-.89.393-1.918.596-3.024.596-1.106 0-2.134-.203-3.024-.596a6.036 6.036 0 0 1-2.521-2.04c-1.284-1.61-1.64-3.841-1.64-6.29 0-.55.05-1.095.139-1.626A6.006 6.006 0 0 0 1 10.5c0 3.314.96 6.16 2.883 8.477A8.977 8.977 0 0 0 10 19.5a8.977 8.977 0 0 0 6.117-2.523c1.922-2.316 2.883-5.163 2.883-8.477 0-.55-.05-1.095-.139-1.626z" />
                </svg>
                Entrar com Google
              </>
            )}
          </Button>

          {/* Help text */}
          <div className="text-xs text-center text-muted-foreground space-y-2">
            <p>Use sua conta Google para acessar o painel.</p>
            {process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") && (
              <p className="text-xs text-muted-foreground/60">
                Modo desenvolvimento: qualquer conta Google é aceita
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground">
          <p>
            Protegido por{" "}
            <span className="font-semibold">Auth.js v5 + Google OAuth</span>
          </p>
          <p className="mt-2">v0.1.0 — Etapa 2</p>
        </div>
      </div>
    </div>
  );
}
