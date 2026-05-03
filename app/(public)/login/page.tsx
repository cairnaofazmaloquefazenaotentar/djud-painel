"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Scale, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

// ── Variantes de animação ────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 28 },
  },
};

const logoVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 20 },
  },
};

// ── Componente ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(searchParams.get("error") || "");

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: false,
      });

      if (!result?.ok) {
        setError("Email ou senha inválidos.");
        setIsLoading(false);
      } else {
        window.location.href = callbackUrl;
      }
    } catch {
      setError("Erro ao fazer login. Tente novamente.");
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoadingGoogle(true);
    await signIn("google", { callbackUrl, redirect: true });
  };

  const errorMessage =
    error === "OAuthSignin"
      ? "Erro ao conectar com Google. Tente novamente."
      : error === "OAuthCallback"
        ? "Domínio de email não autorizado."
        : error === "CredentialsSignin"
          ? "Email ou senha inválidos."
          : error;

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center px-4 overflow-hidden">

      {/* ── Spell: blobs de fundo que flutuam lentamente ─────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {/* Blob 1 — upper-left, primary */}
        <motion.div
          className="absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--primary) 18%, transparent) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
          animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Blob 2 — lower-right, accent */}
        <motion.div
          className="absolute -bottom-24 -right-24 h-[400px] w-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--primary) 10%, transparent) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
          animate={{ x: [0, -20, 0], y: [0, -30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        {/* Blob 3 — center-right, subtle */}
        <motion.div
          className="absolute top-1/3 right-1/4 h-[260px] w-[260px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--ring) 8%, transparent) 0%, transparent 70%)",
            filter: "blur(50px)",
          }}
          animate={{ x: [0, 15, 0], y: [0, -15, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
      </div>

      {/* ── Conteúdo principal ────────────────────────────────────────────── */}
      <motion.div
        className="relative z-10 w-full max-w-sm space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >

        {/* ── Spell: Logo com breathe animation ──────────────────────────── */}
        <motion.div className="text-center space-y-3" variants={itemVariants}>
          <div className="flex items-center justify-center">
            <motion.div
              className="relative h-14 w-14 rounded-2xl bg-primary flex items-center justify-center"
              style={{
                boxShadow:
                  "0 0 0 0 color-mix(in oklch, var(--primary) 40%, transparent)",
              }}
              variants={logoVariants}
              animate={{
                boxShadow: [
                  "0 0 0 0px color-mix(in oklch, var(--primary) 30%, transparent)",
                  "0 0 0 10px color-mix(in oklch, var(--primary) 0%, transparent)",
                  "0 0 0 0px color-mix(in oklch, var(--primary) 0%, transparent)",
                ],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: 0.8 }}
            >
              <Scale className="h-7 w-7 text-primary-foreground" />
            </motion.div>
          </div>
          <div>
            <motion.h1
              className="text-2xl font-bold tracking-tight text-foreground"
              variants={itemVariants}
            >
              DJUD Painel
            </motion.h1>
            <motion.p
              className="text-sm text-muted-foreground mt-1"
              variants={itemVariants}
            >
              Demandas Judiciais em Saúde
            </motion.p>
          </div>
        </motion.div>

        {/* ── Card com glass-border sutil ─────────────────────────────────── */}
        <motion.div variants={itemVariants}>
          <Card
            className="shadow-lg"
            style={{
              background:
                "color-mix(in oklch, var(--card) 96%, var(--primary) 4%)",
              borderColor:
                "color-mix(in oklch, var(--border) 80%, var(--primary) 20%)",
            }}
          >
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Acesso ao sistema</CardTitle>
              <CardDescription>
                Use suas credenciais institucionais para entrar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Error message */}
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2.5"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {errorMessage}
                </motion.div>
              )}

              {/* ── Spell: campos em stagger ─────────────────────────────── */}
              <form onSubmit={handleCredentialsLogin} className="space-y-4">
                <motion.div className="space-y-2" variants={itemVariants}>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="voce@saude.gov.br"
                    autoComplete="email"
                  />
                </motion.div>

                <motion.div className="space-y-2" variants={itemVariants}>
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </motion.div>

                {/* ── Spell: botão com shimmer no hover ─────────────────── */}
                <motion.div variants={itemVariants}>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full relative overflow-hidden group"
                  >
                    {/* shimmer sweep */}
                    <span
                      aria-hidden
                      className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, color-mix(in oklch, var(--primary-foreground) 15%, transparent), transparent)",
                      }}
                    />
                    <span className="relative">
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Entrando...
                        </span>
                      ) : (
                        "Entrar"
                      )}
                    </span>
                  </Button>
                </motion.div>
              </form>

              {/* Divider */}
              <motion.div
                className="flex items-center gap-3"
                variants={itemVariants}
              >
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">ou</span>
                <Separator className="flex-1" />
              </motion.div>

              {/* Google login */}
              <motion.div variants={itemVariants}>
                <Button
                  onClick={handleGoogleLogin}
                  disabled={isLoadingGoogle}
                  variant="outline"
                  className="w-full relative overflow-hidden group"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out bg-muted/40"
                  />
                  <span className="relative flex items-center gap-2">
                    {isLoadingGoogle ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Conectando...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Entrar com Google
                      </>
                    )}
                  </span>
                </Button>
              </motion.div>

            </CardContent>
          </Card>
        </motion.div>

        <motion.p
          className="text-center text-xs text-muted-foreground"
          variants={itemVariants}
        >
          Ministério da Saúde · Sistema DJUD · v0.1.0
        </motion.p>

      </motion.div>
    </div>
  );
}
