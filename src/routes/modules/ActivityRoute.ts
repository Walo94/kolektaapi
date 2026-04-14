import { Router } from "express";
import { ActivityController } from "@/controllers/modules/ActivityController";
import { authMiddleware } from "@/middlewares/authMiddleware";

const router = Router();

// Todas las rutas de actividades requieren autenticación
router.use(authMiddleware);

// ── Resumen / dashboard ───────────────────────────────────────────────────────
// DEBE ir antes de /:id para evitar que "summary" se interprete como un UUID
router.get("/activities/summary", ActivityController.summary);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get("/activities", ActivityController.list);
router.get("/activities/:id", ActivityController.getOne);
router.delete("/activities/:id", ActivityController.deleteOne);

// ── Limpiar historial completo ────────────────────────────────────────────────
// Método DELETE sobre el recurso colección + header de confirmación
router.delete("/activities", ActivityController.clearAll);

export default router;
