import { Request, Response } from "express";
import Stripe from "stripe";
import { StripeService } from "@/services/admin/StripeService";

// @ts-ignore
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia" as any,
});

export const StripeController = {
  async createCheckout(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { priceId } = req.body;

      const validPrices = [
        process.env.STRIPE_PRICE_MONTHLY,
        process.env.STRIPE_PRICE_ANNUAL,
      ];

      if (!priceId || !validPrices.includes(priceId)) {
        return res.status(400).json({ error: "priceId inválido" });
      }

      const result = await StripeService.createCheckoutSession(userId, priceId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async createPortal(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const result = await StripeService.createPortalSession(userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async getActiveSubscription(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const result = await StripeService.getActiveSubscription(userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async handleWebhook(req: Request, res: Response) {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: any;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error("[Stripe Webhook] Firma inválida:", err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    console.log(`[Stripe Webhook] Evento recibido: ${event.type}`);

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await StripeService.handleCheckoutCompleted(event.data.object);
          break;

        case "customer.subscription.created":
          await StripeService.handleSubscriptionCreated(event.data.object);
          break;

        case "customer.subscription.updated":
          await StripeService.handleSubscriptionUpdated(event.data.object);
          break;

        case "customer.subscription.deleted":
          await StripeService.handleSubscriptionDeleted(event.data.object);
          break;

        case "invoice.payment_succeeded":
          await StripeService.handleInvoicePaymentSucceeded(event.data.object);
          break;

        case "invoice.payment_failed":
          await StripeService.handleInvoicePaymentFailed(event.data.object);
          break;

        default:
          console.log(`[Stripe Webhook] Evento no manejado: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("[Stripe Webhook] Error procesando evento:", error.message);
      res.json({ received: true, error: error.message });
    }
  },
};
