import { db } from "@/lib/db";
import type { TipoCodigo } from "@/lib/pesquisa-preco";

// ─────────────────────────────────────────────────────────────────────────────
// Cesta de itens da Pesquisa de Preços — leitura e serialização.
//
// A cesta é do usuário logado (CestaItem.userId) e vive no banco justamente
// para sobreviver ao logout: quem adiciona itens e sai sem gerar o relatório
// encontra a mesma cesta ao entrar de novo, em qualquer máquina.
//
// Os preços gravados na linha são um snapshot do instante em que o item foi
// adicionado — servem para o total estimado na tela. O relatório consolidado
// refaz a pesquisa de cada item na data de emissão.
// ─────────────────────────────────────────────────────────────────────────────

export interface CestaItemDTO {
  id: string;
  codigo: string;
  tipo: TipoCodigo;
  catmat: string | null;
  descricao: string;
  unidade: string;
  uf: string | null;
  quantidade: number;
  observacao: string | null;
  precoReferencia: number | null;
  limitePmvg: number | null;
  precoFinal: number | null;
  /** precoFinal × quantidade — null quando não há preço apurado. */
  valorTotal: number | null;
  calculadoEm: string;
  criadoEm: string;
}

export interface CestaResumo {
  itens: CestaItemDTO[];
  total: number;
  /** Soma de precoFinal × quantidade dos itens com preço. */
  valorTotal: number;
  /** Itens sem preço apurado — não entram no valor total. */
  itensSemPreco: number;
}

interface LinhaCesta {
  id: string;
  codigo: string;
  tipo: string;
  catmat: string | null;
  descricao: string;
  unidade: string;
  uf: string | null;
  quantidade: number;
  observacao: string | null;
  precoReferencia: number | null;
  limitePmvg: number | null;
  precoFinal: number | null;
  calculadoEm: Date;
  criadoEm: Date;
}

export function paraDTO(r: LinhaCesta): CestaItemDTO {
  return {
    id: r.id,
    codigo: r.codigo,
    tipo: r.tipo === "REGISTRO" ? "REGISTRO" : "CATMAT",
    catmat: r.catmat,
    descricao: r.descricao,
    unidade: r.unidade,
    uf: r.uf,
    quantidade: r.quantidade,
    observacao: r.observacao,
    precoReferencia: r.precoReferencia,
    limitePmvg: r.limitePmvg,
    precoFinal: r.precoFinal,
    valorTotal: r.precoFinal === null ? null : r.precoFinal * r.quantidade,
    calculadoEm: r.calculadoEm.toISOString(),
    criadoEm: r.criadoEm.toISOString(),
  };
}

export function resumir(itens: CestaItemDTO[]): CestaResumo {
  let valorTotal = 0;
  let itensSemPreco = 0;
  for (const i of itens) {
    if (i.valorTotal === null) itensSemPreco += 1;
    else valorTotal += i.valorTotal;
  }
  return { itens, total: itens.length, valorTotal, itensSemPreco };
}

/** Itens da cesta do usuário, na ordem em que foram adicionados. */
export async function listarCesta(userId: string): Promise<CestaResumo> {
  const rows = await db.cestaItem.findMany({
    where: { userId },
    orderBy: { criadoEm: "asc" },
  });
  return resumir(rows.map(paraDTO));
}
