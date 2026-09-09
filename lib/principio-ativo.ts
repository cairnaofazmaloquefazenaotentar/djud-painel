/**
 * Normalização do princípio ativo (campo `Demanda.principioAtivo`).
 *
 * Os dados vêm do Redmine sujos: alguns valores chegam como array JSON
 * (ex.: `["Canabidiol"]` ou `["Fulvestranto","Ribociclibe"]`), outros como
 * texto puro. Esta função desempacota o array e devolve os princípios ativos
 * separados por " | ", ou `null` quando o valor é lixo (N/A, placeholder
 * "==> Outro...", vazio).
 *
 * Usada tanto pela listagem de demandas (coluna "Título / Princípio Ativo")
 * quanto pelo filtro de princípios ativos (/api/demandas/principios-ativos),
 * para que as duas telas mostrem exatamente a mesma forma do nome.
 */
export function normalizarPrincipioAtivo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();

  // Desempacota formas tipo ["Canabidiol"] ou ["A","B"] -> "A | B"
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        s = parsed.map((x) => String(x).trim()).join(" | ");
      }
    } catch {
      // fallback: remove colchetes/aspas manualmente
      s = s.replace(/^\[|\]$/g, "").replace(/^"|"$/g, "").trim();
    }
  }

  s = s.trim();
  const upper = s.toUpperCase();

  // Descarta lixo conhecido
  if (s === "") return null;
  if (upper === "N/A" || upper === "NA") return null;
  if (s.startsWith("==>")) return null;

  return s;
}
