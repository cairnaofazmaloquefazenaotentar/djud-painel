// Stripe lazy init — compila sem STRIPE_SECRET_KEY
// DJUD backoffice não usa billing/pagamentos
// Manter para compatibilidade com boilerplate

let stripeClient: any = null;

export function getStripeClient() {
  if (process.env.STRIPE_SECRET_KEY) {
    if (!stripeClient) {
      const Stripe = require("stripe");
      stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
  }

  // Stripe not configured
  return null;
}

export async function createCheckoutSession() {
  throw new Error("Stripe not configured for this environment");
}

export async function getCustomerPortalLink() {
  throw new Error("Stripe not configured for this environment");
}
