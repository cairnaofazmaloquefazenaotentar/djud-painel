// Fontes Google carregadas via next/font — injetam as variáveis CSS do tema
// --font-sans, --font-serif e --font-mono definidas em globals.css
import type { Metadata } from "next";
import { Inter, Merriweather, JetBrains_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { QuerClientProvider } from "@/components/providers/query-client-provider";
import "./globals.css";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontSerif = Merriweather({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "400", "700", "900"],
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

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
      <body
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} h-full bg-background text-foreground antialiased`}
      >
        <SessionProvider session={session}>
          <QuerClientProvider>{children}</QuerClientProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
