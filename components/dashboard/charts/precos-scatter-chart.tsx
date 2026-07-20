"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import type { PrecoPonto } from "@/lib/precos-metrics";

// ─────────────────────────────────────────────────────────────────────────────
// Dispersão de preços praticados: cada ponto é UMA compra (x = data,
// y = preço unitário). Cor = categoria (esfera OU modalidade); formato do
// marcador = Judicial/Não Judicial. Clicar em um ponto o oculta (outlier).
// Reproduz o comportamento do dashboard ComprasGov original, em Recharts.
// ─────────────────────────────────────────────────────────────────────────────

/** Paleta das categorias (mesma ordem/cores do dashboard de origem). */
export const PRECOS_PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#ea580c",
  "#65a30d",
  "#c026d3",
] as const;

/** Formato do marcador por valor de "Judicial" (e o glifo da legenda). */
const JUDICIAL_SHAPES: Record<string, "circle" | "square" | "diamond"> = {
  Judicial: "circle",
  "Não Judicial": "square",
};
export const JUDICIAL_GLYPHS: Record<string, string> = {
  Judicial: "●",
  "Não Judicial": "■",
};
const shapeFor = (j: string) => JUDICIAL_SHAPES[j] ?? "diamond";
export const glyphFor = (j: string) => JUDICIAL_GLYPHS[j] ?? "◆";

/** R$ com até 4 casas — preços unitários pequenos (ex: R$ 0,0329) precisam delas. */
export function fmtPreco(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/** R$ compacto para o eixo Y (mil/mi quando grande, decimais quando pequeno). */
function fmtPrecoEixo(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  if (abs >= 100) return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
}

function fmtDataCurta(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

export function fmtDataISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface PontoChart extends PrecoPonto {
  ts: number; // timestamp UTC da data (eixo X numérico)
  cat: string; // categoria da cor (esfera ou modalidade, conforme o agrupamento)
  cor: string;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PontoChart }>;
}) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background/95 border border-primary/40 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm"
    >
      <p className="text-sm font-bold" style={{ color: p.cor }}>
        {p.cat} <span className="text-muted-foreground font-normal">· {glyphFor(p.j)} {p.j}</span>
      </p>
      <p className="text-sm font-semibold text-foreground">{fmtPreco(p.p)}</p>
      <p className="text-xs text-muted-foreground">Data: {fmtDataISO(p.d)}</p>
      <p className="text-xs text-muted-foreground">Qtde: {p.q.toLocaleString("pt-BR")}</p>
      <p className="text-xs text-muted-foreground">Total: {fmtPreco(p.v)}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-1">Clique para ocultar este ponto</p>
    </motion.div>
  );
};

// ── Componente ───────────────────────────────────────────────────────────────

interface PrecosScatterChartProps {
  /** Pontos VISÍVEIS (outliers ocultados já filtrados pelo componente pai). */
  pontos: PrecoPonto[];
  /** Campo que dá a COR: "e" (esfera) ou "c" (modalidade de compra). */
  groupKey: "e" | "c";
  /** Categorias em ordem alfabética — define o mapeamento estável de cores. */
  categorias: string[];
  onPointClick: (id: number) => void;
}

const DIA_MS = 24 * 3600 * 1000;

export function PrecosScatterChart({
  pontos,
  groupKey,
  categorias,
  onPointClick,
}: PrecosScatterChartProps) {
  // Limites dos eixos a partir dos pontos visíveis (mesma regra do original:
  // trocar o agrupamento não mexe nos eixos; ocultar pontos, sim).
  const { xDomain, yDomain, series } = useMemo(() => {
    const tempos = pontos.map((p) => new Date(p.d + "T00:00:00Z").getTime());
    const minT = Math.min(...tempos);
    const maxT = Math.max(...tempos);
    const padT = Math.max((maxT - minT) * 0.04, 3 * DIA_MS);

    const precos = pontos.map((p) => p.p);
    const minP = Math.min(...precos);
    const maxP = Math.max(...precos);
    const padP = (maxP - minP) * 0.08 || Math.max(maxP * 0.1, 0.01);

    // Uma série Recharts por (categoria × judicial): a cor vem da categoria e
    // o formato do marcador, do valor de Judicial — como no dashboard original.
    const corDe = new Map(categorias.map((c, i) => [c, PRECOS_PALETTE[i % PRECOS_PALETTE.length]]));
    const grupos = new Map<string, { cat: string; j: string; data: PontoChart[] }>();
    for (let i = 0; i < pontos.length; i++) {
      const p = pontos[i];
      const cat = p[groupKey];
      const k = `${cat}\u0000${p.j}`;
      let g = grupos.get(k);
      if (!g) {
        g = { cat, j: p.j, data: [] };
        grupos.set(k, g);
      }
      g.data.push({ ...p, ts: tempos[i], cat, cor: corDe.get(cat) ?? PRECOS_PALETTE[0] });
    }

    const series = Array.from(grupos.values()).sort((a, b) =>
      a.cat === b.cat ? a.j.localeCompare(b.j, "pt-BR") : a.cat.localeCompare(b.cat, "pt-BR")
    );

    return {
      xDomain: [minT - padT, maxT + padT] as [number, number],
      yDomain: [Math.max(0, minP - padP), maxP + padP] as [number, number],
      series,
    };
  }, [pontos, groupKey, categorias]);

  if (!pontos.length) return null;

  const corDe = (cat: string) => {
    const i = categorias.indexOf(cat);
    return PRECOS_PALETTE[(i >= 0 ? i : 0) % PRECOS_PALETTE.length];
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ type: "spring" as const, stiffness: 300, damping: 30 }}
    >
      <ResponsiveContainer width="100%" height={440}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            type="number"
            dataKey="ts"
            domain={xDomain}
            tickFormatter={fmtDataCurta}
            tick={{ fontSize: 11 }}
            tickCount={8}
            name="Data da compra"
          />
          <YAxis
            type="number"
            dataKey="p"
            domain={yDomain}
            tickFormatter={fmtPrecoEixo}
            tick={{ fontSize: 11 }}
            width={78}
            name="Preço unitário (R$)"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          {series.map((s) => (
            <Scatter
              key={`${s.cat}|||${s.j}`}
              name={s.cat}
              data={s.data}
              fill={corDe(s.cat)}
              shape={shapeFor(s.j)}
              isAnimationActive={false}
              onClick={(pt: { payload?: PontoChart }) => {
                const id = pt?.payload?.id;
                if (typeof id === "number") onPointClick(id);
              }}
              className="cursor-pointer"
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
