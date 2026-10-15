import { ORDEM_FONTES, type DuplicidadeRef, type FonteMercadoChave } from "@/lib/pesquisa-preco-fontes";

// ─────────────────────────────────────────────────────────────────────────────
// A mesma compra em mais de uma base (P18). Módulo puro.
//
// No CONJUNTO ÚNICO (porRegistro e a aba do item no mapa) a compra repetida
// conta uma vez só: a cópia sai com "Compõe = Não — duplicado de <fonte>". No
// consolidado POR FONTE nada muda: cada base continua com a sua estatística.
//
//   • Chave de 22 dígitos do item da compra (idCompra + nº do item): mesma
//     chave = mesma compra. Prevalece a primeira fonte na ordem de
//     ORDEM_FONTES (Compras.gov.br antes do SIASG, do PNCP e das atas).
//   • BPS, que não tem a chave: duplicata PROVÁVEL de uma compra do
//     Compras.gov.br com o mesmo CNPJ do fornecedor, o mesmo preço (2 casas) e
//     a mesma UF, e com a mesma quantidade até 15 dias de diferença na data —
//     ou, sem a quantidade, até 3 dias. Calibrado pelo diagnóstico de out/2026:
//     das 7 compras do BPS do 410020, 5 eram do Compras.gov.br, com 0 a 5 dias
//     de diferença. O responsável pode reverter na curadoria.
// ─────────────────────────────────────────────────────────────────────────────

export const DIAS_PROVAVEL_MESMA_QTD = 15;
export const DIAS_PROVAVEL_SEM_QTD = 3;

export interface RegistroParaDuplicidade {
  id: string;
  fonte: FonteMercadoChave;
  chaveItemCompra22?: string | null;
  cnpjFornecedor: string | null;
  /** Preço como publicado (antes do IPCA). */
  preco: number;
  uf: string | null;
  data: string;
  qtd: number | null;
}

const digitos = (s: string | null) => String(s ?? "").replace(/\D/g, "");
const dias = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

/** id do registro → de quem ele é cópia. Os ids em `revertidas` nunca são marcados. */
export function marcarDuplicidades(
  registros: RegistroParaDuplicidade[],
  revertidas: ReadonlySet<string> = new Set()
): Map<string, DuplicidadeRef> {
  const marcas = new Map<string, DuplicidadeRef>();
  const ordem = new Map(ORDEM_FONTES.map((f, i) => [f, i]));

  // 1. Mesma chave de 22 dígitos.
  const porChave = new Map<string, RegistroParaDuplicidade[]>();
  for (const r of registros) {
    if (!r.chaveItemCompra22) continue;
    const lista = porChave.get(r.chaveItemCompra22) ?? [];
    lista.push(r);
    porChave.set(r.chaveItemCompra22, lista);
  }
  for (const grupo of porChave.values()) {
    if (grupo.length < 2) continue;
    grupo.sort((a, b) => (ordem.get(a.fonte) ?? 99) - (ordem.get(b.fonte) ?? 99));
    const [original, ...copias] = grupo;
    for (const c of copias) {
      if (c.fonte === original.fonte || revertidas.has(c.id)) continue;
      marcas.set(c.id, { fonte: original.fonte, id: original.id, provavel: false });
    }
  }

  // 2. BPS × Compras.gov.br, por regra. Cada compra casa com um registro só.
  const compras = registros.filter((r) => r.fonte === "comprasgov" && !marcas.has(r.id));
  const usadas = new Set<string>();
  for (const b of registros) {
    if (b.fonte !== "bps" || marcas.has(b.id) || revertidas.has(b.id)) continue;
    const cnpj = digitos(b.cnpjFornecedor);
    if (!cnpj) continue;
    let melhor: { r: RegistroParaDuplicidade; d: number } | null = null;
    for (const c of compras) {
      if (usadas.has(c.id) || digitos(c.cnpjFornecedor) !== cnpj) continue;
      if (Math.round(c.preco * 100) !== Math.round(b.preco * 100)) continue;
      if ((c.uf ?? "") !== (b.uf ?? "")) continue;
      const d = dias(c.data, b.data);
      const mesmaQtd = c.qtd !== null && b.qtd !== null && Math.abs(c.qtd - b.qtd) < 1e-6;
      if (d > (mesmaQtd ? DIAS_PROVAVEL_MESMA_QTD : DIAS_PROVAVEL_SEM_QTD)) continue;
      if (!melhor || d < melhor.d) melhor = { r: c, d };
    }
    if (melhor) {
      usadas.add(melhor.r.id);
      marcas.set(b.id, { fonte: "comprasgov", id: melhor.r.id, provavel: true });
    }
  }
  return marcas;
}
