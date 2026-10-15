"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaterialSearch, type MaterialSelecionado } from "@/components/pesquisa-preco/material-search";
import { useItemPesquisa } from "@/hooks/usePesquisaPreco";

// ─────────────────────────────────────────────────────────────────────────────
// CATMAT / Registro ANVISA, Descrição e Unidade de fornecimento — os três
// primeiros filtros da lista de Demandas, iguais aos da Pesquisa de Preços:
// os dois campos sugerem itens do catálogo e registros ANVISA enquanto se
// digita (código ou nome — "eltrombopague" acha "ELTROMBOPAG OLAMINA"), e
// escolher em um preenche o outro. A unidade lista as do item escolhido.
// ─────────────────────────────────────────────────────────────────────────────

const TODAS = "__todas__";

export function FiltroMaterial({
  catmat,
  unidade,
  onChange,
}: {
  catmat: string | null;
  unidade: string | null;
  onChange: (v: { catmat: string | null; unidade: string | null }) => void;
}) {
  const { data, isLoading } = useItemPesquisa(catmat);
  const selecionado = useMemo<MaterialSelecionado | null>(() => {
    if (!catmat) return null;
    const item = data?.item;
    return {
      tipo: item?.tipo ?? (catmat.replace(/\D/g, "").length >= 9 ? "REGISTRO" : "CATMAT"),
      codigo: item?.codigo ?? catmat,
      descricao: item?.descricao ?? (isLoading ? "carregando…" : catmat),
      detalhe: item?.nomeClasse ? `Classe ${item.codigoClasse} — ${item.nomeClasse}` : null,
    };
  }, [catmat, data, isLoading]);

  const escolher = (m: MaterialSelecionado | null) => onChange({ catmat: m?.codigo ?? null, unidade: null });
  const unidades = data?.unidades ?? [];

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">CATMAT / Registro ANVISA</Label>
        <MaterialSearch modo="codigo" selecionado={selecionado} onSelecionar={escolher} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Descrição</Label>
        <MaterialSearch modo="descricao" selecionado={selecionado} onSelecionar={escolher} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Unidade de fornecimento</Label>
        <Select
          value={unidade ?? TODAS}
          disabled={!catmat || unidades.length === 0}
          onValueChange={(v) => onChange({ catmat, unidade: v === TODAS ? null : v })}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue placeholder={catmat ? "Todas" : "Escolha o material primeiro"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>{catmat ? "Todas as unidades" : "Escolha o material primeiro"}</SelectItem>
            {unidades.map((u) => (
              <SelectItem key={u.unidade} value={u.unidade}>
                {u.unidade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
