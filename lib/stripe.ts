// Stripe não é usado no DJUD — mantido apenas para compatibilidade com boilerplate
// Todas as funções lançam erro se chamadas

export function getStripeClient() {
  return null;
}

export async function createCheckoutSession(): Promise<never> {
  throw new Error("Stripe não configurado neste ambiente");
}

export async function getCustomerPortalLink(): Promise<never> {
  throw new Error("Stripe não configurado neste ambiente");
}
