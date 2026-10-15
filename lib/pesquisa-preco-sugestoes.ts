import { db } from "@/lib/db";
import { ORIGENS_COLETA } from "@/lib/dados-abertos/situacao";
import { normalizarTexto } from "@/lib/texto-norm";
import {
  mapearUnidades,
  resolverItem,
  variantesCatmat,
  type ItemPesquisa,
} from "@/lib/pesquisa-preco";
import {
  formatarCnpj,
  ROTULO_FILTRO,
  variantesCnpj,
  type CampoFiltro,
  type RespostaSugestoesFiltro,
  type SugestaoFiltro,
} from "@/lib/pesquisa-preco-filtros";

// ─────────────────────────────────────────────────────────────────────────────
// Autocomplete dos filtros opcionais da Pesquisa de Preços (Fornecedor,
// Fabricante, CNPJ do comprador). Lê as mesmas colunas e o mesmo recorte
// (CATMAT, unidade de fornecimento, UF) que pesquisarPrecos usa para filtrar —
// a contagem mostrada é de registros que o filtro de fato encontra. Não aplica
// a janela do art. 5º: o que estiver fora dela aparece no aviso do período.
//
// Colunas por campo (ver FONTE_SEM_CAMPO e a tabela do CLAUDE.md):
//   fornecedor     → DadosAbertosPreco.nomeFornecedor, PrecoBps, PrecoSiasg, PrecoPncp
//   fabricante     → DadosAbertosPreco.marca/nomeFabricante, PrecoBps, PrecoSiasg,
//                    CMED (laboratório e fabricante do registro — recorta o teto)
//   cnpjComprador  → DadosAbertosPreco.cnpjOrgao (só BPS), PrecoBps.cnpjInstituicao,
//                    PrecoPncp.cnpjOrgao
// ─────────────────────────────────────────────────────────────────────────────

const LIMITE_POR_BASE = 60;
const LIMITE_RESPOSTA = 20;

const FONTE_CMED = "CMED";

const ROTULO_ORIGEM: Record<string, string> = {
  COMPRASGOV: "Compras.gov.br",
  BPS: "BPS",
  ARP_ITEM: "Atas",
};

export interface ConsultaSugestoes {
  codigo: string;
  unidade: string;
  uf: string | null;
  campo: CampoFiltro;
  /** Trecho digitado; vazio = os valores mais frequentes. */
  q: string;
}

type Ocorrencia = { valor: string; detalhe: string | null; n: number; fonte: string };

const contem = (termo: string) => ({ contains: termo, mode: "insensitive" as const });

/**
 * Junta as ocorrências das bases. Só une grafias que diferem em maiúsculas e
 * minúsculas: o filtro das bases é `contains` sem distinguir caixa, mas
 * distingue acento e pontuação — unir "S.A" e "SA" prometeria registros que o
 * filtro escolhido não encontra. CNPJ une pelos dígitos.
 */
function consolidar(ocorrencias: Ocorrencia[], campo: CampoFiltro): SugestaoFiltro[] {
  const grupos = new Map<
    string,
    { grafias: Map<string, number>; detalhes: Map<string, number>; total: number; fontes: Set<string> }
  >();
  for (const o of ocorrencias) {
    const valor = o.valor.trim();
    if (!valor) continue;
    const chave = campo === "cnpjComprador" ? valor.replace(/\D/g, "") : valor.toLocaleUpperCase("pt-BR");
    if (!chave) continue;
    const g = grupos.get(chave) ?? { grafias: new Map(), detalhes: new Map(), total: 0, fontes: new Set<string>() };
    g.grafias.set(valor, (g.grafias.get(valor) ?? 0) + o.n);
    if (o.detalhe?.trim()) g.detalhes.set(o.detalhe.trim(), (g.detalhes.get(o.detalhe.trim()) ?? 0) + o.n);
    g.total += o.n;
    g.fontes.add(o.fonte);
    grupos.set(chave, g);
  }
  const maisFrequente = (m: Map<string, number>) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] ?? null;
  const todos = Array.from(grupos.values())
    .map((g) => ({
      valor: maisFrequente(g.grafias) as string,
      detalhe: maisFrequente(g.detalhes),
      total: g.total,
      fontes: Array.from(g.fontes).sort((a, b) => a.localeCompare(b, "pt-BR")),
    }))
    .sort((a, b) => b.total - a.total || a.valor.localeCompare(b.valor, "pt-BR"));
  // Fabricante: os laboratórios da CMED vêm sempre (são poucos e recortam o
  // teto) — contados por registro, ficariam soterrados pelas marcas das compras.
  const naCmed = todos.filter((v) => v.fontes.includes(FONTE_CMED));
  const resto = todos.filter((v) => !v.fontes.includes(FONTE_CMED)).slice(0, LIMITE_RESPOSTA);
  return [...naCmed, ...resto];
}

