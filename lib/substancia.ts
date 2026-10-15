// ─────────────────────────────────────────────────────────────────────────────
// Nome de substância → radical tolerante a grafia. Módulo puro (sem Prisma): a
// lista de Demandas, o Dashboard e o filtro por CATMAT usam as mesmas regras.
// Espelho Python em scripts/substancia.py (conferidos pelos mesmos casos em
// scripts/autoteste-pesquisa-preco.ts e `python scripts/substancia.py`).
//
// O Redmine escreve o medicamento como o usuário digitou ("Nusinersen",
// "Eltrombopag", "Ribociclibe") e o catálogo, pela DCB ("NUSINERSENA",
// "ELTROMBOPAGUE OLAMINA", "SUCCINATO DE RIBOCICLIBE"). Tolerância, nesta
// ordem: sai o sal ou veículo na frente ("SUCCINATO DE", "ÓLEO DE"), sai o
// sufixo que não identifica a molécula ("SÓDICA", "MONOIDRATADO"), fica a
// palavra mais longa sem a terminação portuguesa — vogal final, ou o "UE" de
// "-GUE" (eltrombopague → eltrombopag) — e cada radical é procurado com e sem
// acento, porque o Redmine não é consistente.
// ─────────────────────────────────────────────────────────────────────────────

/** Radical mais curto que isto vira ruído em `contains` ("ALFA", "ÁCIDO"). */
export const TAMANHO_MINIMO_RADICAL = 5;

/** Palavras com pelo menos isto de letras perdem a terminação portuguesa. */
export const TAMANHO_PARA_RADICAL = 6;

/** Sal ou veículo na frente do nome: "SUCCINATO DE RIBOCICLIBE" → "RIBOCICLIBE". */
const PREFIXO_SAL = /^(?:(?:[A-ZÀ-Ü]+(?:ATO|ETO|IDRATO|ILATO)|ÓLEO|OLEO|EXTRATO|SAL)\s+DE\s+)+/iu;

/** Sufixos que não identificam a molécula: "ENOXAPARINA SÓDICA" → "ENOXAPARINA". */
const SUFIXO_SAL =
  /\s+(?:SÓDIC[OA]|SODIC[OA]|DISSÓDIC[OA]|DISSODIC[OA]|TRISSÓDIC[OA]|TRISSODIC[OA]|POTÁSSIC[OA]|POTASSIC[OA]|CÁLCIC[OA]|CALCIC[OA]|MAGNÉSIC[OA]|MAGNESIC[OA]|MONOIDRATAD[OA]|DIIDRATAD[OA]|ANIDR[OA]|RECOMBINANTE|HUMAN[OA])$/iu;

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Nome da substância sem parênteses, sal e sufixo — como o usuário a reconhece. */
export function limparSubstancia(bruta: string): string {
  let s = bruta.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(PREFIXO_SAL, "");
  for (let anterior = ""; anterior !== s; ) {
    anterior = s;
    s = s.replace(SUFIXO_SAL, "");
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Uma palavra sem a terminação portuguesa: "ELTROMBOPAGUE" → "ELTROMBOPAG",
 * "NUSINERSENA" → "NUSINERSEN", "TRASTUZUMABE" → "TRASTUZUMAB". Palavras
 * curtas (< TAMANHO_PARA_RADICAL) ficam como estão.
 */
export function radicalPalavra(palavra: string): string {
  const p = palavra.toUpperCase();
  if (p.length < TAMANHO_PARA_RADICAL) return p;
  if (/GUE$/u.test(p)) return p.slice(0, -2);
  if (/[AEO]$/u.test(p)) return p.slice(0, -1);
  return p;
}

/**
 * Palavra mais longa da substância, sem a terminação: o radical que sobrevive
 * às grafias. "ÁCIDO ZOLEDRÔNICO" → ZOLEDRÔNIC; null quando fica curto demais.
 */
export function radicalSubstancia(limpa: string): string | null {
  const palavras = limpa.toUpperCase().match(/[A-ZÀ-Ü0-9]+/gu) ?? [];
  if (!palavras.length) return null;
  const p = radicalPalavra(palavras.reduce((a, b) => (b.length > a.length ? b : a)));
  return p.length >= TAMANHO_MINIMO_RADICAL ? p : null;
}

export interface GrupoTermos {
  /** Substância(s) como o catálogo escreve — para mostrar ao usuário. */
  rotulo: string;
  /** Radicais que precisam ocorrer TODOS na demanda (AND). */
  termos: string[];
}

/** Uma string de substância (pode ser associação "A;B" ou "A + B") → um grupo. */
export function grupoDeSubstancia(bruta: string): GrupoTermos | null {
  const partes = bruta.split(/[;+/]/).map(limparSubstancia).filter(Boolean);
  const termos: string[] = [];
  for (const parte of partes) {
    const r = radicalSubstancia(parte);
    if (r && !termos.includes(r)) termos.push(r);
  }
  return termos.length ? { rotulo: partes.join(" + "), termos } : null;
}

/**
 * Substância principal de uma descrição CATMAT ("NOME, ATRIBUTO: VALOR, …").
 * Quando o nome é genérico ("EXTRATO MEDICINAL"), o atributo PRINCÍPIO ATIVO
 * é que traz a molécula. O fallback " — " é a descrição montada a partir do
 * registro ANVISA quando o código não está no catálogo.
 */
export function substanciaPrincipal(descricao: string): string {
  const pa = descricao.match(/PRINC[IÍ]PIO ATIVO:\s*([^,]+)/iu);
  if (pa) return pa[1].trim();
  return descricao.split(",")[0].split(" — ")[0].trim();
}

/** Com e sem acento — o Redmine não é consistente na grafia. */
export function variantesTermo(termo: string): string[] {
  return Array.from(new Set([termo, semAcento(termo)]));
}
