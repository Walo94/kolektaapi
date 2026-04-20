// src/routes/GiveawayRoute.ts
import { Router } from "express";
import { GiveawayController } from "@/controllers/modules/GiveawayController";
import { authMiddleware } from "@/middlewares/authMiddleware";
import { GiveawayTicketReceiptService } from "@/services/modules/giveaways/GiveawayTicketReceiptService";

const router = Router();

// ── Rutas protegidas ──────────────────────────────────────────────────────────

router.get(
  "/giveaways/stats",
  authMiddleware,
  GiveawayController.getGiveawayStats,
);

// ── CRUD rifa ─────────────────────────────────────────────────────────────────
router.post("/giveaways", authMiddleware, GiveawayController.createGiveaway);
router.get("/giveaways", authMiddleware, GiveawayController.listGiveaways);
router.get("/giveaways/:id", authMiddleware, GiveawayController.getGiveaway);
router.patch(
  "/giveaways/:id",
  authMiddleware,
  GiveawayController.updateGiveaway,
);
router.patch(
  "/giveaways/:id/cancel",
  authMiddleware,
  GiveawayController.cancelGiveaway,
);
router.delete(
  "/giveaways/:id",
  authMiddleware,
  GiveawayController.deleteGiveaway,
);

// ── Boletos ───────────────────────────────────────────────────────────────────
router.patch(
  "/giveaways/:id/tickets/:ticketId/cancel",
  authMiddleware,
  GiveawayController.cancelTicket,
);
router.patch(
  "/giveaways/:id/tickets/:ticketId",
  authMiddleware,
  GiveawayController.updateTicket,
);
router.post(
  "/giveaways/:id/tickets",
  authMiddleware,
  GiveawayController.assignTicket,
);

// ── Sorteo ────────────────────────────────────────────────────────────────────
router.post(
  "/giveaways/:id/draw/random",
  authMiddleware,
  GiveawayController.drawRandom,
);
router.post(
  "/giveaways/:id/draw/manual",
  authMiddleware,
  GiveawayController.drawManual,
);

// ── Comprobante PDF de boleto ─────────────────────────────────────────────────
router.get(
  "/giveaways/:giveawayId/tickets/:ticketId/receipt",
  authMiddleware,
  async (req: any, res) => {
    try {
      const pdfBuffer =
        await GiveawayTicketReceiptService.generateTicketReceipt(
          req.params.giveawayId,
          req.params.ticketId,
          req.user.id,
        );

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="boleto_${req.params.ticketId.slice(0, 8)}.pdf"`,
        "Content-Length": pdfBuffer.length,
      });
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
);

export default router;
