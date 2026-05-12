"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronRight, Home } from "lucide-react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Badge } from "@/components/ui/badge";

// ── Mapeamento de segmentos estáticos ────────────────────────────────────────

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  demandas: "Demandas",
  users: "Usuários",
  organizations: "Organizações",
  logs: "Logs",
  settings: "Configurações",
  profile: "Perfil",
  new: "Nova",
  edit: "Editar",
  lixeira: "Lixeira",
  relatorios: "Relatórios",
};

// Regex para detectar IDs (cuid, uuid ou numéricos)
const ID_PATTERN = /^[a-z0-9]{20,}$|^[0-9a-f-]{36}$|^\d+$/i;

function isId(segment: string): boolean {
  return ID_PATTERN.test(segment);
}

function segmentLabel(segment: string, index: number, all: string[]): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];

  // Se parece um ID, mostrar de forma resumida (primeiros 8 chars)
  if (isId(segment)) {
    const parent = all[index - 1];
    if (parent === "demandas") return `#${segment.slice(0, 8)}`;
    if (parent === "users") return `Usuário`;
    return `#${segment.slice(0, 8)}`;
  }

  // Capitalizar
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

interface Crumb {
  label: string;
  href: string;
  isLast: boolean;
}

function generateBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((segment, idx) => ({
    label: segmentLabel(segment, idx, segments),
    href: "/" + segments.slice(0, idx + 1).join("/"),
    isLast: idx === segments.length - 1,
  }));
}

// ── Role badge ────────────────────────────────────────────────────────────────

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

// ── Componente ────────────────────────────────────────────────────────────────

export function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const breadcrumbs = generateBreadcrumbs(pathname);
  const role = (session?.user as any)?.role || "OPERATOR";

  return (
    <div className="h-14 bg-background border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
      {/* Mobile hamburguer + Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm min-w-0">
        <MobileNav />

        {/* Home sempre visível */}
        <Link
          href="/dashboard"
          className="hidden sm:flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Dashboard"
        >
          <Home className="h-3.5 w-3.5" />
        </Link>

        {breadcrumbs.map((crumb) => (
          <div key={crumb.href} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 hidden sm:block" />
            {crumb.isLast ? (
              <span className="text-foreground font-medium text-sm truncate max-w-[160px]" title={crumb.label}>
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors text-sm truncate max-w-[120px] hidden sm:block"
                title={crumb.label}
              >
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Right side: hint de atalho + Role badge */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Dica do atalho de atalhos */}
        <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground/50 select-none">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] border border-border">?</kbd>
          <span>atalhos</span>
        </span>

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
