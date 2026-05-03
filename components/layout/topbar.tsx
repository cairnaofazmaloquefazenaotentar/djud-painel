"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { ChevronRight, LogOut, User, Settings } from "lucide-react";
import Link from "next/link";
import { MobileNav } from "@/components/layout/mobile-nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

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

      {/* Right side: Role badge + Avatar Dropdown */}
      <div className="flex items-center gap-3">
        {/* Role badge */}
        <Badge
          className={`hidden sm:inline-flex text-xs border ${roleVariants[role] ?? roleVariants.OPERATOR}`}
          variant="outline"
        >
          {roleLabels[role] ?? role}
        </Badge>

        {/* Avatar + Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full">
              <Avatar className="h-9 w-9 cursor-pointer bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">
                {session?.user?.name}
              </span>
              <span className="text-xs font-normal text-muted-foreground truncate">
                {session?.user?.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile" className="cursor-pointer">
                <User className="h-4 w-4 mr-2" />
                Meu Perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/profile" className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" />
                Configurações
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
