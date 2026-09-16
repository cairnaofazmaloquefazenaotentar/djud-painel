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
  FileText,
  TrendingUp,
  Building2,
  Users,
  BarChart3,
  CheckCircle2,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { appPath } from "@/lib/url";

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

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 + i * 0.08, type: "spring" as const, stiffness: 300, damping: 25 },
  }),
};

// ── Dados dos cards do grid ────────────────────────────────────────────────

const gridCards = [
  {
    id: 1,
    type: "image",
    icon: FileText,
    title: "Demandas Judiciais",
    description: "Gestão centralizada de processos",
    bgClass: "bg-blue-600",
    order: "order-1",
  },
  {
    id: 2,
    type: "stat",
    value: "51.501",
    label: "Demandas Registradas",
    bgClass: "bg-amber-500",
    order: "order-2",
  },
  {
    id: 3,
    type: "image",
    icon: Building2,
    title: "28 Regiões TRF",
    description: "Cobertura nacional",
    bgClass: "bg-emerald-600",
    order: "order-3",
  },
  {
    id: 4,
    type: "stat",
    value: "98%",
    label: "Taxa de Integração Redmine",
    bgClass: "bg-red-600",
    order: "order-4",
  },
  {
    id: 5,
    type: "image",
    icon: Users,
    title: "Análise Especializada",
    description: "Equipes multidisciplinares",
    bgClass: "bg-indigo-600",
    order: "order-5",
  },
  {
    id: 6,
    type: "stat",
    value: "RBAC",
    label: "Controle de Acesso Seguro",
    bgClass: "bg-teal-600",
    order: "order-6",
  },
];

// ── Confetti Component (Easter Egg) ────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  y: number;
  delay: number;
}

function Confetti() {
  const particles: Particle[] = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 0.3,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: `${p.x}vw`, y: `-10vh`, opacity: 1 }}
          animate={{ y: `110vh`, opacity: 0 }}
          transition={{ duration: 2.5, delay: p.delay, ease: "easeIn" }}
          className="absolute w-2 h-2 rounded-full"
          style={{
            backgroundColor: [
              "hsl(var(--primary))",
              "hsl(var(--primary) / 0.8)",
              "#f59e0b",
              "#10b981",
            ][p.id % 4],
          }}
        />
      ))}
    </div>
  );
}

// ── MagneticCard Hook ─────────────────────────────────────────────────────

function useMagneticCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const rotateX = (e.clientY - centerY) / 10;
    const rotateY = (centerX - e.clientX) / 10;

    setRotation({ x: rotateX, y: rotateY });
    setScale(1.02);
  };

  const handleMouseLeave = () => {
    setRotation({ x: 0, y: 0 });
    setScale(1);
  };

  return {
    ref: cardRef,
    rotation,
    scale,
    handlers: { onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave },
  };
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || appPath("/dashboard");

  const [isLoading, setIsLoading]         = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [showPassword, setShowPassword]   = useState(false);
  const [error, setError]                 = useState(searchParams.get("error") || "");
  const [showConfetti, setShowConfetti]   = useState(false);

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

      if (!result?.ok || result.error) {
        setError("Email ou senha inválidos.");
        setIsLoading(false);
      } else {
        // Easter egg: show confetti before redirect
        setShowConfetti(true);
        setTimeout(() => {
          window.location.href = callbackUrl;
        }, 1500);
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
      {/* ── Confetti Easter Egg ──────────────────────────────────────────────── */}
      <AnimatePresence>{showConfetti && <Confetti />}</AnimatePresence>

      {/* ── Painel esquerdo — grid institucional 2×3 ──────────────────────────── */}
      <motion.div
        className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative flex-col overflow-hidden p-8 xl:p-12"
        variants={leftPanelVariants}
        initial="hidden"
        animate="visible"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, color-mix(in oklch, var(--primary) 85%, black) 100%)",
        }}
      >
        {/* Grade decorativa */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklch, white 5%, transparent) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Blobs de profundidade */}
        <motion.div
          aria-hidden="true"
          className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, white 8%, transparent) 0%, transparent 65%)",
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
              "radial-gradient(circle, color-mix(in oklch, white 4%, transparent) 0%, transparent 65%)",
            filter: "blur(60px)",
          }}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        {/* Conteúdo do painel */}
        <div className="relative z-10 flex flex-col h-full gap-8">

          {/* Cabeçalho — logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 group hover:bg-white/30 transition-colors">
              <Scale className="h-5 w-5 text-white group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">DJUD Painel</p>
              <p className="text-[10px] text-white/70 leading-tight">Ministério da Saúde</p>
            </div>
          </div>

          {/* Grid 2×3 de cards com magnetic effect */}
          <div className="flex-1 grid grid-cols-2 gap-4 auto-rows-fr perspective">
            {gridCards.map((card, i) => {
              // eslint-disable-next-line react-hooks/rules-of-hooks
              const { ref, rotation, scale, handlers } = useMagneticCard();

              return (
                <motion.div
                  key={card.id}
                  ref={ref}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className={`relative rounded-2xl overflow-hidden backdrop-blur-sm border border-white/20 transition-all hover:border-white/40 hover:shadow-2xl cursor-pointer ${card.bgClass}`}
                  style={{
                    transform: `perspective(1200px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale(${scale})`,
                    transformStyle: "preserve-3d",
                  }}
                  {...handlers}
                >
                  {/* Fundo com overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/20" />

                  {/* Shine effect on hover */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"
                    animate={{ x: [-100, 100] }}
                    transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3 }}
                  />

                  {/* Conteúdo */}
                  <div className="relative z-10 h-full flex flex-col justify-between p-4 xl:p-5">
                    {card.type === "image" && "icon" in card ? (
                      <>
                        {card.icon && <card.icon className="h-6 w-6 text-white/90 group-hover:scale-110 transition-transform" />}
                        <div>
                          <p className="text-sm xl:text-base font-bold text-white leading-tight">
                            {card.title}
                          </p>
                          <p className="text-xs text-white/70 mt-1 leading-tight">
                            {card.description}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <motion.p
                          className="text-2xl xl:text-3xl font-bold text-white leading-none"
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          {card.value}
                        </motion.p>
                        <p className="text-xs xl:text-sm text-white/80 text-center leading-tight">
                          {card.label}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Indicador de ativo */}
                  <motion.div
                    className="absolute top-2 right-2 h-2 w-2 rounded-full bg-white/60"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </motion.div>
              );
            })}
          </div>

          {/* Rodapé do painel */}
          <p className="text-xs text-white/50 mt-auto">
            © {new Date().getFullYear()} · Departamento de Judicialização · DJUD
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
              className="flex h-10 w-10 items-center justify-center rounded-xl group hover:scale-110 transition-transform"
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
                role="alert"
                aria-live="polite"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulário de credenciais */}
          <motion.form
            onSubmit={handleCredentialsLogin}
            className="space-y-5"
            variants={itemVariants}
            noValidate
          >
            {/* Email com focus glow */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email institucional
              </Label>
              <div className="relative group">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={error === "CredentialsSignin" ? "true" : "false"}
                  placeholder="voce@saude.gov.br"
                  autoComplete="email"
                  className="h-11 focus:ring-2 focus:ring-primary/50 transition-all relative z-10"
                />
                {/* Glow effect on focus */}
                <motion.div
                  className="absolute inset-0 rounded-md bg-primary/10 blur-lg -z-10"
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileFocus={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
              </div>
            </div>

            {/* Senha com toggle e focus glow */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Senha
              </Label>
              <div className="relative group">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={error === "CredentialsSignin" ? "true" : "false"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-11 pr-11 focus:ring-2 focus:ring-primary/50 transition-all relative z-10"
                />
                {/* Glow effect on focus */}
                <motion.div
                  className="absolute inset-0 rounded-md bg-primary/10 blur-lg -z-10"
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileFocus={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm hover:scale-110 transition-transform"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {showPassword ? (
                      <motion.span
                        key="hide"
                        initial={{ opacity: 0, scale: 0.7, rotate: -90 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.7, rotate: 90 }}
                        transition={{ duration: 0.2 }}
                        aria-hidden="true"
                      >
                        <EyeOff className="h-4 w-4" />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="show"
                        initial={{ opacity: 0, scale: 0.7, rotate: 90 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.7, rotate: -90 }}
                        transition={{ duration: 0.2 }}
                        aria-hidden="true"
                      >
                        <Eye className="h-4 w-4" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            </div>

            {/* Botão entrar com ripple effect */}
            <Button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full h-11 relative overflow-hidden group"
              aria-busy={isLoading}
            >
              {/* Shimmer sweep */}
              <span
                aria-hidden="true"
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, color-mix(in oklch, var(--primary-foreground) 15%, transparent), transparent)",
                }}
              />
              {/* Ripple effect */}
              <motion.span
                className="absolute inset-0 bg-white/20"
                initial={{ scale: 0, opacity: 1 }}
                whileTap={{ scale: 4, opacity: 0 }}
                transition={{ duration: 0.6 }}
              />
              <span className="relative flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Entrando...</span>
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

          {/* Botão Google com ripple */}
          <motion.div variants={itemVariants}>
            <Button
              onClick={handleGoogleLogin}
              disabled={isLoadingGoogle}
              variant="outline"
              className="w-full h-11 relative overflow-hidden group"
              aria-busy={isLoadingGoogle}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out bg-muted/40"
              />
              {/* Ripple effect */}
              <motion.span
                className="absolute inset-0 bg-primary/10"
                initial={{ scale: 0, opacity: 1 }}
                whileTap={{ scale: 4, opacity: 0 }}
                transition={{ duration: 0.6 }}
              />
              <span className="relative flex items-center gap-2.5">
                {isLoadingGoogle ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                    <span>Entrar com Google</span>
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
            Ministério da Saúde · Sistema DJUD · v0.3.0
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  );
}
