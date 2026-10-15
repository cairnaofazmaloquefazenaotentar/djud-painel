// ─────────────────────────────────────────────────────────────────────────────
// Links externos da demanda (P7): por padrão só há o botão de copiar. O link
// aparece apenas quando a URL-base está configurada no ambiente — o painel não
// inventa endereço do SEI, da consulta processual nem do Redmine.
//
//   NEXT_PUBLIC_URL_SEI       ex.: https://sei.exemplo.gov.br/…?nup={valor}
//   NEXT_PUBLIC_URL_PROCESSO  ex.: https://consulta.exemplo.jus.br/…?numero={valor}
//   NEXT_PUBLIC_URL_REDMINE   ex.: https://redmine.exemplo.gov.br/issues/{valor}
//
// "{valor}" é trocado pelo número (codificado). Só https:// é aceito. Módulo
// puro; as variáveis NEXT_PUBLIC_* entram no bundle no build.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoLink = "sei" | "processo" | "redmine";

const MODELOS: Record<TipoLink, string | undefined> = {
  sei: process.env.NEXT_PUBLIC_URL_SEI,
  processo: process.env.NEXT_PUBLIC_URL_PROCESSO,
  redmine: process.env.NEXT_PUBLIC_URL_REDMINE,
};

export function linkExterno(tipo: TipoLink, valor: string | null | undefined): string | null {
  const modelo = MODELOS[tipo]?.trim();
  const v = String(valor ?? "").trim();
  if (!modelo || !v || !/^https:\/\//i.test(modelo) || !modelo.includes("{valor}")) return null;
  return modelo.replace("{valor}", encodeURIComponent(v));
}
