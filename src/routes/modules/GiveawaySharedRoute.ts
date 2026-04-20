// src/routes/modules/GiveawaySharedRoute.ts
import { Router } from "express";
import { GiveawayController } from "@/controllers/modules/GiveawayController";
import {
  getActiveHold,
  createHold,
  renewHold,
  releaseHold,
} from "@/services/modules/giveaways/GiveawayHoldService";

const router = Router();

// ── Rutas públicas ────────────────────────────────────────
router.get("/public/giveaway/:publicToken", GiveawayController.getPublicInfo);
router.post(
  "/public/giveaway/:publicToken/reserve",
  GiveawayController.reserveTicketPublic,
);

// ── Hold temporal ─────────────────────────────────────────
router.post("/public/giveaway/:publicToken/hold", (req, res) => {
  const { publicToken } = req.params;
  const { ticketNumber } = req.body;

  if (!ticketNumber || !Number.isInteger(Number(ticketNumber))) {
    return res.status(400).json({ error: "ticketNumber inválido" });
  }

  const num = Number(ticketNumber);
  const sessionId: string =
    (req.headers["x-session-id"] as string) ||
    `${req.ip}|${req.headers["user-agent"] ?? ""}`;

  const existing = getActiveHold(publicToken, num);

  if (existing) {
    if (existing.sessionId === sessionId) {
      renewHold(existing);
      return res.json({
        held: true,
        expiresAt: existing.expiresAt.toISOString(),
        message: "Hold renovado",
      });
    }
    return res.json({
      held: false,
      expiresAt: null,
      message: "Otro usuario ya reservó este número. Elige otro.",
    });
  }

  const result = createHold(publicToken, num, sessionId);
  return res.json({
    held: true,
    expiresAt: result.expiresAt.toISOString(),
    message: "Número retenido. Tienes 5 minutos para completar el registro.",
  });
});

router.delete("/public/giveaway/:publicToken/hold", (req, res) => {
  const { publicToken } = req.params;
  const { ticketNumber } = req.body;
  if (!ticketNumber) return res.json({ released: false });

  const num = Number(ticketNumber);
  const sessionId: string =
    (req.headers["x-session-id"] as string) ||
    `${req.ip}|${req.headers["user-agent"] ?? ""}`;

  const released = releaseHold(publicToken, num, sessionId);
  return res.json({ released });
});

router.get("/public/giveaway/:publicToken/hold/:ticketNumber", (req, res) => {
  const { publicToken, ticketNumber } = req.params;
  const num = Number(ticketNumber);
  const sessionId: string =
    (req.headers["x-session-id"] as string) ||
    `${req.ip}|${req.headers["user-agent"] ?? ""}`;

  const entry = getActiveHold(publicToken, num);

  if (!entry) {
    return res.json({
      ticketNumber: num,
      held: false,
      expiresAt: null,
      isYours: false,
    });
  }

  return res.json({
    ticketNumber: num,
    held: true,
    expiresAt: entry.expiresAt.toISOString(),
    isYours: entry.sessionId === sessionId,
  });
});

export default router;
