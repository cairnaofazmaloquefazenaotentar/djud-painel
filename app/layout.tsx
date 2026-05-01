import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { QuerClientProvider } from "@/components/providers/query-client-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DJUD Painel — Demandas Judiciais",
  description: "Painel de Saúde — Demandas Judiciais do Ministério da Saúde",
  icons: {
    icon: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="pt-BR" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="h-full bg-background text-foreground antialiased">
        <SessionProvider session={session}>
          <QuerClientProvider>{children}</QuerClientProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
