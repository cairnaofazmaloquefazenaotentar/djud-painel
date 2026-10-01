"""
Associador Registro ANVISA x CATMAT da Grande Padrao (GP) da CMED.

Pacote usado por scripts/associar_catmat.py. Le a GP, a lista mensal da CMED,
o catalogo CATMAT ("Catmats 11-07.CSV") e a extracao de unidades de
fornecimento; propoe CATMAT + Descricao + Unidade de fornecimento + Qt_Embal
para cada registro sem CATMAT, com nivel de confianca (A/B/C/D) e evidencia.

Modulos:
  leitura      leitura dos quatro arquivos (cabecalho pelo conteudo)
  normaliza    texto, ingredientes, assinatura, acessorios, parse da apresentacao
  catalogo     parse do CATMAT (PDM, atributos pelo sentido, doses, forma, flags)
  pontes       dicionarios aprendidos da GP (ingrediente -> PDM, forma -> unidade)
  precedente   gemeos e irmaos (chaves hierarquicas)
  candidatos   candidatos do catalogo (recall) + escada R14
  guardas      verificacoes G1-G7
  fornecimento unidade de fornecimento + Qt_Embal
  adjudicacao  pacotes de evidencias + decisoes do agente
  saida        copia da GP + planilha de revisao
  backtest     validacao cruzada por raiz e por substancia
"""
