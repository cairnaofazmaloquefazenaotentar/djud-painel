import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

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
    <div className="flex h-screen bg-background">
      {/* Sidebar — fixed position, takes up ~49px collapsed / 240px expanded
          The main content uses a left margin matching the collapsed width */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content — offset by collapsed sidebar width (3.05rem ≈ 49px) */}
      <div className="flex-1 flex flex-col overflow-hidden md:ml-[3.05rem]">
        {/* Topbar */}
        <Topbar />

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
