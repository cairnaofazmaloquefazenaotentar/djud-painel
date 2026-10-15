// ─────────────────────────────────────────────────────────────────────────────
// Nº de controle do PNCP → página pública (obs. 8 da DLOG; D4). Módulo puro.
//
// Formatos (Manual de Integração do PNCP):
//   contratação  CNPJ-1-SEQUENCIAL/ANO          00394429000100-1-000617/2026
//   ata          CNPJ-1-SEQUENCIAL/ANO-SEQATA   00394429000100-1-000617/2026-000014
//   contrato     CNPJ-2-SEQUENCIAL/ANO
// O CNPJ pode ser alfanumérico ([0-9A-Z]{12} + 2 dígitos).
//
// As rotas são as que a própria API de dados abertos devolve em linkCompraPNCP
// e linkAtaPNCP (conferido em 15/10/2026); a API do PNCP aceita o sequencial
// com ou sem zeros. O site é uma SPA: abrir alguns links reais antes de
// confiar num formato novo.
// ─────────────────────────────────────────────────────────────────────────────

export interface ControlePncp {
  cnpj: string;
  /** "1" = compra/contratação (e suas atas); "2" = contrato. */
  tipo: string;
  sequencial: number;
  ano: number;
  sequencialAta: number | null;
}

const RE_CONTROLE = /^([0-9A-Z]{12}\d{2})-(\d)-(\d{1,6})\/(\d{4})(?:-(\d{1,6}))?$/;

export function parseControlePncp(valor: string | null | undefined): ControlePncp | null {
  const m = RE_CONTROLE.exec(String(valor ?? "").trim().toUpperCase());
  if (!m) return null;
  return {
    cnpj: m[1],
    tipo: m[2],
    sequencial: Number(m[3]),
    ano: Number(m[4]),
    sequencialAta: m[5] ? Number(m[5]) : null,
  };
}

/** Página pública do PNCP; null quando o nº de controle não está num formato conhecido. */
export function urlPncp(numeroControle: string | null | undefined): string | null {
  const c = parseControlePncp(numeroControle);
  if (!c) return null;
  if (c.tipo === "2") return `https://pncp.gov.br/app/contratos/${c.cnpj}/${c.ano}/${c.sequencial}`;
  if (c.sequencialAta !== null) {
    return `https://pncp.gov.br/app/atas/${c.cnpj}/${c.ano}/${c.sequencial}/${c.sequencialAta}`;
  }
  return `https://pncp.gov.br/app/editais/${c.cnpj}/${c.ano}/${c.sequencial}`;
}
