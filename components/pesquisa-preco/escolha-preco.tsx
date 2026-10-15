"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Módulo puro: importar lib/pesquisa-preco daqui arrastaria o Prisma para o
// bundle do navegador.
import {
  ALIQUOTAS_TETO,
  METODOS,
  REGRAS_TETO,
  ROTULO_METODO,
  rotuloRegraTeto,
  type AliquotaTeto,
  type EscolhaPreco,
  type MetodoPreco,
  type RegraTeto,
} from "@/lib/pesquisa-preco-metodo";
import type { Recomendacao } from "@/lib/pesquisa-preco";
import { rotuloAliquota, rotuloPmvg } from "@/lib/cmed-aliquotas";

// ─────────────────────────────────────────────────────────────────────────────
// Escolha do método do preço adotado e da regra do teto CMED (P11/P12).
//
// Usado nas modais de emissão (pesquisa avulsa e cesta). A prévia recebe a
// recomendação já recalculada pela função pura `resultadoComEscolha` — a mesma
// que o servidor usa —, então o número mostrado aqui é o que sai no documento.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined) => {
  if (v == null) return "—";
  const [int, dec] = v.toFixed(2).split(".");
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};

export function CamposEscolhaPreco({
  valor,
  onChange,
  idPrefixo,
  desabilitado = false,
  aliquotaDaPesquisa = false,
  semAliquota = false,
}: {
  valor: EscolhaPreco;
  onChange: (e: EscolhaPreco) => void;
  /** Prefixo dos ids dos campos (vários itens na mesma modal). */
  idPrefixo: string;
  desabilitado?: boolean;
  /**
   * A alíquota vem do filtro da pesquisa ("Mais filtros") e aparece só para
   * leitura: trocá-la aqui e não na tela faria o documento divergir da tela.
   */
  aliquotaDaPesquisa?: boolean;
  /** Sem o campo de alíquota (na cesta, cada item tem a sua). */
  semAliquota?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 ${semAliquota ? "sm:grid-cols-2" : "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_6rem]"}`}
    >
      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor={`${idPrefixo}-metodo`}>
          Método do preço adotado
        </Label>
        <Select
          value={valor.metodo}
          onValueChange={(v) => onChange({ ...valor, metodo: v as MetodoPreco })}
          disabled={desabilitado}
        >
          <SelectTrigger id={`${idPrefixo}-metodo`} className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METODOS.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {ROTULO_METODO[m].longo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor={`${idPrefixo}-teto`}>
          Teto CMED
        </Label>
        <Select
          value={valor.regraTeto}
          onValueChange={(v) => onChange({ ...valor, regraTeto: v as RegraTeto })}
          disabled={desabilitado}
        >
          <SelectTrigger id={`${idPrefixo}-teto`} className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REGRAS_TETO.map((r) => (
              <SelectItem key={r} value={r} className="text-xs">
                {rotuloRegraTeto(r, valor.aliquota)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!semAliquota && (
      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor={`${idPrefixo}-aliquota`}>
          ICMS do teto
        </Label>
        {aliquotaDaPesquisa ? (
          <p
            id={`${idPrefixo}-aliquota`}
            className="flex h-8 items-center rounded-md border bg-muted/40 px-2 text-xs"
            title="Definida no filtro Alíquota ICMS da pesquisa (Mais filtros)"
          >
            {rotuloAliquota(valor.aliquota)}
          </p>
        ) : (
          <Select
            value={valor.aliquota}
            onValueChange={(v) => onChange({ ...valor, aliquota: v as AliquotaTeto })}
            disabled={desabilitado}
          >
            <SelectTrigger id={`${idPrefixo}-aliquota`} className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALIQUOTAS_TETO.map((a) => (
                <SelectItem key={a} value={a} className="text-xs">
                  {rotuloAliquota(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      )}
    </div>
  );
}

/** Os dois tetos e o preço que a escolha produz. */
export function PreviaPrecoAdotado({ recomendacao, unidade }: { recomendacao: Recomendacao; unidade: string }) {
  const { tetos, escolha } = recomendacao;
  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-muted-foreground">Preço adotado com esta escolha</span>
        <span className="text-base font-bold text-primary">
          {fmt(recomendacao.precoFinal)} <span className="text-[11px] font-normal text-muted-foreground">por {unidade}</span>
        </span>
      </div>
      <p className="text-muted-foreground">
        {recomendacao.descricaoMetodo}
        {recomendacao.precoReferencia !== null && ` · pelo método: ${fmt(recomendacao.precoReferencia)}`}
      </p>
      <div className="grid gap-1 sm:grid-cols-2">
        <p className={escolha.regraTeto === "menor_pmvg_sem_impostos" ? "font-medium" : "text-muted-foreground"}>
          Menor {rotuloPmvg(escolha.aliquota)}: {fmt(tetos.menor?.valorUnitario)}
        </p>
        <p className={escolha.regraTeto === "pmvg_referencia" ? "font-medium" : "text-muted-foreground"}>
          {rotuloPmvg(escolha.aliquota)} do medicamento de referência: {fmt(tetos.referencia?.valorUnitario)}
          {tetos.referencia ? ` (${tetos.referencia.produto})` : ""}
        </p>
      </div>
    </div>
  );
}
