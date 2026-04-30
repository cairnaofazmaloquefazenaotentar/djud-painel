import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      {/* Placeholder for Sidebar — criado na Etapa 3 */}
      <div className="hidden md:flex w-64 bg-sidebar text-sidebar-foreground flex-col border-r border-sidebar-border">
        <div className="p-4 font-bold text-lg">Menu</div>
        <nav className="flex-1 px-2 space-y-2">
          <div className="text-xs text-sidebar-foreground/50 px-2 py-1">
            ETAPA 3: Layout será criado aqui
          </div>
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Placeholder for Topbar — criado na Etapa 3 */}
        <div className="h-16 bg-background border-b border-border flex items-center px-6">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              Bem-vindo, {session.user.name}
            </div>
            <div className="text-xs text-muted-foreground">
              Role: {(session.user as any).role || "OPERATOR"}
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
