"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigationItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Painel analítico",
  },
  {
    label: "Demandas",
    href: "/demandas",
    icon: FileText,
    description: "Gestão de demandas",
  },
  {
    label: "Usuários",
    href: "/users",
    icon: Users,
    description: "Gestão de acesso",
  },
  {
    label: "Organizações",
    href: "/organizations",
    icon: Building2,
    description: "Unidades",
  },
  {
    label: "Logs",
    href: "/logs",
    icon: History,
    description: "Auditoria",
  },
  {
    label: "Configurações",
    href: "/settings/profile",
    icon: Settings,
    description: "Perfil e permissões",
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 flex flex-col shrink-0",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo / Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
              <Scale className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-sidebar-foreground">DJUD</span>
              <span className="text-[10px] text-sidebar-foreground/50 font-medium uppercase tracking-wider">
                Painel de Saúde
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Scale className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-md hover:bg-sidebar-accent/20 transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/15"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn(
                "h-[18px] w-[18px] flex-shrink-0 transition-colors",
                isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"
              )} />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium truncate leading-none mb-0.5",
                    isActive ? "text-sidebar-primary-foreground" : ""
                  )}>
                    {item.label}
                  </p>
                  <p className={cn(
                    "text-[11px] truncate leading-none",
                    isActive ? "text-sidebar-primary-foreground/70" : "text-sidebar-foreground/40"
                  )}>
                    {item.description}
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle (when collapsed) + Footer */}
      <div className="border-t border-sidebar-border p-2">
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex items-center justify-center p-2 rounded-md hover:bg-sidebar-accent/20 transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <div className="px-3 py-2">
            <p className="text-[10px] text-sidebar-foreground/30 font-medium uppercase tracking-wider">
              v0.1.0 · Sprint 8
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
