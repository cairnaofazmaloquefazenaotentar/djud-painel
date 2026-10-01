"""Guardas G2-G5 e grau R14 com casos reais (sem depender das planilhas)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from catmat_assoc.catalogo import montar_item  # noqa: E402
from catmat_assoc.guardas import avaliar  # noqa: E402
from catmat_assoc.leitura import LinhaGP  # noqa: E402
from catmat_assoc.pontes import Pontes  # noqa: E402
from catmat_assoc.registro import montar  # noqa: E402


def reg(substancia: str, apresentacao: str, registro: str = "1000000000001"):
    l = LinhaGP(linha=10, n=1, registro=registro, gen=None, icms=None, catmat_bruto=None, descricao=None, unidade=None,
                qt=None, xxx=None, substancia=substancia, produto="", apresentacao=apresentacao, cnpj="", fabricante="")
    return montar(l, None)


def av(substancia, apresentacao, descricao):
    return avaliar(reg(substancia, apresentacao), montar_item(1, descricao), Pontes())


def test_dose_total_por_volume_adalimumabe():
    a = av("ADALIMUMABE", "50 MG/ML SOL INJ CT SER PREENC VD TRANS X 0,4 ML + AGU",
           "ADALIMUMABE, CONCENTRAÇÃO: 40 MG, APRESENTAÇÃO: SOLUÇÃO INJETÁVEL ")
    assert a.guarda("G3").ok is False  # 0,4 mL x 50 mg/mL = 20 mg, nao 40 mg
    b = av("ADALIMUMABE", "100 MG/ML SOL INJ CT 2 BL X SER PREENC VD TRANS X 0,4 ML + AGU",
           "ADALIMUMABE, CONCENTRAÇÃO: 40 MG, APRESENTAÇÃO: SOLUÇÃO INJETÁVEL ")
    assert b.guarda("G3").ok is True


def test_associacao_x_monodroga():
    a = av("DIPROPIONATO DE BETAMETASONA;SULFATO DE GENTAMICINA", "0,5 MG/G + 1 MG/G CREM DERM CT BG AL X 30 G",
           "GENTAMICINA, CONCENTRAÇÃO: 1 MG/G, FORMA FARMACÊUTICA: CREME ")
    assert a.guarda("G2").ok is False


def test_associacao_em_ordem_invertida():
    a = av("TRIBENOSÍDEO;CLORIDRATO DE LIDOCAÍNA", "50 MG/G + 20 MG/G CREM CT BG AL X 30 G",
           "LIDOCAÍNA CLORIDRATO, COMPOSIÇÃO: ASSOCIADA COM TRIBENÓSIDO , CONCENTRAÇÃO: 20 MG/G + 50 MG/G, "
           "FORMA FARMACÊUTICA: CREME ")
    assert a.guarda("G2").ok is not False and a.guarda("G3").ok is True


def test_sal_diferente_reprova():
    a = av("DICLOFENACO SÓDICO", "25 MG/ML SOL INJ CT 100 AMP VD AMB X 3ML",
           "DICLOFENACO, APRESENTAÇÃO: SAL POTÁSSICO , DOSAGEM: 25MG/ML , USO: SOLUÇÃO INJETÁVEL ")
    assert a.guarda("G2").ok is False


def test_comprimido_x_capsula_pela_unidade():
    from catmat_assoc.leitura import UnidadeOficial
    it = montar_item(480012, "NIRAPARIBE, CONCENTRAÇÃO: 100 MG")
    it.situacao = "Ativo"
    it.unidades = [UnidadeOficial("CÁPSULA", "CÁPSULA", None, "")]
    a = avaliar(reg("TOSILATO DE NIRAPARIBE MONOIDRATADO", "100 MG COM REV CT BL AL AL X 56"), it, Pontes())
    assert a.guarda("G4").ok is False


def test_liberacao_retardada_aproximada():
    a = av("OMEPRAZOL", "20 MG CAP DURA LIB RETARD CT BL AL PLAS TRANS X 28",
           "OMEPRAZOL, CONCENTRAÇÃO: 20 MG, CARACTERÍSTICA ADICIONAL: LIBERAÇÃO PROLONGADA ")
    assert a.guarda("G4").ok is True and a.grau == "aproximado"


def test_kit_nao_casa_com_dose_unica():
    a = av("CENOBAMATO", "50 MG COM REV + 200 MG COM REV CT BL AL PLAS PVC/PCTFE TRANS X 14 + 14",
           "CENOBAMATO, CONCENTRAÇÃO: 50 MG")
    assert a.guarda("G3").ok is False  # R6


def test_sistema_fechado_exigido():
    a = av("MEROPENÉM TRI-HIDRATADO", "1 G PO SOL INJ CT FA VD TRANS",
           "MEROPENEM, DOSAGEM: 1 G , APRESENTAÇÃO: DILUENTE CLORETO DE SÓDIO 0,9%, SISTEMA FECHADO , INDICAÇÃO: INJETÁVEL ")
    assert a.guarda("G5").ok is False


def test_vacina_com_componente_a_mais():
    a = av("VACINA ADSORVIDA DIFTERIA, TÉTANO, PERTUSSIS E HAEMOPHILUS INFLUENZAE B (CONJUGADA)",
           "PO LIOF INJ 10 FA VD INC + SUS INJ CT BL 10 FA VD INC X 5ML",
           "VACINA, COMPOSIÇÃO: DIFTERIA, TÉTANO, PERTUSSIS, HEPATITE B , OUTROS COMPONENTES: POLIOMIELITE 1, 2 E 3 ")
    assert a.guarda("G2").ok is False


def test_categoria_nao_casa_pelo_nome_da_categoria():
    a = av("VACINA DENGUE 1, 2, 3 E 4 (ATENUADA)", "PO LIOF SOL INJ SC CT 20 FA VD TRANS + DIL",
           "VACINA, COMPOSIÇÃO: BCG , FORMA FARMACEUTICA: PÓ LIÓFILO P/ INJETÁVEL + DILUENTE ")
    assert a.guarda("G2").ok is False
