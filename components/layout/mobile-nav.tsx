"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Menu,
  Scale,
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  History,
  Settings,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ── Nav items ─────────────────────────────────────────────────────────────────

const navItems = [
  { label: "Dashboard",    href: "/dashboard",     icon: LayoutDashboard },
  { label: "Demandas",     href: "/demandas",      icon: FileText        },
  { label: "Usuários",     href: "/users",         icon: Users           },
  { label: "Organizações", href: "/organizations", icon: Building2       },
  { label: "Logs",         href: "/logs",          icon: History         },
  { label: "Configurações",href: "/settings/profile", icon: Settings    },
];

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  OPERATOR: "Operador",
};

const roleVariants: Record<string, string> = {
  ADMIN:    "bg-primary/10 text-primary border-primary/20",
  MANAGER:  "bg-amber-500/10 text-amber-700 border-amber-500/20",
  OPERATOR: "bg-muted text-muted-foreground border-border",
};

// ── Componente ─────────────────────────────────────────────────────────────────

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  const userName  = session?.user?.name  ?? "Usuário";
  const userEmail = session?.user?.email ?? "";
  const userRole  = (session?.user as any)?.role ?? "OPERATOR";

  const initials = userName
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="md:hidden h-9 w-9 p-0">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar text-sidebar-foreground border-r-sidebar-border">

        {/* ── Branding ─────────────────────────────────────────────────────── */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary">
            <Scale className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <span className="font-semibold text-sidebar-foreground">DJUD</span>
        </div>

        {/* ── Navigation ───────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-auto p-3 space-y-0.5">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "relative flex h-9 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/15"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-active-bar"
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sidebar-primary-foreground/70"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <Separator className="bg-sidebar-border" />

        {/* ── User footer ──────────────────────────────────────────────────── */}
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{userEmail}</p>
            </div>
          </div>
          <Badge
            className={cn(
              "w-full justify-center text-xs border",
              roleVariants[userRole] ?? roleVariants.OPERATOR
            )}
            variant="outline"
          >
            {roleLabels[userRole] ?? userRole}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 h-9"
            onClick={() => { setOpen(false); signOut({ callbackUrl: "/login" }); }}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  );
}
