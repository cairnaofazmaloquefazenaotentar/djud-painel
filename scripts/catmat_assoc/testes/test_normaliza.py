"""Casos reais da GP (secao 6.3 do prompt): parse da apresentacao, doses e contagens.

    python -m pytest scripts/catmat_assoc/testes -q
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from catmat_assoc.fornecimento import qt_embalagem  # noqa: E402
from catmat_assoc.normaliza import (assinatura, acessorios, ingredientes, leituras, nome_base, numero,  # noqa: E402
                                    parse_apresentacao)


def leit(ap_txt: str) -> list[set]:
    a = parse_apresentacao(ap_txt)
    return [leituras(d, a) for d in a.doses]


def tem(leituras_: set, unidade: str, valor: float) -> bool:
    return any(u == unidade and abs(v - valor) <= 0.02 * max(abs(v), abs(valor)) for u, v in leituras_)


def test_numero():
    assert numero("1,5") == 1.5
    assert numero("50.000") == 50000
    assert numero("0.3") == 0.3
    assert numero("270.22") == 270.22
    assert numero("1.234,56") == 1234.56


def test_creme_associacao_bisnaga():
    a = parse_apresentacao("10 MG/G + 0,443 MG/G CREM DERM CT BG AL X 40 G")
    assert len(a.doses) == 2
    assert a.forma.base == "CREME"
    assert a.primario.tipo == "BISNAGA" and a.volume == 40 and a.volume_un == "G"
    assert qt_embalagem(a, "BISNAGA 40,00 G") == 1


def test_seringa_preenchida():
    a = parse_apresentacao("125 MG/ML SOL INJ CT 1 SER PREENC VD TRANS + DISPOSITIVO ULTRASAFE PASSIVE + EXTENSORES DE APOIO")
    assert a.forma.base == "SOLUCAO" and "INJ" in a.forma.vias
    assert a.primario.tipo == "SERINGA"
    assert "SER" in a.acessorios
    assert qt_embalagem(a, "SERINGA") == 1


def test_capsula_lib_retard():
    a = parse_apresentacao("20 MG CAP DURA LIB RETARD CT BL AL PVC TRANS X 14")
    assert a.forma.base == "CAPSULA" and a.forma.lib == "RETARD"
    assert qt_embalagem(a, "CÁPSULA") == 14


def test_tres_doses_entre_parenteses():
    a = parse_apresentacao("(300 + 35 + 50) MG COM REV CT BL AL PLAS PVC/PVDC TRANS X 30")
    assert [d.valor for d in a.doses] == [300, 35, 50]
    assert a.forma.base == "COMPRIMIDO"
    assert qt_embalagem(a, "COMPRIMIDO") == 30


def test_meropenem_bolsa_sistema_fechado():
    ap = "1000 MG PO SOL INJ IV CT 10 FA VD II TRANS + DIL 10 BOLS PLAS TRANS SIST FECH X 100 ML"
    ac = acessorios(ap)
    assert {"DIL", "BOLS", "SIST FECH"} <= ac
    # sem o diluente a assinatura+acessorios muda (288298 x 268488)
    assert ac != acessorios("1000 MG PO SOL INJ IV CT 10 FA VD II TRANS")


def test_leitura_total_carboplatina():
    (l,) = leit("10 MG/ML SOL DIL INFUS IV CT FA VD AMB X 45 ML")
    assert tem(l, "MG", 450) and tem(l, "MG/ML", 10)


def test_adalimumabe_0_4_ml_40_mg():
    a = parse_apresentacao("100 MG/ML SOL INJ CT 2 BL X SER PREENC VD TRANS X 0,4 ML + AGU + ENV LEN ÁLCOOL")
    (l,) = [leituras(d, a) for d in a.doses]
    assert tem(l, "MG", 40)
    assert qt_embalagem(a, "SERINGA") == 2


def test_adalimumabe_50_mg_ml_e_20_mg_nao_40():
    (l,) = leit("50 MG/ML SOL INJ CT SER PREENC VD TRANS X 0,4 ML + AGU")
    assert tem(l, "MG", 20)
    assert not tem(l, "MG", 40)


def test_po_suspensao_oral_com_xa0():
    a = parse_apresentacao("250 MG/5 ML PO SUS OR CT FR VD TRANS X 150 ML\xa0")
    (l,) = [leituras(d, a) for d in a.doses]
    assert tem(l, "MG/ML", 50)
    assert a.primario.tipo == "FRASCO" and a.volume == 150
    assert qt_embalagem(a, "FRASCO 150,00 ML") == 1


def test_milhar_ui():
    a = parse_apresentacao("50.000 UI CAP MOLE CT BL AL PLAS OPC X 4")
    assert a.doses[0].valor == 50000 and a.doses[0].unidade == "UI"
    assert qt_embalagem(a, "CÁPSULA") == 4


def test_soro_fisiologico_ampola():
    a = parse_apresentacao("9 MG/ML SOL INJ IV CX 200 AMP PLAS TRANS X 10 ML")
    (l,) = [leituras(d, a) for d in a.doses]
    assert tem(l, "PCT", 0.9)
    assert a.primario.tipo == "AMPOLA" and a.volume == 10
    assert qt_embalagem(a, "AMPOLA 10,00 ML") == 200


def test_kit_duas_doses():
    a = parse_apresentacao("100 MG COM REV + 200 MG COM REV CT BL AL PLAS PVC/PCTFE TRANS X 14 + 14")
    assert a.kit
    assert [d.valor for d in a.doses] == [100, 200]
    assert a.unidades_kit == [14, 14]
    assert qt_embalagem(a, "COMPRIMIDO") == 28


def test_gramatura_do_blister_nao_e_quantidade():
    a = parse_apresentacao("20 MG COM REV CT BL AL PLAS PVDC 40 TRANS X 30")
    assert qt_embalagem(a, "COMPRIMIDO") == 30


def test_granulado_envelope_200():
    a = parse_apresentacao("40 MG/G GRAN CT 15 ENV AL/PLAS PE X 5 G")
    (l,) = [leituras(d, a) for d in a.doses]
    assert tem(l, "MG", 200)
    assert a.primario.tipo == "ENVELOPE"
    assert qt_embalagem(a, "ENVELOPE") == 15


def test_granulado_envelope_600():
    (l,) = leit("120 MG/G GRAN CT 16 ENV AL/PLAS X 5 G")
    assert tem(l, "MG", 600)


def test_grupo_sem_parenteses():
    a = parse_apresentacao("160 + 12,5 MG COM REV CT BL AL/AL X 10")
    assert [d.valor for d in a.doses] == [160, 12.5]
    a = parse_apresentacao("80 MG + 12,5 COM REV CT BL AL AL X 30")
    assert [d.valor for d in a.doses] == [80, 12.5]


def test_assinatura_e_ingredientes():
    assert ingredientes("CLOTRIMAZOL;21-ACETATO DE DEXAMETASONA") == ("21-ACETATO DE DEXAMETASONA", "CLOTRIMAZOL")
    s = assinatura("PARACETAMOL;FOSFATO DE CODEÍNA HEMI-HIDRATADO", "(500+30) MG COM CT BL AL PLAS X 12")
    assert s == assinatura("FOSFATO DE CODEINA HEMI-HIDRATADO;PARACETAMOL", "(500 + 30) MG COM CT BL X 24")
    assert s.endswith("| (500 + 30) MG COM")


def test_nome_base():
    assert nome_base("HEMIFUMARATO DE QUETIAPINA") == "QUETIAPINA"
    assert nome_base("MONTELUCASTE DE SÓDIO") == "MONTELUCASTE"
    assert nome_base("CEFTRIAXONA DISSÓDICA HEMIEPTAIDRATADA") == "CEFTRIAXONA"
    assert nome_base("BISSULFATO DE CLOPIDOGREL") == "CLOPIDOGREL"
    assert nome_base("DICLOFENACO DIETILAMÔNIO") == "DICLOFENACO"
    assert nome_base("CARBONATO DE CÁLCIO") == "CARBONATO DE CALCIO"  # sal inorganico: nao vira "CALCIO"
