"use client";

import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaterialSearch, type MaterialSelecionado } from "@/components/pesquisa-preco/material-search";
import { FormularioPrecoInformado } from "@/components/pesquisa-preco/formulario-preco-informado";
import { useItemPesquisa } from "@/hooks/usePesquisaPreco";
import { CESTA_KEY } from "@/hooks/useCesta";
import type { OrcamentoFornecedor } from "@/lib/pesquisa-preco-curadoria";
import { apiPath } from "@/lib/url";

// ─────────────────────────────────────────────────────────────────────────────
// "Incluir preço informado" ao lado da Cesta (pedido da DLOG): junta uma
// cotação, mídia, nota fiscal ou contratação similar a um item da cesta sem
// precisar pesquisar o item e abrir a revisão dos registros. Escolhe-se o
// material (código ou descrição, com sugestões), a unidade e, se for o caso, a
// UF; o preço vai para o item da cesta com essa chave (criado se não existir).
// ─────────────────────────────────────────────────────────────────────────────

/** Valor do Select para digitar uma unidade sem registros nas bases. */
const OUTRA_UNIDADE = "__outra__";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export function IncluirPrecoInformado() {
  const [aberto, setAberto] = useState(false);
  const [material, setMaterial] = useState<MaterialSelecionado | null>(null);
  const [unidade, setUnidade] = useState("");
  const [unidadeDigitada, setUnidadeDigitada] = useState("");
  const [uf, setUf] = useState("todos");
  const [quantidade, setQuantidade] = useState("1");
  const qc = useQueryClient();
  const { data: item, isLoading } = useItemPesquisa(material?.codigo ?? null);
  const unidades = item?.unidades ?? [];
  // Sem registro nas bases, a cotação é justamente o que resta (art. 5º, IV):
  // a unidade pode ser digitada — o servidor a normaliza como as das bases.
  const semUnidadeNasBases = !!item && unidades.length === 0;
  const digitando = unidade === OUTRA_UNIDADE || semUnidadeNasBases;
  const unidadeFinal = digitando ? unidadeDigitada.trim().toUpperCase() : unidade;

  const escolherMaterial = (m: MaterialSelecionado | null) => {
    setMaterial(m);
    setUnidade("");
    setUnidadeDigitada("");
  };

  const incluir = async (o: OrcamentoFornecedor) => {
    if (!material || !unidadeFinal) throw new Error("Escolha o material e a unidade de fornecimento.");
    // O id é local (o banco gera o definitivo); o servidor não o recebe.
    const orcamento: Partial<OrcamentoFornecedor> = { ...o };
    delete orcamento.id;
    const res = await fetch(apiPath("/api/precos/cesta/preco-informado"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo: material.codigo,
        unidade: unidadeFinal,
        uf: uf === "todos" ? null : uf,
        quantidade: Math.max(1, Math.trunc(Number(quantidade)) || 1),
        orcamento,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Erro ao incluir o preço informado");
    await qc.invalidateQueries({ queryKey: CESTA_KEY });
    toast.success(
      d.novoItem
        ? "Item incluído na cesta com o preço informado."
        : `Preço informado acrescentado ao item da cesta (${d.item?.orcamentos?.length ?? ""} no total).`
    );
  };

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)} className="gap-2">
        <FilePlus2 className="h-4 w-4" />
        Incluir preço informado
      </Button>
      {aberto && (
        <Dialog open onOpenChange={setAberto}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Incluir preço informado na cesta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 px-6 py-4">
              <p className="text-xs text-muted-foreground">
                Cotação com fornecedor, mídia especializada, nota fiscal ou contratação similar (art. 5º,
                II a V), sem pesquisar antes. O preço vai para o item da cesta com este material, unidade e
                UF — se o item ainda não está na cesta, ele entra agora.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">CATMAT / Registro ANVISA</Label>
                  <MaterialSearch modo="codigo" selecionado={material} onSelecionar={escolherMaterial} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrição</Label>
                  <MaterialSearch modo="descricao" selecionado={material} onSelecionar={escolherMaterial} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor={digitando ? "unidade-preco-informado" : undefined}>
                    Unidade de fornecimento
                  </Label>
                  {!semUnidadeNasBases && (
                    <Select value={unidade} onValueChange={setUnidade} disabled={!material || isLoading}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={material ? (isLoading ? "Carregando…" : "Escolha a unidade") : "Escolha o material primeiro"} />
                      </SelectTrigger>
                      <SelectContent>
                        {unidades.map((u) => (
                          <SelectItem key={u.unidade} value={u.unidade}>
                            {u.unidade} · {u.total.toLocaleString("pt-BR")} registro(s)
                          </SelectItem>
                        ))}
                        <SelectItem value={OUTRA_UNIDADE}>Outra unidade (digitar)…</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {digitando && (
                    <>
                      <Input
                        id="unidade-preco-informado"
                        placeholder="Ex.: COMPRIMIDO, FRASCO-AMPOLA"
                        value={unidadeDigitada}
                        onChange={(e) => setUnidadeDigitada(e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {semUnidadeNasBases
                          ? "Nenhuma base traz registro deste material: o item entra na cesta só com os preços informados."
                          : "Unidade sem registro nas bases: o item entra na cesta só com os preços informados."}
                      </p>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">UF (opcional)</Label>
                    <Select value={uf} onValueChange={setUf}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        {UFS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="qtd-preco-informado">Quantidade</Label>
                    <Input
                      id="qtd-preco-informado"
                      inputMode="numeric"
                      value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))}
                      title="Usada só se o item ainda não estiver na cesta"
                    />
                  </div>
                </div>
              </div>
              <FormularioPrecoInformado
                titulo="Preço informado"
                unidade={unidadeFinal || "unidade de fornecimento"}
                rotuloBotao="Incluir na cesta"
                desabilitado={!material || !unidadeFinal}
                onAdicionar={incluir}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
