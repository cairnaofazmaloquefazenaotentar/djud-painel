"""
Saidas (secao 7 do prompt), sempre em saida_catmat/ (fora do git).

  gravar_proposta()  copia fiel da GP (mesma aba, linhas 1-5 e formulas intactas, mesma ordem);
                     nivel A preenche H-K SOMENTE onde H estava vazio; colunas novas a partir de R.
                     Linha que ja tinha CATMAT ou status nao e tocada. O original nunca e sobrescrito.
  gravar_revisao()   planilha de revisao com uma aba por lista.
"""

from __future__ import annotations

from pathlib import Path

from .leitura import GrandePadrao
from .proposta import Proposta

COLUNAS_PROPOSTA = ["Proposta CATMAT", "Proposta Descrição", "Proposta Unidade", "Proposta Qt_Embal", "Nível",
                    "Aderência", "Método", "Evidência", "Alertas", "Origem"]


def gravar_proposta(gp: GrandePadrao, propostas: dict[str, Proposta], descricao_de, caminho: Path, data: str,
                    novas: list[dict] | None = None) -> dict:
    """descricao_de(catmat) -> descricao sem rotulos (regra da coluna I). Devolve contagens."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill

    if Path(caminho).resolve() == Path(gp.caminho).resolve():
        raise SystemExit("[ERRO] a saída não pode sobrescrever a GP original")
    wb = openpyxl.load_workbook(gp.caminho)  # formulas preservadas (data_only=False)
    ws = wb[gp.aba]
    cab = gp.linha_cabecalho
    c = {k: v + 1 for k, v in gp.colunas.items()}  # 1-based
    ini = max(gp.colunas.values()) + 2  # primeira coluna livre depois de Q -> R
    negrito = Font(bold=True)
    for j, nome in enumerate(COLUNAS_PROPOSTA):
        cel = ws.cell(row=cab, column=ini + j, value=nome)
        cel.font = negrito
        cel.fill = PatternFill("solid", fgColor="FFF2CC")
    cont = {"A_gravados": 0, "linhas_com_proposta": 0, "novas": 0}
    por_linha = {p.registro.gp.linha: p for p in propostas.values()}
    for linha, p in por_linha.items():
        vazio = ws.cell(row=linha, column=c["catmat"]).value in (None, "")
        cont["linhas_com_proposta"] += 1
        desc = descricao_de(p.catmat) if p.catmat else None
        valores = [p.catmat, desc, p.unidade, p.qt, p.nivel, p.aderencia, p.metodo, p.evidencia[:1000],
                   " | ".join(p.alertas)[:1000], f"AUTO-{p.nivel} {data}" if p.nivel == "A" and vazio else
                   f"PROPOSTA-{p.nivel} {data}"]
        for j, v in enumerate(valores):
            ws.cell(row=linha, column=ini + j, value=v)
        if p.nivel == "A" and vazio and p.catmat and p.unidade and p.qt is not None:
            ws.cell(row=linha, column=c["catmat"], value=p.catmat)
            ws.cell(row=linha, column=c["descricao"], value=desc)
            ws.cell(row=linha, column=c["unidade"], value=p.unidade)
            ws.cell(row=linha, column=c["qt"], value=p.qt)
            cont["A_gravados"] += 1
    for nova in novas or []:
        linha = ws.max_row + 1
        for campo, v in nova.items():
            if campo in c:
                ws.cell(row=linha, column=c[campo], value=v)
        cont["novas"] += 1
    Path(caminho).parent.mkdir(parents=True, exist_ok=True)
    wb.save(caminho)
    return cont


def gravar_revisao(caminho: Path, abas: list[tuple[str, list[str], list[list]]], larguras: dict | None = None) -> None:
    """abas = [(nome, cabecalho, linhas)]. Planilha so de leitura/revisao (write-only, rapida)."""
    import openpyxl
    from openpyxl.cell import WriteOnlyCell
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = openpyxl.Workbook(write_only=True)
    for nome, cabecalho, linhas in abas:
        ws = wb.create_sheet(title=nome[:31])
        ws.freeze_panes = "A2"
        larg = (larguras or {}).get(nome, {})
        for j, h in enumerate(cabecalho):
            letra = openpyxl.utils.get_column_letter(j + 1)
            ws.column_dimensions[letra].width = larg.get(h, min(max(len(str(h)) + 2, 12), 60))
        cel = []
        for h in cabecalho:
            x = WriteOnlyCell(ws, value=h)
            x.font = Font(bold=True)
            x.fill = PatternFill("solid", fgColor="DDEBF7")
            x.alignment = Alignment(wrap_text=True, vertical="top")
            cel.append(x)
        ws.append(cel)
        for row in linhas:
            ws.append([_valor(v) for v in row])
        if linhas:
            ws.auto_filter.ref = f"A1:{openpyxl.utils.get_column_letter(len(cabecalho))}{len(linhas) + 1}"
    Path(caminho).parent.mkdir(parents=True, exist_ok=True)
    wb.save(caminho)


def _valor(v):
    if v is None or isinstance(v, (int, float, str)):
        if isinstance(v, str) and len(v) > 32000:
            return v[:32000]
        return v
    if isinstance(v, (list, tuple, set)):
        return " | ".join(str(x) for x in v)
    return str(v)
