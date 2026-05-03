"use client";

import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useInView, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

// ── Spell: Contador que cresce de 0 → valor ao entrar na viewport ─────────────

function AnimatedCounter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1], // expo-out: arranca rápido, para suave
      onUpdate(latest) {
        setDisplay(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [isInView, value]);

  return <span ref={ref}>{display.toLocaleString("pt-BR")}</span>;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  description?: string;
  trend?: number;
  icon?: React.ReactNode;
  className?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  subtext,
  description,
  trend,
  icon,
  className,
}: MetricCardProps) {
  const subtitle = subtext ?? description;
  const isTrendPositive = trend !== undefined && trend > 0;
  const isNumeric = typeof value === "number";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ type: "spring" as const, stiffness: 300, damping: 28 }}
      whileHover={{
        y: -3,
        boxShadow:
          "0 12px 28px -6px color-mix(in oklch, var(--primary) 14%, transparent)",
      }}
      className={cn(
        "rounded-xl border border-border bg-card p-6 cursor-default",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="text-sm font-medium text-muted-foreground leading-none">
            {label}
          </p>

          {/* Número — animado se for numérico */}
          <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
            {isNumeric ? (
              <AnimatedCounter value={value as number} />
            ) : (
              value
            )}
          </p>

          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* ── Spell: ícone com hover glow ─────────────────────────────────── */}
        {icon && (
          <motion.div
            className="rounded-xl p-3 shrink-0"
            style={{
              background: "color-mix(in oklch, var(--primary) 10%, transparent)",
              color: "var(--primary)",
            }}
            whileHover={{
              scale: 1.1,
              background: "color-mix(in oklch, var(--primary) 18%, transparent)",
            }}
            transition={{ type: "spring" as const, stiffness: 400, damping: 20 }}
          >
            {icon}
          </motion.div>
        )}
      </div>

      {/* Trend */}
      {trend !== undefined && (
        <motion.div
          className="mt-4 flex items-center gap-1.5"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.7 }}
        >
          <span
            className={cn(
              "flex items-center gap-0.5 text-sm font-semibold",
              isTrendPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive"
            )}
          >
            {isTrendPositive ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )}
            {Math.abs(trend).toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">vs. período anterior</span>
        </motion.div>
      )}
    </motion.div>
  );
}
