/**
 * Utilitários compartilhados para todos os gráficos do dashboard.
 * Usa CSS variables do tema para suporte correto a dark mode.
 */

// Estilo padrão do tooltip — usa variáveis CSS do tema
export const tooltipStyle: React.CSSProperties = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

// Cor do cursor/hover nas barras
export const cursorFill = "hsl(var(--muted))";

// Cor da grid
export const gridStroke = "hsl(var(--border))";

// Paleta primária sequencial (azul → mais claro)
export const PALETTE_PRIMARY = [
  "hsl(var(--primary))",
  "hsl(217, 80%, 55%)",
  "hsl(217, 70%, 62%)",
  "hsl(217, 60%, 68%)",
  "hsl(217, 50%, 74%)",
  "hsl(217, 40%, 80%)",
];

// Paleta categórica (10 cores distintas)
export const PALETTE_CATEGORICAL = [
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#ec4899", // pink-500
  "#6366f1", // indigo-500
];

// Mapa de status → cor semântica
export const STATUS_COLORS: Record<string, string> = {
  "Concluída":             "#10b981",
  "Aberta":                "#3b82f6",
  "Em Análise":            "#f59e0b",
  "Em Análise COAJUD":     "#f59e0b",
  "Em Análise CONJUR":     "#f59e0b",
  "Em Análise DECIIS":     "#f59e0b",
  "Em Análise SCTIE":      "#f59e0b",
  "Em Análise SECTICS":    "#f59e0b",
  "Entrega Pendente":      "#f97316",
  "Cessar Atos":           "#f97316",
  "Suspensa":              "#f97316",
  "Cancelada":             "#ef4444",
  "Encerrada":             "#ef4444",
  "Fechada":               "#ef4444",
  "Em Recurso":            "#8b5cf6",
  "Aguardando Informações":"#6366f1",
  "Sem status":            "#94a3b8",
};

// Mapa de prioridade → cor semântica
export const PRIORIDADE_COLORS: Record<string, string> = {
  Baixa:   "#10b981",
  Média:   "#f59e0b",
  Alta:    "#f97316",
  Crítica: "#ef4444",
  Normal:  "#94a3b8",
};

// Mapa de região → cor
export const REGIAO_COLORS: Record<string, string> = {
  Norte:        "#06b6d4",
  Nordeste:     "#f59e0b",
  "Centro-Oeste": "#10b981",
  Sudeste:      "#ef4444",
  Sul:          "#8b5cf6",
};
