import { Session } from "next-auth";

export type UserRole = "ADMIN" | "MANAGER" | "OPERATOR";

// Mapeamento de permissões por role
const rolePermissions: Record<UserRole, string[]> = {
  ADMIN: [
    // Dashboard
    "dashboard:read",
    // Demandas
    "demandas:read",
    "demandas:write",
    "demandas:delete",
    // Users
    "users:read",
    "users:write",
    "users:delete",
    // Organizations
    "organizations:read",
    "organizations:write",
    "organizations:delete",
    // Roles & Permissions
    "roles:read",
    "roles:write",
    "permissions:read",
    "permissions:write",
    // Audit logs
    "audit:read",
    "audit:export",
    // Data source
    "data-source:read",
    "data-source:write",
    // Export
    "export:csv",
    "export:xlsx",
    "export:png",
  ],
  MANAGER: [
    // Dashboard
    "dashboard:read",
    // Demandas
    "demandas:read",
    "demandas:write",
    "demandas:delete",
    // Users (read-only)
    "users:read",
    // Audit logs
    "audit:read",
    // Export
    "export:csv",
    "export:xlsx",
    "export:png",
  ],
  OPERATOR: [
    // Dashboard
    "dashboard:read",
    // Demandas (read-only)
    "demandas:read",
  ],
};

export function hasRole(session: Session | null, role: UserRole): boolean {
  if (!session?.user) return false;
  return (session.user as any).role === role;
}

export function hasPermission(session: Session | null, action: string): boolean {
  if (!session?.user) return false;

  const userRole = (session.user as any).role as UserRole;
  const permissions = rolePermissions[userRole] || [];

  return permissions.includes(action);
}

export function requireRole(role: UserRole) {
  return (session: Session | null) => {
    if (!session?.user) {
      throw new Error("Unauthorized: No session");
    }

    const userRole = (session.user as any).role as UserRole;
    if (userRole !== role && role !== "OPERATOR") {
      // Admin pode fazer tudo
      if (userRole !== "ADMIN") {
        throw new Error(`Forbidden: Required role ${role}`);
      }
    }

    return true;
  };
}

export const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  OPERATOR: "OPERATOR",
} as const;
