/**
 * Rate limiter simples em memória.
 * Para produção com múltiplas instâncias, substituir por Upstash Redis.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Compartilhado dentro do processo Node.js (não persiste entre deploys serverless)
const store = new Map<string, RateLimitEntry>();

// Limpeza periódica para evitar memory leak
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 60_000);
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

/**
 * Verifica se o identificador (ex: IP + rota) excedeu o limite.
 * @param identifier - Chave única (ex: `${ip}:${route}`)
 * @param limit      - Requisições máximas por janela (default: 60)
 * @param windowMs   - Duração da janela em ms (default: 60s)
 */
export function rateLimit(
  identifier: string,
  { limit = 60, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): RateLimitResult {
  const now = Date.now();
  let entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(identifier, entry);
  }

  entry.count++;

  return {
    success: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    limit,
    resetAt: entry.resetAt,
  };
}

/**
 * Helper para resposta 429 padronizada.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({ error: "Too Many Requests — tente novamente em instantes." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
      },
    }
  );
}
