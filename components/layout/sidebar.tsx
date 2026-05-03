"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  ChevronsUpDown,
  FileClock,
  LayoutDashboard,
  LogOut,
  Scale,
  Settings,
  Building2,
  Users,
  History,
  FileText,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useSession, signOut } from "next-auth/react";

// ── Framer Motion variants ────────────────────────────────────────────────────

const sidebarVariants = {
  open: { width: "15rem" },
  closed: { width: "3.05rem" },
};

const contentVariants = {
  open: { display: "block", opacity: 1 },
  closed: { display: "block", opacity: 1 },
};

const labelVariants = {
  open: {
    x: 0,
    opacity: 1,
    transition: { x: { stiffness: 1000, velocity: -100 } },
  },
  closed: {
    x: -20,
    opacity: 0,
    transition: { x: { stiffness: 100 } },
  },
};

const transitionProps = {
  type: "tween" as const,
  ease: "easeOut" as const,
  duration: 0.2,
};

const staggerVariants = {
  open: {
    transition: { staggerChildren: 0.03, delayChildren: 0.02 },
  },
};

// ── Navigation items ──────────────────────────────────────────────────────────

const primaryNav = [
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
];

const secondaryNav = [
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
];

const tertiaryNav = [
  {
    label: "Logs",
    href: "/logs",
    icon: History,
    description: "Auditoria",
    badge: null,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const pathname = usePathname();
  const { data: session } = useSession();

  const userName = session?.user?.name ?? "Usuário";
  const userEmail = session?.user?.email ?? "";
  const userRole = (session?.user as any)?.role ?? "OPERATOR";

  const initials = userName
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel: Record<string, string> = {
    ADMIN: "Admin",
    MANAGER: "Gestor",
    OPERATOR: "Operador",
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <motion.div
      className="sidebar fixed left-0 z-40 h-full shrink-0 border-r"
      initial={isCollapsed ? "closed" : "open"}
      animate={isCollapsed ? "closed" : "open"}
      variants={sidebarVariants}
      transition={transitionProps}
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
    >
      <motion.div
        className="relative z-40 flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-all"
        variants={contentVariants}
      >
        <motion.ul variants={staggerVariants} className="flex h-full flex-col">
          <div className="flex grow flex-col items-center">

            {/* ── Header / Branding ─────────────────────────────────────── */}
            <div className="flex h-[54px] w-full shrink-0 items-center border-b border-sidebar-border px-2">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex w-full items-center gap-2 px-2 hover:bg-sidebar-accent/15 text-sidebar-foreground"
                  >
                    {/* Logo icon */}
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary">
                      <Scale className="h-3.5 w-3.5 text-sidebar-primary-foreground" />
                    </div>

                    <motion.li
                      variants={labelVariants}
                      className="flex w-full min-w-0 items-center gap-1"
                    >
                      {!isCollapsed && (
                        <>
                          <span className="truncate text-sm font-semibold text-sidebar-foreground">
                            DJUD
                          </span>
                          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
                        </>
                      )}
                    </motion.li>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <div className="px-2 py-1.5">
                    <p className="text-xs text-muted-foreground font-medium">
                      Ministério da Saúde
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      Sistema DJUD v0.1.0
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings/profile" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Configurações do sistema
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* ── Navigation ────────────────────────────────────────────── */}
            <div className="flex h-full w-full flex-col">
              <div className="flex grow flex-col gap-4">
                <ScrollArea className="h-16 grow p-2">
                  <div className="flex w-full flex-col gap-0.5">

                    {/* Primary nav */}
                    {primaryNav.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent/15 hover:text-sidebar-foreground",
                            active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <motion.li variants={labelVariants}>
                            {!isCollapsed && (
                              <p className="ml-2 text-sm font-medium">
                                {item.label}
                              </p>
                            )}
                          </motion.li>
                        </Link>
                      );
                    })}

                    <Separator className="my-1 bg-sidebar-border" />

                    {/* Secondary nav */}
                    {secondaryNav.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent/15 hover:text-sidebar-foreground",
                            active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <motion.li variants={labelVariants}>
                            {!isCollapsed && (
                              <p className="ml-2 text-sm font-medium">
                                {item.label}
                              </p>
                            )}
                          </motion.li>
                        </Link>
                      );
                    })}

                    <Separator className="my-1 bg-sidebar-border" />

                    {/* Tertiary nav */}
                    {tertiaryNav.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent/15 hover:text-sidebar-foreground",
                            active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <motion.li variants={labelVariants}>
                            {!isCollapsed && (
                              <div className="flex items-center gap-2">
                                <p className="ml-2 text-sm font-medium">
                                  {item.label}
                                </p>
                                {item.badge && (
                                  <Badge
                                    className="flex h-fit w-fit items-center gap-1.5 rounded border-none bg-primary/10 px-1.5 text-primary"
                                    variant="outline"
                                  >
                                    {item.badge}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </motion.li>
                        </Link>
                      );
                    })}

                  </div>
                </ScrollArea>
              </div>

              {/* ── Footer: Settings + User ──────────────────────────────── */}
              <div className="flex flex-col gap-0.5 border-t border-sidebar-border p-2">

                {/* Settings link */}
                <Link
                  href="/settings/profile"
                  className={cn(
                    "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent/15 hover:text-sidebar-foreground",
                    isActive("/settings") &&
                      "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                  )}
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  <motion.li variants={labelVariants}>
                    {!isCollapsed && (
                      <p className="ml-2 text-sm font-medium">Configurações</p>
                    )}
                  </motion.li>
                </Link>

                {/* User account dropdown */}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-8 w-full flex-row items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/15 hover:text-sidebar-foreground focus:outline-none">
                      <Avatar className="size-5 shrink-0">
                        <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-[10px] font-bold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <motion.li
                        variants={labelVariants}
                        className="flex w-full min-w-0 items-center gap-1"
                      >
                        {!isCollapsed && (
                          <>
                            <p className="truncate text-sm font-medium">
                              {userName}
                            </p>
                            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
                          </>
                        )}
                      </motion.li>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" sideOffset={5} className="w-56">
                    {/* User info header */}
                    <div className="flex flex-row items-center gap-2 px-2 py-2">
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col text-left min-w-0">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {userName}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {userEmail}
                        </span>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1">
                      <span className="text-xs text-muted-foreground">
                        Papel: <span className="font-medium text-foreground">{roleLabel[userRole] ?? userRole}</span>
                      </span>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="flex items-center gap-2">
                      <Link href="/settings/profile">
                        <UserCircle className="h-4 w-4" />
                        Meu Perfil
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="flex items-center gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                      onClick={() => signOut({ callbackUrl: "/login" })}
                    >
                      <LogOut className="h-4 w-4" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

              </div>
            </div>
          </div>
        </motion.ul>
      </motion.div>
    </motion.div>
  );
}
