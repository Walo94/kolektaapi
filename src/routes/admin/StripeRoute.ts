import { Router } from "express";
import { StripeController } from "@/controllers/admin/StripeController";
import { authMiddleware } from "@/middlewares/authMiddleware";
import express from "express";

const router = Router();

// Webhook (debe ir con raw body)
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  StripeController.handleWebhook,
);

// ── RUTAS PROTEGIDAS ──────────────────────────────────────────────
router.post("/checkout", authMiddleware, StripeController.createCheckout);
router.post("/portal", authMiddleware, StripeController.createPortal);
router.get("/active", authMiddleware, StripeController.getActiveSubscription);

export default router;
