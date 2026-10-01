"""Parse do catalogo com rotulos irregulares (secao 6.3, ultimo paragrafo) e regra da coluna I."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from catmat_assoc.catalogo import montar_item, sem_rotulos  # noqa: E402
from catmat_assoc.normaliza import leituras  # noqa: E402


def test_sem_rotulos_coluna_i():
    d = "CLOTRIMAZOL, APRESENTAÇÃO: ASSOCIADO COM DEXAMETASONA ACETATO , DOSAGEM: 10 MG + 0,4 MG/G, FORMA FARMACÊUTICA: CREME "
    assert sem_rotulos(d) == "CLOTRIMAZOL, ASSOCIADO COM DEXAMETASONA ACETATO, 10 MG + 0,4 MG/G, CREME"


def test_concentracao_sem_til():
    it = montar_item(448653, "CETRORRELIX, COMPOSIÇÃO: SAL ACETATO , CONCENTRAÇAO: 0,25 MG, FORMA FARMACÊUTICA: PÓ LIÓFILO P/ INJETÁVEL , CARACTERISTICA ADICIONAL: C/ CONJUNTO DE APLICAÇÃO ")
    assert it.pdm == "CETRORRELIX"
    assert it.doses[0].valor == 0.25
    assert it.forma.base == "PO" and "INJ" in it.forma.vias and "LIOF" in it.forma.mods
    assert "APLIC" in it.acessorios


def test_rotulo_com_asterisco():
    it = montar_item(1, "X, CONCENTRAÇÃO*: 40 MG/ML, FORMA FARMACÊUTICA*: SOLUÇÃO INJETÁVEL ")
    assert it.doses[0].den == "ML" and it.forma.base == "SOLUCAO" and "INJ" in it.forma.vias


def test_forma_farmaceutica_sem_acento():
    it = montar_item(628716, "ACICLOVIR, CONCENTRAÇÃO: 40 MG/ML, FORMA FARMACEUTICA: SUSPENSÃO ORAL ")
    assert it.forma.base == "SUSPENSAO" and "ORAL" in it.forma.vias


def test_indicacao_locao():
    it = montar_item(2, "PERMETRINA, DOSAGEM: 10 MG/ML, INDICAÇÃO: LOÇÃO ")
    assert it.forma.base == "LOCAO"


def test_uso_injetavel():
    it = montar_item(268160, "OMEPRAZOL, CONCENTRAÇÃO: 40 MG, USO: INJETÁVEL ")
    assert "INJ" in it.forma.vias and it.familia == "INJ"


def test_dosagem_comprimido():
    it = montar_item(3, "X, DOSAGEM COMPRIMIDO: 750 MG")
    assert it.doses[0].valor == 750


def test_associacao_conta_componentes():
    it = montar_item(628743, "LIDOCAÍNA CLORIDRATO, COMPOSIÇÃO: ASSOCIADA COM TRIBENÓSIDO , CONCENTRAÇÃO: 20 MG/G + 50 MG/G, FORMA FARMACÊUTICA: CREME ")
    assert it.n_componentes == 2
    assert it.forma.base == "CREME"


def test_dose_equivalente_alternativa():
    it = montar_item(362059, "RIVASTIGMINA, CONCENTRAÇÃO: 27 MG EQUIVALENTE A 13,3 MG/DIA , FORMA FARMACEUTICA: ADESIVO TRANSDÉRMICO ")
    assert [d.valor for d in it.doses] == [27]
    assert it.n_componentes == 1


def test_porcentagem_vale_mg_ml():
    it = montar_item(4, "CLORETO DE SÓDIO, CONCENTRAÇAO: 0,9 % , FORMA FARMACEUTICA: SOLUÇÃO NASAL ")
    assert ("MG/ML", 9.0) in leituras(it.doses[0])


def test_flags():
    assert "manipulado" in montar_item(5, "OMEPRAZOL, CONCENTRAÇÃO: 2 MG/ML, FORMA FARMACÊUTICA: SUSPENSÃO ORAL , CARACTERÍSTICA ADICIONAL: FORMULAÇÃO ESPECIALMENTE MANIPULADA ").flags
    assert "veterinario" in montar_item(6, "OMEPRAZOL, CONCENTRAÇÃO: 10 MG, USO: USO VETERINÁRIO ").flags
    assert "insumo" in montar_item(7, "OMEPRAZOL, ASPECTO FÍSICO: PÓ CRISTALINO BRANCO , FÓRMULA QUÍMICA: C17H19N3O3S ").flags
    agua = montar_item(352317, "ÁGUA DESTILADA, ASPECTO FÍSICO: ESTÉRIL E APIROGÊNICA , TIPO EMBALAGEM: EM SISTEMA FECHADO ")
    assert "insumo" not in agua.flags  # filtro suave: agua esteril e medicamento