/** Tabela de dados abertos ainda não criada → segue sem ela, como na pesquisa. */
async function semFalhar<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (error) {
    console.warn("[pesquisa-preco/sugestoes] base indisponível:", (error as Error).message);
    return [];
  }
}

export async function sugerirValoresFiltro(c: ConsultaSugestoes): Promise<RespostaSugestoesFiltro> {
  const item: ItemPesquisa | null = await resolverItem(c.codigo);
  if (!item) return { valores: [], motivo: "Material não encontrado." };
  const { brutas, bpsDaApi } = await mapearUnidades(item);
  const variantes = item.catmat ? variantesCatmat(item.catmat) : null;
  const uf = c.uf ? { uf: c.uf } : {};
  const q = c.q.trim().replace(/\s+/g, " ").slice(0, 80);
  const brutasBps = brutas.bps.get(c.unidade) ?? [];
  const brutasSiasg = brutas.siasg.get(c.unidade) ?? [];
  const brutasPncp = brutas.pncp.get(c.unidade) ?? [];

  const whereBps = variantes && brutasBps.length && !bpsDaApi
    ? { codigoCatmat: { in: variantes.bps }, unidade: { in: brutasBps }, ...uf }
    : null;
  const whereSiasg = variantes && brutasSiasg.length
    ? { codigoCatmat: { in: variantes.siasg }, unidade: { in: brutasSiasg }, acaoJudicial: true, ...uf }
    : null;
  const wherePncp = variantes && brutasPncp.length
    ? { codItemCatalogo: { in: variantes.pncp }, unidade: { in: brutasPncp }, ...uf }
    : null;
  // Só as origens que a pesquisa lê (PNCP_ITEM é insumo do vínculo, não preço).
  const whereDA = item.catmat
    ? { origem: { in: ORIGENS_COLETA }, codigoCatmat: item.catmat, unidadeNorm: c.unidade, ...uf }
    : null;

  const ocorrencias: Ocorrencia[] = [];
  const somar = (fonte: string, linhas: Array<{ valor: string | null; detalhe?: string | null; n: number }>) => {
    for (const l of linhas) if (l.valor) ocorrencias.push({ valor: l.valor, detalhe: l.detalhe ?? null, n: l.n, fonte });
  };

  if (c.campo === "fornecedor") {
    const termo = q ? { fornecedor: contem(q) } : { fornecedor: { not: null } };
    const [bps, siasg, pncp, da] = await Promise.all([
      whereBps
        ? db.precoBps.groupBy({ by: ["fornecedor"], where: { ...whereBps, ...termo }, _count: { _all: true }, orderBy: { _count: { fornecedor: "desc" } }, take: LIMITE_POR_BASE })
        : [],
      whereSiasg
        ? db.precoSiasg.groupBy({ by: ["fornecedor"], where: { ...whereSiasg, ...termo }, _count: { _all: true }, orderBy: { _count: { fornecedor: "desc" } }, take: LIMITE_POR_BASE })
        : [],
      wherePncp
        ? db.precoPncp.groupBy({ by: ["fornecedor"], where: { ...wherePncp, ...termo }, _count: { _all: true }, orderBy: { _count: { fornecedor: "desc" } }, take: LIMITE_POR_BASE })
        : [],
      whereDA
        ? semFalhar(
            db.dadosAbertosPreco.groupBy({
              by: ["origem", "nomeFornecedor"],
              where: { ...whereDA, ...(q ? { nomeFornecedor: contem(q) } : { nomeFornecedor: { not: null } }) },
              _count: { _all: true },
              orderBy: { _count: { nomeFornecedor: "desc" } },
              take: LIMITE_POR_BASE,
            })
          )
        : [],
    ]);
    somar("BPS", bps.map((g) => ({ valor: g.fornecedor, n: g._count._all })));
    somar("Compras.gov.br", siasg.map((g) => ({ valor: g.fornecedor, n: g._count._all })));
    somar("Compras.gov.br", pncp.map((g) => ({ valor: g.fornecedor, n: g._count._all })));
    for (const g of da) somar(ROTULO_ORIGEM[g.origem] ?? g.origem, [{ valor: g.nomeFornecedor, n: g._count._all }]);
  } else if (c.campo === "fabricante") {
    const termo = q ? { fabricante: contem(q) } : { fabricante: { not: null } };
    const [bps, siasg, daMarca, daFabricante, cmed] = await Promise.all([
      whereBps
        ? db.precoBps.groupBy({ by: ["fabricante"], where: { ...whereBps, ...termo }, _count: { _all: true }, orderBy: { _count: { fabricante: "desc" } }, take: LIMITE_POR_BASE })
        : [],
      whereSiasg
        ? db.precoSiasg.groupBy({ by: ["fabricante"], where: { ...whereSiasg, ...termo }, _count: { _all: true }, orderBy: { _count: { fabricante: "desc" } }, take: LIMITE_POR_BASE })
        : [],
      whereDA
        ? semFalhar(
            db.dadosAbertosPreco.groupBy({
              by: ["origem", "marca"],
              where: { ...whereDA, ...(q ? { marca: contem(q) } : { marca: { not: null } }) },
              _count: { _all: true },
              orderBy: { _count: { marca: "desc" } },
              take: LIMITE_POR_BASE,
            })
          )
        : [],
      whereDA
        ? semFalhar(
            db.dadosAbertosPreco.groupBy({
              by: ["origem", "nomeFabricante"],
              where: { ...whereDA, ...(q ? { nomeFabricante: contem(q) } : { nomeFabricante: { not: null } }) },
              _count: { _all: true },
              orderBy: { _count: { nomeFabricante: "desc" } },
              take: LIMITE_POR_BASE,
            })
          )
        : [],
      // CMED: laboratório do preço e fabricante do registro ANVISA, nos
      // registros da unidade — o filtro de fabricante recorta também o teto.
      (async () => {
        const registros = item.registros.filter((r) => r.unidadeNorm === c.unidade);
        if (!registros.length) return [] as Array<{ valor: string | null; n: number }>;
        const precos = await db.precoCmed.findMany({
          where: { registro: { in: registros.map((r) => r.registro) } },
          select: { registro: true, laboratorio: true },
        });
        const porRegistro = new Map<string, Set<string>>();
        for (const r of registros) if (r.fabricante) porRegistro.set(r.registro, new Set([r.fabricante]));
        for (const p of precos) {
          if (!p.registro || !p.laboratorio) continue;
          const s = porRegistro.get(p.registro) ?? new Set<string>();
          s.add(p.laboratorio);
          porRegistro.set(p.registro, s);
        }
        // Um registro conta uma vez para cada nome que traz (laboratório e fabricante).
        const contagem = new Map<string, number>();
        for (const nomes of porRegistro.values()) {
          for (const nome of nomes) {
            if (q && !normalizarTexto(nome).includes(normalizarTexto(q))) continue;
            contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
          }
        }
        return Array.from(contagem.entries()).map(([valor, n]) => ({ valor, n }));
      })(),
    ]);
    somar("BPS", bps.map((g) => ({ valor: g.fabricante, n: g._count._all })));
    somar("Compras.gov.br", siasg.map((g) => ({ valor: g.fabricante, n: g._count._all })));
    for (const g of daMarca) somar(ROTULO_ORIGEM[g.origem] ?? g.origem, [{ valor: g.marca, n: g._count._all }]);
    for (const g of daFabricante) somar(ROTULO_ORIGEM[g.origem] ?? g.origem, [{ valor: g.nomeFabricante, n: g._count._all }]);
    somar(FONTE_CMED, cmed);
  } else {
    // CNPJ do comprador: dígitos casam por prefixo (nas duas formas de
    // gravação); texto casa pelo nome do órgão/instituição.
    const digitos = q.replace(/\D/g, "");
    const porCnpj = digitos.length >= 2 && digitos.length === q.replace(/[\s./-]/g, "").length;
    const prefixos = porCnpj ? Array.from(new Set([digitos, formatarCnpj(digitos)])) : null;
    const [bps, pncp, da] = await Promise.all([
      whereBps
        ? db.precoBps.groupBy({
            by: ["cnpjInstituicao", "instituicao"],
            where: {
              ...whereBps,
              cnpjInstituicao: { not: null },
              ...(prefixos ? { OR: prefixos.map((v) => ({ cnpjInstituicao: { startsWith: v } })) } : q ? { instituicao: contem(q) } : {}),
            },
            _count: { _all: true },
            orderBy: { _count: { cnpjInstituicao: "desc" } },
            take: LIMITE_POR_BASE,
          })
        : [],
      wherePncp
        ? db.precoPncp.groupBy({
            by: ["cnpjOrgao", "orgao"],
            where: {
              ...wherePncp,
              cnpjOrgao: { not: null },
              ...(prefixos ? { OR: prefixos.map((v) => ({ cnpjOrgao: { startsWith: v } })) } : q ? { orgao: contem(q) } : {}),
            },
            _count: { _all: true },
            orderBy: { _count: { cnpjOrgao: "desc" } },
            take: LIMITE_POR_BASE,
          })
        : [],
      // Nos dados abertos só o BPS identifica o comprador por CNPJ (FONTE_SEM_CAMPO).
      whereDA
        ? semFalhar(
            db.dadosAbertosPreco.groupBy({
              by: ["cnpjOrgao", "orgao"],
              where: {
                ...whereDA,
                origem: "BPS",
                cnpjOrgao: prefixos ? { startsWith: digitos } : { not: null },
                ...(q && !prefixos ? { orgao: contem(q) } : {}),
              },
              _count: { _all: true },
              orderBy: { _count: { cnpjOrgao: "desc" } },
              take: LIMITE_POR_BASE,
            })
          )
        : [],
    ]);
    const cnpj = (v: string | null) => {
      const d = String(v ?? "").replace(/\D/g, "");
      return d.length >= 8 && variantesCnpj(d) ? formatarCnpj(d) : null;
    };
    somar("BPS", bps.map((g) => ({ valor: cnpj(g.cnpjInstituicao), detalhe: g.instituicao, n: g._count._all })));
    somar("Compras.gov.br", pncp.map((g) => ({ valor: cnpj(g.cnpjOrgao), detalhe: g.orgao, n: g._count._all })));
    somar("BPS", da.map((g) => ({ valor: cnpj(g.cnpjOrgao), detalhe: g.orgao, n: g._count._all })));
  }

  const valores = consolidar(ocorrencias, c.campo);
  return {
    valores,
    motivo: valores.length
      ? null
      : q
        ? `Nenhum ${ROTULO_FILTRO[c.campo].toLowerCase()} com “${q}” nos registros deste item e unidade.`
        : `As bases não trazem ${ROTULO_FILTRO[c.campo].toLowerCase()} para este item e unidade.`,
  };
}
