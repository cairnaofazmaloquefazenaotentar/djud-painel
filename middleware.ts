import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware de segurança e rate limiting para rotas da API.
 * Roda no Edge Runtime do Next.js.
 *
 * Rate limiting em memória Map não persiste entre chamadas Edge —
 * usamos headers para sinalizar limites ao cliente e aplicamos
 * a validação granular em cada route handler via lib/rate-limit.ts.
 */

// Limites por tipo de rota
const LIMITS: Record<string, { limit: number; windowMs: number }> = {
  "/api/auth": { limit: 20, windowMs: 60_000 },   // auth: 20/min (brute force)
  "/api/demandas": { limit: 120, windowMs: 60_000 }, // demandas: 120/min
  "/api/users": { limit: 60, windowMs: 60_000 },
  "/api/": { limit: 200, windowMs: 60_000 },       // default: 200/min
};

function getLimitConfig(pathname: string) {
  for (const [prefix, cfg] of Object.entries(LIMITS)) {
    if (pathname.startsWith(prefix)) return cfg;
  }
  return LIMITS["/api/"];
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Só atua em rotas da API
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const cfg = getLimitConfig(pathname);

  // Adicionar headers de rate-limit informativos
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(cfg.limit));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
