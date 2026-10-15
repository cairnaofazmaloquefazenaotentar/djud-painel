#!/usr/bin/env python3
"""
Sonda das APIs de dados abertos usadas pela Pesquisa de Preços.

Faz chamadas conhecidas (CATMAT 410020 e as compras de referência da avaliação
da DLOG) e confere que os campos de que o painel depende continuam lá. Sai com
código 1 se o contrato mudou — rode antes de mexer em lib/dados-abertos/ e
quando a coleta pelo painel começar a dar "contrato da API alterado".

Valores conferidos em 15/10/2026 (docs/api/compras-dadosabertos.md).

Uso:
    python scripts/probe_dados_abertos.py
"""

from __future__ import annotations

import sys
import time

import requests

COMPRAS = "https://dadosabertos.compras.gov.br"
BPS = "https://apidadosabertos.saude.gov.br/economia-da-saude/bps"
UA = {"User-Agent": "PainelDJUD-probe/1.0", "Accept": "application/json"}

CAMPOS_MATERIAL = {
    "idCompra", "idCompraItem", "numeroItemCompra", "codigoItemCatalogo", "descricaoItem",
    "nomeUnidadeFornecimento", "siglaUnidadeFornecimento", "capacidadeUnidadeFornecimento",
    "siglaUnidadeMedida", "quantidade", "precoUnitario", "modalidade", "criterioJulgamento",
    "niFornecedor", "nomeFornecedor", "marca", "codigoUasg", "nomeUasg", "nomeOrgao", "estado",
    "dataCompra", "dataResultado", "forma",
}
CAMPOS_CONTRATACAO = {"numeroControlePNCP", "numeroCompra", "processo", "situacaoCompraNomePncp", "orgaoEntidadeCnpj"}
CAMPOS_ITENS = {"numeroItemCompra", "situacaoCompraItemNome", "criterioJulgamentoNome", "valorUnitarioResultado"}
CAMPOS_ARP = {"numeroControlePncpAta", "numeroItem", "valorUnitario", "idCompra", "niFornecedor", "dataVigenciaInicial"}
CAMPOS_BPS = {
    "codigoCatmat", "descricaoItem", "unidadeFornecimento", "capacidade", "registroAnvisa", "dataCompra",
    "dataInsercao", "modalidade", "nomeInstituicao", "cnpjInstituicao", "estado", "cnpjFornecedor",
    "nomeFornecedor", "cnpjFabricante", "nomeFabricante", "quantidade", "precoUnitario",
    "numeroProcessoCompra", "numeroAta", "validadeCompra",
}

falhas: list[str] = []


def get(url: str, params: dict, tentativas: int = 3):
    for _ in range(tentativas):
        r = requests.get(url, params=params, headers=UA, timeout=60)  # TLS verificado (padrão)
        if r.status_code == 429:
            espera = float(r.headers.get("Retry-After") or 15) + 0.5
            print(f"    429 — aguardando {espera:.1f} s")
            time.sleep(espera)
            continue
        return r
    return r


def checar(nome: str, ok: bool, detalhe: str = "") -> None:
    print(f"  {'ok   ' if ok else 'FALHA'} {nome}{(' — ' + detalhe) if detalhe else ''}")
    if not ok:
        falhas.append(nome)


def json_ou_none(r):
    try:
        return r.json()
    except ValueError:
        return None


