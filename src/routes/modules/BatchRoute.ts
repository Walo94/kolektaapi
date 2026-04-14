import { Router } from "express";
import { BatchController } from "@/controllers/modules/BatchController";
import { authMiddleware } from "@/middlewares/authMiddleware";

const router = Router();

// ── Rutas protegidas ──────────────────────────────────────

// Stats para el home screen (debe ir ANTES de /batchs/:id para evitar conflicto)
router.get("/batchs/stats", authMiddleware, BatchController.getBatchStats);

// CRUD principal
router.post("/batchs", authMiddleware, BatchController.createBatch);
router.get("/batchs", authMiddleware, BatchController.listBatchs);
router.get("/batchs/:id", authMiddleware, BatchController.getBatch);
router.patch("/batchs/:id", authMiddleware, BatchController.updateBatch);
router.delete(
  "/batchs/:id/cancel",
  authMiddleware,
  BatchController.cancelBatch,
);

router.delete(
  "/batchs/:id/delete",
  authMiddleware,
  BatchController.deleteBatch,
);

// Participantes
router.post(
  "/batchs/:id/participants",
  authMiddleware,
  BatchController.addParticipant,
);
router.patch(
  "/batchs/:id/participants/:detailId",
  authMiddleware,
  BatchController.updateParticipant,
);
router.delete(
  "/batchs/:id/participants/:detailId",
  authMiddleware,
  BatchController.removeParticipant,
);

// Entregas
router.post(
  "/batchs/:id/deliver/:detailId",
  authMiddleware,
  BatchController.registerDelivery,
);

// Aleatorio
router.post("/batchs/:id/randomize", authMiddleware, BatchController.randomize);

export default router;
