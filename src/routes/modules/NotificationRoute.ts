import { Router } from "express";
import { NotificationController } from "@/controllers/modules/NotificationController";
import { authMiddleware } from "@/middlewares/authMiddleware";

const router = Router();

// ── Rutas específicas ANTES de /:id para evitar conflictos ────────────────────

router.patch(
  "/notifications/read-all",
  authMiddleware,
  NotificationController.markAllAsRead,
);
router.delete(
  "/notifications",
  authMiddleware,
  NotificationController.deleteAll,
);
router.get(
  "/notifications/preferences",
  authMiddleware,
  NotificationController.getPreferences,
);
router.patch(
  "/notifications/preferences/:type",
  authMiddleware,
  NotificationController.updatePreference,
);

// ── Token FCM del dispositivo ─────────────────────────────────────────────────
// Flutter llama a este endpoint justo después del login con el token FCM.
router.post(
  "/notifications/device-token",
  authMiddleware,
  NotificationController.registerDeviceToken,
);

// ── CRUD general ──────────────────────────────────────────────────────────────
router.get("/notifications", authMiddleware, NotificationController.getAll);
router.patch(
  "/notifications/:id/read",
  authMiddleware,
  NotificationController.markAsRead,
);
router.delete(
  "/notifications/:id",
  authMiddleware,
  NotificationController.delete,
);

export default router;