def main() -> int:
    print("Compras.gov.br — Painel de Preços (1_consultarMaterial)")
    r = get(f"{COMPRAS}/modulo-pesquisa-preco/1_consultarMaterial", {
        "tipo": "codigoItemCatalogo", "codigo": "410020", "dataCompraInicio": "2025-08-01",
        "dataCompraFim": "2026-08-11", "pagina": 1, "tamanhoPagina": 10,
    })
    d = json_ou_none(r)
    checar("HTTP 200 com JSON", r.status_code == 200 and isinstance(d, dict), f"HTTP {r.status_code}")
    if isinstance(d, dict):
        res = d.get("resultado") or []
        checar("envelope (resultado, totalRegistros, totalPaginas)", {"resultado", "totalRegistros", "totalPaginas"} <= set(d))
        checar("há registros", len(res) > 0, f"{d.get('totalRegistros')} registro(s)")
        if res:
            faltam = CAMPOS_MATERIAL - set(res[0])
            checar("campos do item", not faltam, f"faltam {sorted(faltam)}" if faltam else "")
            checar("idCompraItem com 22 dígitos", all(len(str(x.get("idCompraItem", ""))) == 22 for x in res))

    print("Compras.gov.br — vínculo com o PNCP (1.1 e 2.1, compra 90041/2026)")
    r = get(f"{COMPRAS}/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id", {"tipo": "idCompra", "codigo": "12019505900412026"})
    d = json_ou_none(r) or {}
    res = d.get("resultado") or []
    checar("contratação encontrada", bool(res), f"HTTP {r.status_code}")
    if res:
        faltam = CAMPOS_CONTRATACAO - set(res[0])
        checar("campos da contratação", not faltam, f"faltam {sorted(faltam)}" if faltam else "")
        checar("nº de controle conhecido", res[0].get("numeroControlePNCP") == "00394429000100-1-000617/2026", str(res[0].get("numeroControlePNCP")))
    r = get(f"{COMPRAS}/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id", {"tipo": "idCompra", "codigo": "9020105902542026"})
    d = json_ou_none(r) or {}
    checar("idCompra de 16 dígitos devolve vazio (exige 17)", r.status_code == 200 and not (d.get("resultado") or []))
    r = get(f"{COMPRAS}/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id", {
        "tipo": "idCompra", "codigo": "12019505900412026", "idCompraItem": "1201950590041202600122",
    })
    d = json_ou_none(r) or {}
    res = d.get("resultado") or []
    checar("item 122 da contratação", bool(res), f"HTTP {r.status_code}")
    if res:
        faltam = CAMPOS_ITENS - set(res[0])
        checar("campos do item da contratação", not faltam, f"faltam {sorted(faltam)}" if faltam else "")

    print("Compras.gov.br — itens de ata (2_consultarARPItem)")
    r = get(f"{COMPRAS}/modulo-arp/2_consultarARPItem", {
        "codigoItem": "410020", "dataVigenciaInicialMin": "2025-10-16", "dataVigenciaInicialMax": "2026-10-15",
        "pagina": 1, "tamanhoPagina": 10,
    })
    d = json_ou_none(r) or {}
    res = d.get("resultado") or []
    checar("itens de ata", r.status_code == 200 and bool(res), f"HTTP {r.status_code}")
    if res:
        faltam = CAMPOS_ARP - set(res[0])
        checar("campos do item de ata", not faltam, f"faltam {sorted(faltam)}" if faltam else "")

    print("Compras.gov.br — catálogo (4_consultarItemMaterial, 640532)")
    r = get(f"{COMPRAS}/modulo-material/4_consultarItemMaterial", {"codigoItem": "640532", "pagina": 1, "tamanhoPagina": 10})
    d = json_ou_none(r) or {}
    res = d.get("resultado") or []
    checar("item de catálogo", bool(res) and "eplontersena" in str(res[0].get("descricaoItem", "")).lower())

    print("BPS — API de Dados Abertos do Ministério da Saúde")
    r = get(BPS, {"codigoCatmat": "410020", "pagina": 1, "tamanhoPagina": 10})
    d = json_ou_none(r)
    checar("HTTP 200 com {bps: [...]}", r.status_code == 200 and isinstance(d, dict) and isinstance(d.get("bps"), list), f"HTTP {r.status_code}")
    if isinstance(d, dict) and d.get("bps"):
        faltam = CAMPOS_BPS - set(d["bps"][0])
        checar("campos do registro BPS", not faltam, f"faltam {sorted(faltam)}" if faltam else "")
    r = get(BPS, {"codigoCatmat": "410020", "dataCompraInicio": "11/08/2025", "pagina": 1, "tamanhoPagina": 10})
    checar("data fora de AAAA-MM-DD → 400", r.status_code == 400, f"HTTP {r.status_code}")

    print()
    if falhas:
        print(f"CONTRATO ALTERADO em {len(falhas)} ponto(s): {', '.join(falhas)}")
        print("Atualize lib/dados-abertos/ (e o espelho Python) e docs/api/compras-dadosabertos.md.")
        return 1
    print("Contrato das APIs conferido: nada mudou.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
