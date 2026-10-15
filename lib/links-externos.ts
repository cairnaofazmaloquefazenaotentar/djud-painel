// ─────────────────────────────────────────────────────────────────────────────
// Links externos da demanda (P7): ao lado do botão de copiar, o link aparece
// quando há o modelo de URL — o painel não inventa endereço.
//
//   SEI       padrão do Ministério da Saúde, informado pelo usuário (out/2026):
//             https://sei.saude.gov.br/sei/#{valor}  (NEXT_PUBLIC_URL_SEI troca)
//   NEXT_PUBLIC_URL_PROCESSO  ex.: https://consulta.exemplo.jus.br/…?numero={valor}
//   NEXT_PUBLIC_URL_REDMINE   ex.: https://redmine.exemplo.gov.br/issues/{valor}
//
// "{valor}" é trocado pelo número, codificado — menos a barra do NUP
// ("25000.155049/2026-77"), que o SEI lê como está depois do "#". Só https://
// é aceito. Módulo puro; as variáveis NEXT_PUBLIC_* entram no bundle no build.
// ─────────────────────────────────────────────────────────────────────────────

const SEI_MINISTERIO_SAUDE = "https://sei.saude.gov.br/sei/#{valor}";

export type TipoLink = "sei" | "processo" | "redmine";

const MODELOS: Record<TipoLink, string | undefined> = {
  sei: process.env.NEXT_PUBLIC_URL_SEI || SEI_MINISTERIO_SAUDE,
  processo: process.env.NEXT_PUBLIC_URL_PROCESSO,
  redmine: process.env.NEXT_PUBLIC_URL_REDMINE,
};

export function linkExterno(tipo: TipoLink, valor: string | null | undefined): string | null {
  const modelo = MODELOS[tipo]?.trim();
  const v = String(valor ?? "").trim();
  if (!modelo || !v || !/^https:\/\//i.test(modelo) || !modelo.includes("{valor}")) return null;
  return modelo.replace("{valor}", encodeURIComponent(v).replace(/%2F/gi, "/"));
}
