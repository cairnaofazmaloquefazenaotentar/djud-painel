/**
 * Autoteste do filtro único das demandas (A1/A4 da avaliação da DLOG):
 * leitura e escrita da URL, interpretação da busca, descrição do recorte e os
 * casos compartilhados com os espelhos Python
 * (scripts/fixtures/demandas/casos_busca.json).
 *
 * Uso:
 *   npx tsx scripts/autoteste-demandas.ts
 *
 * Sai com código 1 se algum caso falhar. Não toca no banco.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATALHOS_STATUS,
  FILTRO_VAZIO,
  comSelecao,
  descreverFiltro,
  filtroAtivo,
  filtroParaQuery,
  interpretarBusca,
  lerFiltroDemandas,
  montarBuscaNorm,
  normalizarNupSei,
  quantidadeDeFiltros,
  termosDaBusca,
} from "../lib/demandas-filtro-tipos";
import { grupoDeSubstancia, limparSubstancia, radicalSubstancia } from "../lib/substancia";

let falhas = 0;
let casos = 0;
function confere(nome: string, obtido: unknown, esperado: unknown) {
  casos += 1;
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    falhas += 1;
    console.log(`  FALHOU  ${nome}\n          obtido:   ${a}\n          esperado: ${b}`);
  }
}
const sp = (q: string) => new URLSearchParams(q);

// ── URL ──────────────────────────────────────────────────────────────────────

confere("?status=X antigo = incluir um valor", lerFiltroDemandas(sp("status=Conclu%C3%ADda")).campos, {
  status: { incluir: ["Concluída"], excluir: [] },
});
const multi = lerFiltroDemandas(sp("status=A&status=B&status_excluir=C&pontoControle=Cessar+Atos&trfRegiao=__null__"));
confere("parâmetros repetidos e exclusão", multi.campos, {
  status: { incluir: ["A", "B"], excluir: ["C"] },
  trfRegiao: { incluir: ["__null__"], excluir: [] },
  pontoControle: { incluir: ["Cessar Atos"], excluir: [] },
});
confere("ida e volta pela URL", lerFiltroDemandas(filtroParaQuery(multi)), multi);
confere(
  "o mesmo valor em incluir e excluir fica só em incluir",
  lerFiltroDemandas(sp("status=A&status_excluir=A&status_excluir=B")).campos.status,
  { incluir: ["A"], excluir: ["B"] }
);
const antigos = lerFiltroDemandas(sp("startDate=2026-01-01T00:00:00.000Z&endDate=2026-03-31T00:00:00.000Z&principioAtivo=Nusinersen"));
confere("nomes antigos do Dashboard", [antigos.criadoDe, antigos.criadoAte, antigos.medicamento], [
  "2026-01-01",
  "2026-03-31",
  "Nusinersen",
]);
confere("data inválida é ignorada", lerFiltroDemandas(sp("dataEntradaDe=2026-02-30")).dataEntradaDe, null);
confere("filtro vazio", [filtroAtivo(FILTRO_VAZIO), quantidadeDeFiltros(FILTRO_VAZIO)], [false, 0]);
confere("seleção vazia remove o campo", comSelecao(multi, "status", { incluir: [], excluir: [] }).campos.status, undefined);

// ── Atalhos de status (P3) ───────────────────────────────────────────────────

const statusBanco = ["Em Análise COAJUD", "Em Análise", "Concluída", "Tramitado"];
confere(
  "atalhos de status",
  ATALHOS_STATUS.map((a) => a.aplicar(statusBanco)),
  [
    { incluir: ["Em Análise COAJUD", "Em Análise"], excluir: [] },
    { incluir: ["Concluída"], excluir: [] },
    { incluir: [], excluir: ["Concluída"] },
  ]
);

// ── Busca (A4) ───────────────────────────────────────────────────────────────

confere("CATMAT de 6 dígitos", interpretarBusca("410020"), { tipo: "codigo", codigo: "410020", termos: ["410020"] });
confere("registro ANVISA de 13 dígitos", interpretarBusca("1006811320035").tipo, "codigo");
confere("nº CNJ com máscara compara os dígitos", interpretarBusca("5000904-02.2021.4.03.6006"), {
  tipo: "numero",
  digitos: "50009040220214036006",
  termos: ["50009040220214036006"],
});
confere("NUP SEI", interpretarBusca("25000.123456/2021-11").tipo, "numero");
confere("texto: radical de palavra longa", termosDaBusca("Eltrombopague"), ["eltrombopag"]);
confere("texto: acento e caixa (5 letras fica inteira)", termosDaBusca("ÁCIDO zoledrônico"), ["acido", "zoledronic"]);
confere("texto: palavra curta fica inteira", termosDaBusca("AAS 100"), ["aas", "100"]);
confere("texto vira 'texto'", interpretarBusca("nusinersena").tipo, "texto");

// ── Descrição do recorte ─────────────────────────────────────────────────────

confere(
  "descrição do filtro",
  descreverFiltro({
    ...FILTRO_VAZIO,
    medicamento: "eltrombopag",
    campos: { status: { incluir: ["Concluída"], excluir: ["Tramitado"] }, trfRegiao: { incluir: ["3"], excluir: [] } },
    dataEntradaDe: "2025-01-01",
  }),
  [
    ["Medicamento", "eltrombopag"],
    ["Status", "Concluída · exceto Tramitado"],
    ["TRF", "TRF 3ª Região"],
    ["Entrada no DJUD", "a partir de 01/01/2025"],
  ]
);

// ── Casos compartilhados com o Python ────────────────────────────────────────

const comp = JSON.parse(readFileSync(join(__dirname, "fixtures", "demandas", "casos_busca.json"), "utf8"));
for (const [e, s] of comp.nupSei) confere(`NUP ${JSON.stringify(e)}`, normalizarNupSei(e), s);
for (const [e, s] of comp.buscaNorm) confere(`buscaNorm ${e.numero}`, montarBuscaNorm(e), s);
for (const [e, s] of comp.radicalSubstancia) confere(`radical ${e}`, radicalSubstancia(limparSubstancia(e)), s);
for (const [e, s] of comp.grupoDeSubstancia) confere(`grupo ${e}`, grupoDeSubstancia(e), s);

console.log(`${casos - falhas}/${casos} caso(s) conferido(s).`);
if (falhas) {
  console.log(`${falhas} falha(s).`);
  process.exit(1);
}
