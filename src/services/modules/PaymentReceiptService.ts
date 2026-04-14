// src/services/modules/PaymentReceiptService.ts
// Requiere: npm install pdfkit
// Tipos:    npm install --save-dev @types/pdfkit

import PDFDocument from "pdfkit";
import { AppDataSource } from "@/config/data-source";
import { Payment, PaymentStatus } from "@/entities/modules/catalogs/Payment";
import { Sale } from "@/entities/modules/catalogs/Sale";

const paymentRepo = AppDataSource.getRepository(Payment);

function formatMoney(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const PaymentReceiptService = {
  /**
   * Genera un PDF estilo ticket para el pago indicado.
   * Devuelve un Buffer con el contenido del PDF.
   */
  async generateReceipt(paymentId: string, userId: string): Promise<Buffer> {
    // ── Cargar pago con su venta ──────────────────────────────────────────
    const payment = await paymentRepo.findOne({
      where: { id: paymentId },
      relations: ["sale"],
    });

    if (!payment) throw new Error("Pago no encontrado");
    if (payment.sale.userId !== userId) throw new Error("Pago no encontrado");
    if (payment.status === PaymentStatus.CANCELLED) {
      throw new Error("No se puede generar comprobante de un pago cancelado");
    }

    const sale: Sale = payment.sale;

    // ── Generar PDF ───────────────────────────────────────────────────────
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      const doc = new PDFDocument({
        size: [226, 400], // ~80mm de ancho (papel térmico estándar)
        margins: { top: 16, bottom: 16, left: 16, right: 16 },
      });

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const W = doc.page.width - 32; // ancho útil (descontando márgenes)
      const cx = doc.page.width / 2; // centro horizontal

      // ── Cabecera ──────────────────────────────────────────────────────
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("Kolekta", { align: "center" });

      doc
        .fontSize(8)
        .font("Helvetica")
        .text("Comprobante de pago", { align: "center" });

      doc.moveDown(0.5);
      doc
        .moveTo(16, doc.y)
        .lineTo(W + 16, doc.y)
        .stroke();
      doc.moveDown(0.5);

      // ── Número de orden y cliente ─────────────────────────────────────
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(`Pedido #${sale.orderNum}`, { align: "center" });

      doc
        .fontSize(8)
        .font("Helvetica")
        .text(sale.clientName, { align: "center" });

      doc.moveDown(0.5);
      doc
        .moveTo(16, doc.y)
        .lineTo(W + 16, doc.y)
        .stroke();
      doc.moveDown(0.5);

      // ── Detalles del pago ─────────────────────────────────────────────
      const rows: [string, string][] = [
        ["Título:", sale.title],
        ["Fecha pago:", formatDateTime(payment.date)],
        ["Monto pagado:", formatMoney(payment.amount)],
        ["Saldo restante:", formatMoney(sale.balance)],
        ["Total venta:", formatMoney(sale.totalAmount)],
      ];

      doc.fontSize(8);
      for (const [label, value] of rows) {
        const y = doc.y;
        doc.font("Helvetica").text(label, 16, y, { width: 90 });
        doc
          .font("Helvetica-Bold")
          .text(value, 110, y, { width: W - 94, align: "right" });
        doc.moveDown(0.4);
      }

      doc.moveDown(0.3);
      doc
        .moveTo(16, doc.y)
        .lineTo(W + 16, doc.y)
        .stroke();
      doc.moveDown(0.5);

      // ── Monto principal destacado ─────────────────────────────────────
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text(formatMoney(payment.amount), { align: "center" });

      doc
        .fontSize(8)
        .font("Helvetica")
        .text("Monto pagado", { align: "center" });

      doc.moveDown(0.8);
      doc
        .moveTo(16, doc.y)
        .lineTo(W + 16, doc.y)
        .stroke();
      doc.moveDown(0.5);

      // ── ID de referencia ──────────────────────────────────────────────
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor("#888888")
        .text(`Ref: ${payment.id}`, { align: "center" });

      doc
        .fontSize(7)
        .text(`Generado: ${formatDateTime(new Date())}`, { align: "center" });

      doc.end();
    });
  },
};
