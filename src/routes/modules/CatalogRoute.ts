import { Router } from "express";
import { CatalogController } from "@/controllers/modules/CatalogController";
import { authMiddleware } from "@/middlewares/authMiddleware";
import { PaymentReceiptService } from "@/services/modules/PaymentReceiptService";

const router = Router();
router.use(authMiddleware);

// ── Ventas ────────────────────────────────────────────────────────────────────
router.post("/catalog/sales", CatalogController.createSale);
router.get("/catalog/sales", CatalogController.listSales);
router.get("/catalog/sales/:id", CatalogController.getSale);
router.patch("/catalog/sales/:id", CatalogController.updateSale);
router.patch("/catalog/sales/:id/cancel", CatalogController.cancelSale);
router.delete("/catalog/sales/:id", CatalogController.deleteSale);

// ── Pagos ─────────────────────────────────────────────────────────────────────
// IMPORTANTE: las rutas de pagos individuales van ANTES que /:saleId/payments
// para evitar conflictos de matching

router.post("/catalog/sales/:saleId/payments", CatalogController.createPayment);
router.get("/catalog/sales/:saleId/payments", CatalogController.listPayments);
router.patch("/catalog/payments/:id/cancel", CatalogController.cancelPayment);
router.delete("/catalog/payments/:id", CatalogController.deletePayment);

// ── Comprobante PDF ───────────────────────────────────────────────────────────
router.get("/catalog/payments/:id/receipt", async (req: any, res) => {
  try {
    const pdfBuffer = await PaymentReceiptService.generateReceipt(
      req.params.id,
      req.user.id,
    );
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="comprobante_${req.params.id.slice(0, 8)}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
