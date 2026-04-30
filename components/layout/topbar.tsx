"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { ChevronRight, LogOut, User, Settings } from "lucide-react";
import { useState } from "react";

const breadcrumbLabels: Record<string, string> = {
  dashboard: "Dashboard",
  demandas: "Demandas",
  users: "Usuários",
  organizations: "Organizações",
  logs: "Logs",
  settings: "Configurações",
  profile: "Perfil",
};

function generateBreadcrumbs(pathname: string) {
  const segments = pathname
    .split("/")
    .filter((s) => s && s !== "dashboard")
    .slice(0, 2);

  return segments.map((segment, idx) => ({
    label: breadcrumbLabels[segment] || segment,
    href: "/" + segments.slice(0, idx + 1).join("/"),
  }));
}

export function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showDropdown, setShowDropdown] = useState(false);

  const breadcrumbs = generateBreadcrumbs(pathname);

  return (
    <div className="h-16 bg-background border-b border-border flex items-center justify-between px-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground font-medium">Dashboard</span>
        {breadcrumbs.map((crumb) => (
          <div key={crumb.href} className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">{crumb.label}</span>
          </div>
        ))}
      </div>

      {/* Right side: Avatar + Dropdown */}
      <div className="flex items-center gap-4">
        {/* User Info */}
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-foreground">
            {session?.user?.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {(session?.user as any)?.role || "OPERATOR"}
          </p>
        </div>

        {/* Avatar Button */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
          >
            {session?.user?.name?.charAt(0).toUpperCase() || "U"}
          </button>

          {/* Dropdown Menu */}
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-50">
              {/* Header */}
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-foreground">
                  {session?.user?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session?.user?.email}
                </p>
              </div>

              {/* Menu Items */}
              <div className="py-2">
                <a
                  href="/settings/profile"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
                >
                  <User className="h-4 w-4" />
                  Perfil
                </a>
                <a
                  href="/settings/profile"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  Configurações
                </a>
              </div>

              {/* Logout */}
              <div className="border-t border-border py-2">
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
