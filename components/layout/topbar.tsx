"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronRight } from "lucide-react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Badge } from "@/components/ui/badge";

const breadcrumbLabels: Record<string, string> = {
  dashboard: "Dashboard",
  demandas: "Demandas",
  users: "Usuários",
  organizations: "Organizações",
  logs: "Logs",
  settings: "Configurações",
  profile: "Perfil",
  new: "Novo",
  edit: "Editar",
};

function generateBreadcrumbs(pathname: string) {
  // Preserva "dashboard" na lista para que o breadcrumb seja exibido
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .slice(0, 2);

  return segments.map((segment, idx) => ({
    label: breadcrumbLabels[segment] || segment,
    href: "/" + segments.slice(0, idx + 1).join("/"),
  }));
}

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  OPERATOR: "Operador",
};

const roleVariants: Record<string, string> = {
  ADMIN: "bg-primary/10 text-primary border-primary/20",
  MANAGER: "bg-secondary text-secondary-foreground border-border",
  OPERATOR: "bg-muted text-muted-foreground border-border",
};

export function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const breadcrumbs = generateBreadcrumbs(pathname);
  const role = (session?.user as any)?.role || "OPERATOR";

  return (
    <div className="h-16 bg-background border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
      {/* Hamburguer (mobile) + Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm">
        <MobileNav />
        <span className="text-muted-foreground font-medium hidden sm:inline">DJUD</span>
        {breadcrumbs.map((crumb) => (
          <div key={crumb.href} className="flex items-center gap-2">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 hidden sm:block" />
            <span className="text-foreground font-medium">{crumb.label}</span>
          </div>
        ))}
      </div>

      {/* Right side: Role badge only */}
      <div className="flex items-center gap-3">
        {/* Role badge */}
        <Badge
          className={`hidden sm:inline-flex text-xs border ${roleVariants[role] ?? roleVariants.OPERATOR}`}
          variant="outline"
        >
          {roleLabels[role] ?? role}
        </Badge>
      </div>
    </div>
  );
}
