import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// Rotas públicas (sem autenticação)
const publicRoutes = ["/login", "/api/auth"];

// Rotas protegidas (requerem autenticação)
const protectedRoutes = ["/dashboard", "/demandas", "/users", "/organizations", "/logs", "/settings"];

export default auth((req: any) => {
  const { pathname } = req.nextUrl;

  // Se está tentando acessar rota pública, deixar passar
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Se está tentando acessar rota protegida sem sessão, redirecionar para login
  if (!req.auth && protectedRoutes.some((route) => pathname.startsWith(route))) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
