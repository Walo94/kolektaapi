import { Router } from "express";
import { BatchController } from "@/controllers/modules/BatchController";

const router = Router();

// ── Ruta pública ──────────────────────────────────────────
router.get("/public/batch/:publicToken", BatchController.getPublicInfo);

export default router;
