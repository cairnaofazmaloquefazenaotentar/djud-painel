import { parseJsonSeguro } from "@/lib/dados-abertos/mapear";

// ─────────────────────────────────────────────────────────────────────────────
// Cliente HTTP das APIs de dados abertos (Compras.gov.br e BPS).
//
// Regras herdadas do Extrator-CATMAT-DA e do diagnóstico de 15/10/2026
// (docs/api/compras-dadosabertos.md):
//   • 429 → devolve `aguardarMs` (do Retry-After) para a TELA esperar e repetir;
//     a função do servidor nunca dorme esperando a cota (P24);
//   • 404 não é "item sem preço": é a assinatura da API que mudou;
//   • 200 que não é JSON (página HTML de manutenção) é erro, não "0 registros";
//   • 5xx e timeout: até 2 novas tentativas, com espera curta;
//   • verificação de certificado TLS sempre ligada (o fetch do Node já faz).
// ─────────────────────────────────────────────────────────────────────────────

export const URL_COMPRAS = "https://dadosabertos.compras.gov.br";
export const URL_BPS = "https://apidadosabertos.saude.gov.br/economia-da-saude/bps";

const TIMEOUT_MS = 25_000;
const NOVAS_TENTATIVAS = 2;
// Cabeçalho HTTP só aceita Latin-1: nada de travessão nem acento aqui.
const USER_AGENT = "PainelDJUD/1.0 (Ministerio da Saude - pesquisa de precos IN 65/2021)";

export type RespostaApi<T> =
  | { tipo: "ok"; dados: T; status: number; ms: number }
  /** Cota excedida: espere `aguardarMs` e repita a MESMA chamada. */
  | { tipo: "aguardar"; aguardarMs: number }
  /** 400/404: a assinatura do endpoint mudou (P24). */
  | { tipo: "contrato_alterado"; status: number; detalhe: string }
  | { tipo: "erro"; status: number | null; detalhe: string };

type Parametros = Record<string, string | number | boolean | null | undefined>;

/** Base + caminho, sem barra no fim (o BPS dá 404 em ".../bps/"). */
export function montarUrl(base: string, caminho: string, params: Parametros): string {
  const url = new URL(caminho ? `${base.replace(/\/$/, "")}/${caminho.replace(/^\//, "")}` : base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Segundos do Retry-After (ou do texto "Try again in N seconds") + meio segundo de folga. */
export function aguardarDoRetryAfter(cabecalho: string | null, corpo: string, padraoSeg = 15): number {
  const n = Number(cabecalho);
  if (cabecalho && Number.isFinite(n) && n >= 0) return Math.ceil((n + 0.5) * 1000);
  const m = /(\d+)\s*second/i.exec(corpo);
  return Math.ceil(((m ? Number(m[1]) : padraoSeg) + 0.5) * 1000);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cota do Compras.gov.br (~100/min por cliente, somando todos os módulos —
 * medido em 15/10/2026). Contador por processo, como a `_CotaCompras` do
 * extrator: garante o limite no servidor interno (instância única). Na Vercel
 * há várias instâncias; lá quem segura o ritmo é a tela (uma coleta por vez,
 * 700 ms entre chamadas e obediência ao `aguardarMs`).
 */
export const COTA_COMPRAS_POR_MINUTO = 90;
const chamadasCompras: number[] = [];

/** Reserva uma chamada; devolve 0 se liberada ou os ms até haver vaga. */
export function reservarCotaCompras(agora = Date.now()): number {
  while (chamadasCompras.length && agora - chamadasCompras[0] >= 60_000) chamadasCompras.shift();
  if (chamadasCompras.length >= COTA_COMPRAS_POR_MINUTO) return 60_000 - (agora - chamadasCompras[0]) + 250;
  chamadasCompras.push(agora);
  return 0;
}

export async function getJson<T>(
  url: string,
  opcoes: { padraoAguardarSeg?: number; contratoAlteradoEm?: number[] } = {}
): Promise<RespostaApi<T>> {
  const statusContrato = opcoes.contratoAlteradoEm ?? [404];
  const cotaCompras = url.startsWith(URL_COMPRAS);
  let ultimo: RespostaApi<T> = { tipo: "erro", status: null, detalhe: "sem resposta" };
  for (let tentativa = 0; tentativa <= NOVAS_TENTATIVAS; tentativa++) {
    if (cotaCompras) {
      const espera = reservarCotaCompras();
      if (espera > 0) return { tipo: "aguardar", aguardarMs: espera };
    }
    const inicio = Date.now();
    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (e) {
      const nome = (e as Error).name;
      ultimo = {
        tipo: "erro",
        status: null,
        detalhe: nome === "TimeoutError" ? `sem resposta em ${TIMEOUT_MS / 1000} s` : `falha de rede: ${(e as Error).message}`,
      };
      if (tentativa < NOVAS_TENTATIVAS) await esperar(1500 * (tentativa + 1));
      continue;
    }
    const corpo = await resp.text();
    if (resp.status === 429) {
      return { tipo: "aguardar", aguardarMs: aguardarDoRetryAfter(resp.headers.get("retry-after"), corpo, opcoes.padraoAguardarSeg) };
    }
    if (statusContrato.includes(resp.status)) {
      return { tipo: "contrato_alterado", status: resp.status, detalhe: corpo.slice(0, 300) };
    }
    if (resp.status >= 500) {
      ultimo = { tipo: "erro", status: resp.status, detalhe: `HTTP ${resp.status}: ${corpo.slice(0, 200)}` };
      if (tentativa < NOVAS_TENTATIVAS) await esperar(1500 * (tentativa + 1));
      continue;
    }
    if (!resp.ok) {
      return { tipo: "erro", status: resp.status, detalhe: `HTTP ${resp.status}: ${corpo.slice(0, 300)}` };
    }
    try {
      return { tipo: "ok", dados: parseJsonSeguro(corpo) as T, status: resp.status, ms: Date.now() - inicio };
    } catch {
      // 200 com HTML de manutenção não é "nenhum registro".
      return { tipo: "erro", status: resp.status, detalhe: `resposta não é JSON: ${corpo.slice(0, 120)}` };
    }
  }
  return ultimo;
}

/** Envelope das listagens do Compras.gov.br. */
export interface EnvelopeCompras<T> {
  resultado?: T[] | null;
  totalRegistros?: number | string | null;
  totalPaginas?: number | string | null;
  paginasRestantes?: number | string | null;
}

/** "1.234" (com separador de milhar) → 1234; ausente → null. */
export function inteiroDoEnvelope(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[.\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
