"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Scale,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  FileText,
  Users,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Variantes de animação ────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 380, damping: 28 },
  },
};

const leftPanelVariants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 30, delay: 0.05 },
  },
};

const rightPanelVariants = {
  hidden: { opacity: 0, x: 30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 30, delay: 0.1 },
  },
};

// ── Dados dos cards de estatística ──────────────────────────────────────────

const stats = [
  {
    icon: FileText,
    value: "51.501",
    label: "Demandas Judiciais",
  },
  {
    icon: Users,
    value: "28",
    label: "Regiões TRF",
  },
  {
    icon: TrendingUp,
    value: "100%",
    label: "Dados Redmine",
  },
  {
    icon: ShieldCheck,
    value: "RBAC",
    label: "Controle de Acesso",
  },
];

// ── Componente principal ─────────────────────────────────────────────────────

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [isLoading, setIsLoading]         = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [showPassword, setShowPassword]   = useState(false);
  const [error, setError]                 = useState(searchParams.get("error") || "");

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
    <div className="min-h-screen bg-background flex overflow-hidden">

      {/* ── Painel esquerdo — visual institucional ─────────────────────────── */}
      <motion.div
        className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative flex-col overflow-hidden"
        variants={leftPanelVariants}
        initial="hidden"
        animate="visible"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, color-mix(in oklch, var(--primary) 80%, black) 100%)",
        }}
      >
        {/* Grade decorativa */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklch, white 8%, transparent) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Blobs de profundidade */}
        <motion.div
          aria-hidden="true"
          className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, white 10%, transparent) 0%, transparent 65%)",
            filter: "blur(70px)",
          }}
          animate={{ scale: [1, 1.06, 1], rotate: [0, 5, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute bottom-0 -left-20 h-[400px] w-[400px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, white 6%, transparent) 0%, transparent 65%)",
            filter: "blur(60px)",
          }}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        {/* Conteúdo do painel */}
        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">

          {/* Cabeçalho — logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm border border-white/30">
              <Scale className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">DJUD Painel</p>
              <p className="text-[10px] text-white/60 leading-tight">Ministério da Saúde</p>
            </div>
          </div>

          {/* Título central */}
          <div className="flex-1 flex flex-col justify-center gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight tracking-tight">
                Gestão de Demandas
                <br />
                <span className="text-white/80">Judiciais em Saúde</span>
              </h2>
              <p className="mt-4 text-sm xl:text-base text-white/70 max-w-sm leading-relaxed">
                Plataforma centralizada para acompanhamento, análise e gestão de processos judiciais
                relacionados à saúde pública.
              </p>
            </motion.div>

            {/* Grid de estatísticas */}
            <motion.div
              className="grid grid-cols-2 gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, staggerChildren: 0.1 }}
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1, type: "spring", stiffness: 300, damping: 25 }}
                  className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 flex flex-col gap-2"
                >
                  <stat.icon className="h-4 w-4 text-white/70" />
                  <p className="text-xl font-bold text-white leading-none">{stat.value}</p>
                  <p className="text-xs text-white/60 leading-tight">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Rodapé do painel */}
          <p className="text-xs text-white/40 mt-6">
            © {new Date().getFullYear()} · Departamento de Judicialização · DJUD / COAJUD
          </p>
        </div>
      </motion.div>

      {/* ── Painel direito — formulário ────────────────────────────────────── */}
      <motion.div
        className="flex-1 flex items-center justify-center relative px-6 py-12 overflow-hidden"
        variants={rightPanelVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Blobs de fundo sutis */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute -top-32 -right-32 h-[400px] w-[400px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--primary) 8%, transparent) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
            animate={{ x: [0, 20, 0], y: [0, 15, 0] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--primary) 5%, transparent) 0%, transparent 70%)",
              filter: "blur(50px)",
            }}
            animate={{ x: [0, -15, 0], y: [0, -20, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          />
        </div>

        {/* Formulário */}
        <motion.div
          className="relative z-10 w-full max-w-md space-y-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Cabeçalho móvel (só em telas pequenas) */}
          <motion.div className="lg:hidden flex items-center gap-3" variants={itemVariants}>
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "hsl(var(--primary))" }}
            >
              <Scale className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">DJUD Painel</p>
              <p className="text-xs text-muted-foreground">Ministério da Saúde</p>
            </div>
          </motion.div>

          {/* Título do form */}
          <motion.div className="space-y-1" variants={itemVariants}>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Bem-vindo de volta
            </h1>
            <p className="text-sm text-muted-foreground">
              Acesse com suas credenciais institucionais
            </p>
          </motion.div>

          {/* Mensagem de erro */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="flex items-center gap-2.5 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3.5 py-3"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulário de credenciais */}
          <motion.form
            onSubmit={handleCredentialsLogin}
            className="space-y-5"
            variants={itemVariants}
          >
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email institucional
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="voce@saude.gov.br"
                autoComplete="email"
                className="h-11"
              />
            </div>

            {/* Senha com toggle show/hide */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {showPassword ? (
                      <motion.span
                        key="hide"
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={{ duration: 0.15 }}
                      >
                        <EyeOff className="h-4 w-4" />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="show"
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Eye className="h-4 w-4" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            </div>

            {/* Botão entrar */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 relative overflow-hidden group"
            >
              {/* Shimmer sweep */}
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, color-mix(in oklch, var(--primary-foreground) 15%, transparent), transparent)",
                }}
              />
              <span className="relative flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </span>
            </Button>
          </motion.form>

          {/* Divider */}
          <motion.div className="flex items-center gap-3" variants={itemVariants}>
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground px-1">ou continue com</span>
            <Separator className="flex-1" />
          </motion.div>

          {/* Botão Google */}
          <motion.div variants={itemVariants}>
            <Button
              onClick={handleGoogleLogin}
              disabled={isLoadingGoogle}
              variant="outline"
              className="w-full h-11 relative overflow-hidden group"
            >
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out bg-muted/40"
              />
              <span className="relative flex items-center gap-2.5">
                {isLoadingGoogle ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Entrar com Google
                  </>
                )}
              </span>
            </Button>
          </motion.div>

          {/* Rodapé */}
          <motion.p
            className="text-center text-xs text-muted-foreground pt-2"
            variants={itemVariants}
          >
            Ministério da Saúde · Sistema DJUD · v0.1.0
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  );
}
