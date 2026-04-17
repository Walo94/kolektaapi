// src/services/admin/StripeService.ts
import Stripe from "stripe";
import { AppDataSource } from "@/config/data-source";
import { User } from "@/entities/admin/User";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia" as any,
});

const userRepo = AppDataSource.getRepository(User);

const PRICE_PLAN_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_MONTHLY!]: "monthly",
  [process.env.STRIPE_PRICE_ANNUAL!]: "annual",
};

export const StripeService = {
  /**
   * Obtiene o crea un Customer en Stripe
   */
  async getOrCreateCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.fullName,
      metadata: { userId: user.id },
    });

    await userRepo.update(user.id, { stripeCustomerId: customer.id });
    return customer.id;
  },

  /**
   * Crea sesión de Checkout para nueva suscripción
   */
  async createCheckoutSession(userId: string, priceId: string) {
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error("Usuario no encontrado");

    const customerId = await StripeService.getOrCreateCustomer(user);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `kolekta://subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `kolekta://subscription/cancel`,
      metadata: { userId, priceId },
      subscription_data: { metadata: { userId } },
      locale: "es",
    });

    return { url: session.url, sessionId: session.id };
  },

  /**
   * Crea sesión del Portal de Stripe (para gestionar/cancelar suscripción)
   */
  async createPortalSession(userId: string) {
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error("Usuario no encontrado");

    if (!user.stripeCustomerId) {
      throw new Error("El usuario no tiene una suscripción activa");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `kolekta://subscription/portal-return`,
    });

    return { url: session.url };
  },

  /**
   * Obtiene la suscripción activa actual desde Stripe
   */
  /**
   * Obtiene la suscripción activa actual desde Stripe
   */
  async getActiveSubscription(userId: string) {
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user || !user.stripeCustomerId) {
      console.log(
        `[getActiveSubscription] ❌ No customerId para usuario ${userId}`,
      );
      return { subscription: null };
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      limit: 5,
      status: "all",
      expand: ["data.items.data.price"],
    });

    console.log(
      `[getActiveSubscription] Encontradas ${subscriptions.data.length} suscripciones para usuario ${userId}`,
    );

    if (subscriptions.data.length === 0) {
      console.log(`[getActiveSubscription] ❌ No hay suscripciones`);
      return { subscription: null };
    }

    // Tomamos la suscripción más relevante (preferentemente activa o trialing)
    const relevantSub =
      subscriptions.data.find((sub: any) =>
        ["active", "trialing"].includes(sub.status),
      ) || subscriptions.data[0];

    const sub = relevantSub;
    const firstItem = sub.items?.data?.[0];

    // CORRECCIÓN: current_period_end ahora está dentro del primer item
    const currentPeriodEndTimestamp =
      firstItem?.current_period_end ?? (sub as any).current_period_end; // fallback por si la versión antigua aún lo tiene

    if (!currentPeriodEndTimestamp) {
      console.log(
        `[getActiveSubscription] ⚠️ No se encontró current_period_end`,
      );
      return { subscription: null };
    }

    console.log(
      `[getActiveSubscription] ✅ Sub ID: ${sub.id} | Status: ${sub.status} | Period End: ${new Date(currentPeriodEndTimestamp * 1000)}`,
    );

    return {
      subscription: {
        id: sub.id,
        status: sub.status,
        currentPeriodEnd: new Date(
          currentPeriodEndTimestamp * 1000,
        ).toISOString(),
        planType: PRICE_PLAN_MAP[sub.items.data[0]?.price.id] ?? "unknown",
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      },
    };
  },

  // ====================== WEBHOOK HANDLERS ======================

  async handleCheckoutCompleted(session: any) {
    console.log(
      `[Stripe Webhook] Checkout completado - Session: ${session.id}`,
    );
    // Solo logging. Stripe ya maneja todo.
  },

  async handleSubscriptionCreated(subscription: any) {
    const userId = subscription.metadata?.userId;
    console.log(
      `[Stripe Webhook] Nueva suscripción creada para usuario ${userId}`,
    );
  },

  async handleSubscriptionUpdated(subscription: any) {
    const userId = subscription.metadata?.userId;
    console.log(
      `[Stripe Webhook] Suscripción actualizada para usuario ${userId} → Status: ${subscription.status}`,
    );
    // Aquí puedes agregar lógica extra si necesitas (ej. notificaciones)
  },

  async handleSubscriptionDeleted(subscription: any) {
    const userId = subscription.metadata?.userId;
    console.log(
      `[Stripe Webhook] Suscripción cancelada/eliminada para usuario ${userId}`,
    );
  },

  async handleInvoicePaymentSucceeded(invoice: any) {
    console.log(
      `[Stripe Webhook] Pago de factura exitoso - Invoice: ${invoice.id}`,
    );
  },

  async handleInvoicePaymentFailed(invoice: any) {
    console.log(
      `[Stripe Webhook] Pago de factura fallido - Invoice: ${invoice.id}`,
    );
  },

  async handleSubscriptionPaused(subscription: any) {
    const userId = subscription.metadata?.userId;
    console.log(`[Stripe Webhook] Suscripción pausada para usuario ${userId}`);
  },
};
