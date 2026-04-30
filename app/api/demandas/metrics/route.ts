import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const prioridade = searchParams.get("prioridade");
    const organizacao = searchParams.get("organizacao");
    const busca = searchParams.get("busca");
    const dataInicio = searchParams.get("dataInicio");
    const dataFim = searchParams.get("dataFim");
    const uf = searchParams.get("ufResidencia");

    const where: any = {};

    if (status) where.status = status;
    if (prioridade) where.prioridade = prioridade;
    if (organizacao) where.organizacaoId = organizacao;
    if (uf) where.ufResidencia = uf;

    if (dataInicio || dataFim) {
      where.criadoEm = {};
      if (dataInicio) where.criadoEm.gte = new Date(dataInicio);
      if (dataFim) where.criadoEm.lte = new Date(dataFim);
    }

    if (busca) {
      where.OR = [
        { numero: { contains: busca, mode: "insensitive" } },
        { titulo: { contains: busca, mode: "insensitive" } },
        { descricao: { contains: busca, mode: "insensitive" } },
      ];
    }

    const [
      total,
      ativa,
      resolvida,
      cancelada,
      pendente,
      alta,
      critica,
      demandas,
    ] = await Promise.all([
      db.demanda.count({ where }),
      db.demanda.count({ where: { ...where, status: "ATIVA" } }),
      db.demanda.count({ where: { ...where, status: "RESOLVIDA" } }),
      db.demanda.count({ where: { ...where, status: "CANCELADA" } }),
      db.demanda.count({ where: { ...where, status: "PENDENTE" } }),
      db.demanda.count({ where: { ...where, prioridade: "ALTA" } }),
      db.demanda.count({ where: { ...where, prioridade: "CRITICA" } }),
      db.demanda.findMany({
        where,
        select: {
          id: true,
          status: true,
          prioridade: true,
          criadoEm: true,
          organizacaoId: true,
          ufResidencia: true,
        },
        take: 1000,
      }),
    ]);

    // Agregar por status
    const porStatus = [
      { status: "ATIVA", count: ativa },
      { status: "RESOLVIDA", count: resolvida },
      { status: "CANCELADA", count: cancelada },
      { status: "PENDENTE", count: pendente },
    ].filter((s) => s.count > 0);

    // Agregar por prioridade
    const prioridades = new Map<string, number>();
    demandas.forEach((d: any) => {
      if (d.prioridade) {
        prioridades.set(d.prioridade, (prioridades.get(d.prioridade) || 0) + 1);
      }
    });
    const porPrioridade = Array.from(prioridades, ([prioridade, count]) => ({
      prioridade,
      count,
    }));

    // Agregar por mês
    const porMes = new Map<string, number>();
    demandas.forEach((d: any) => {
      const mes = d.criadoEm.toLocaleString("pt-BR", {
        year: "numeric",
        month: "2-digit",
      });
      porMes.set(mes, (porMes.get(mes) || 0) + 1);
    });
    const porMesArray = Array.from(porMes, ([mes, count]) => ({
      mes,
      count,
    })).sort((a, b) => a.mes.localeCompare(b.mes));

    // Agregar por organização
    const porOrganizacao = new Map<string, number>();
    demandas.forEach((d: any) => {
      const org = d.organizacaoId || "Não especificada";
      porOrganizacao.set(org, (porOrganizacao.get(org) || 0) + 1);
    });
    const orgs = await db.organization.findMany({
      select: { id: true, name: true },
    });
    const orgMap = new Map(orgs.map((o: any) => [o.id, o.name]));

    const porOrganizacaoArray = Array.from(porOrganizacao, ([orgId, count]) => ({
      organizacao: orgMap.get(orgId) || orgId || "Não especificada",
      count,
    }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Evolução ao longo do tempo (últimos 12 meses)
    const evolucao: Array<{
      data: string;
      ativa: number;
      resolvida: number;
      pendente: number;
    }> = [];
    const hoje = new Date();
    for (let i = 11; i >= 0; i--) {
      const mes = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const mesProximo = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1);

      const ativaCount = await db.demanda.count({
        where: {
          ...where,
          status: "ATIVA",
          criadoEm: { gte: mes, lt: mesProximo },
        },
      });

      const resolvidaCount = await db.demanda.count({
        where: {
          ...where,
          status: "RESOLVIDA",
          criadoEm: { gte: mes, lt: mesProximo },
        },
      });

      const pendenteCount = await db.demanda.count({
        where: {
          ...where,
          status: "PENDENTE",
          criadoEm: { gte: mes, lt: mesProximo },
        },
      });

      evolucao.push({
        data: mes.toLocaleString("pt-BR", { month: "short", year: "2-digit" }),
        ativa: ativaCount,
        resolvida: resolvidaCount,
        pendente: pendenteCount,
      });
    }

    return NextResponse.json({
      total,
      ativa,
      resolvida,
      cancelada,
      pendente,
      alta,
      critica,
      porStatus,
      porPrioridade,
      porMes: porMesArray,
      porOrganizacao: porOrganizacaoArray,
      evolucao,
    });
  } catch (error) {
    console.error("[Dashboard Metrics Error]", error);
    return NextResponse.json(
      { error: "Erro ao calcular métricas" },
      { status: 500 }
    );
  }
}
