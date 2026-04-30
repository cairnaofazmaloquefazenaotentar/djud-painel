import { db } from "./db";

export interface CreateAuditLogInput {
  userId: string;
  action: "CREATE" | "READ" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "EXPORT" | "IMPORT" | "create" | "read" | "update" | "delete" | "login" | "logout" | "export" | "import";
  entity: string; // e.g., "Demanda", "User", "Organization"
  entityId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
}

export async function createAuditLog({
  userId,
  action,
  entity,
  entityId,
  changes,
  metadata,
}: CreateAuditLogInput) {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action: action.toUpperCase(),
        entity,
        entityId,
        changes: changes || metadata,
      },
    });
  } catch (error) {
    // Log error but don't throw — auditoria não deve quebrar a aplicação
    console.error("[AuditLog Error]", error);
  }
}

export async function getAuditLogs({
  userId,
  action,
  entity,
  startDate,
  endDate,
  limit = 50,
  offset = 0,
}: {
  userId?: string;
  action?: string;
  entity?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const logs = await db.auditLog.findMany({
    where: {
      ...(userId && { userId }),
      ...(action && { action }),
      ...(entity && { entity }),
      ...(startDate && { createdAt: { gte: startDate } }),
      ...(endDate && { createdAt: { lte: endDate } }),
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    skip: offset,
  });

  const total = await db.auditLog.count({
    where: {
      ...(userId && { userId }),
      ...(action && { action }),
      ...(entity && { entity }),
      ...(startDate && { createdAt: { gte: startDate } }),
      ...(endDate && { createdAt: { lte: endDate } }),
    },
  });

  return {
    logs,
    total,
    hasMore: offset + logs.length < total,
  };
}
