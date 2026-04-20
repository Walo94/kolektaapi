// src/services/modules/GiveawayTicketReceiptService.ts
import PDFDocument from "pdfkit";
import fetch from "node-fetch";
import QRCode from "qrcode";
import { AppDataSource } from "@/config/data-source";
import { Giveaway } from "@/entities/modules/giveaways/Giveaway";
import {
  GiveawayDetail,
  TicketStatus,
} from "@/entities/modules/giveaways/GiveawayDetail";

const giveawayRepo = AppDataSource.getRepository(Giveaway);
const detailRepo = AppDataSource.getRepository(GiveawayDetail);

// URL base del frontend — ajusta según tu dominio
const FRONTEND_BASE_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

function formatMoney(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/**
 * Formatea una fecha guardada en BD (puede llegar como string "YYYY-MM-DD"
 * o como Date) usando UTC para evitar que el offset local mueva el día.
 */
function formatDate(date: Date | string): string {
  const iso = date instanceof Date ? date.toISOString() : String(date);
  // Tomamos solo la parte de fecha para evitar desplazamientos de zona horaria
  const datePart = iso.slice(0, 10); // "2026-06-20"
  const [year, month, day] = datePart.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
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

export const GiveawayTicketReceiptService = {
  /**
   * Genera un PDF estilo ticket para un boleto de rifa.
   *
   * Layout (de arriba hacia abajo):
   *   1. Encabezado "Kolekta / Boleto de Rifa"
   *   2. Imagen de portada (si existe) — COMPLETA antes del título
   *   3. Título de la rifa
   *   4. Descripción (si existe)
   *   5. Número grande del boleto
   *   6. Separador
   *   7. Datos del cliente (labels y valores en la misma línea y altura)
   *   8. Precio · Sorteo · Premios
   *   9. Separador
   *  10. Código QR con link público de la rifa
   *  11. Pie "¡Buena suerte!" + referencia + timestamp
   */
  async generateTicketReceipt(
    giveawayId: string,
    ticketId: string,
    userId: string,
  ): Promise<Buffer> {
    // ── Cargar rifa y boleto ─────────────────────────────────────────────
    const giveaway = await giveawayRepo.findOne({
      where: { id: giveawayId, userId },
      relations: ["details"],
    });

    if (!giveaway) throw new Error("Rifa no encontrada o sin permisos");

    const detail = giveaway.details.find((d) => d.id === ticketId);
    if (!detail) throw new Error("Boleto no encontrado");

    if (
      ![TicketStatus.RESERVED, TicketStatus.PAID, TicketStatus.WINNER].includes(
        detail.status,
      )
    ) {
      throw new Error(
        "Solo se pueden generar comprobantes de boletos apartados, pagados o ganadores",
      );
    }

    // ── Descargar imagen de portada (opcional) ───────────────────────────
    let coverBuffer: Buffer | null = null;
    if (giveaway.coverImage) {
      try {
        const res = await fetch(giveaway.coverImage);
        if (res.ok) coverBuffer = Buffer.from(await res.arrayBuffer());
      } catch (_) {
        // imagen no crítica
      }
    }

    // ── Generar QR ───────────────────────────────────────────────────────
    const qrUrl = `${FRONTEND_BASE_URL}/shared/giveaway/${giveaway.publicToken}`;
    let qrBuffer: Buffer | null = null;
    try {
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 120,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
      });
      // toDataURL devuelve "data:image/png;base64,..."
      const base64 = qrDataUrl.split(",")[1];
      qrBuffer = Buffer.from(base64, "base64");
    } catch (_) {
      // QR no crítico
    }

    // ── Calcular altura dinámica del documento ───────────────────────────
    // Altura base + extras opcionales para evitar contenido cortado
    let pageHeight = 480;
    if (coverBuffer) pageHeight += 140; // imagen de portada
    if (giveaway.description) pageHeight += 28; // descripción
    if (qrBuffer) pageHeight += 110; // QR

    // ── Generar PDF ──────────────────────────────────────────────────────
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: [226, pageHeight],
        margins: { top: 16, bottom: 16, left: 16, right: 16 },
      });

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const W = doc.page.width - 32; // ancho útil (sin márgenes)
      const L = 16; // margen izquierdo

      // ── 1. Cabecera ──────────────────────────────────────────────────
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("Kolekta", { align: "center" });

      doc
        .fontSize(9)
        .font("Helvetica")
        .text("Boleto de Rifa", { align: "center" });

      doc.moveDown(0.5);
      _separator(doc, W);
      doc.moveDown(0.8);

      // ── 2. Imagen de portada (primero la imagen, luego el texto) ─────
      if (coverBuffer) {
        const imgWidth = W;
        const imgHeight = 120;
        const imgX = L;
        const imgY = doc.y;

        // Fondo blanco para la imagen
        doc
          .rect(imgX, imgY, imgWidth, imgHeight)
          .fill("#f5f5f5")
          .fillColor("#000000");

        doc.image(coverBuffer, imgX, imgY, {
          width: imgWidth,
          height: imgHeight,
          cover: [imgWidth, imgHeight],
        });

        // Avanzar el cursor manualmente tras la imagen
        doc.y = imgY + imgHeight + 12;
      }

      // ── 3. Título ────────────────────────────────────────────────────
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(giveaway.title, L, doc.y, { align: "center", width: W });

      doc.moveDown(0.3);

      // ── 4. Descripción (opcional) ────────────────────────────────────
      if (giveaway.description) {
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#555555")
          .text(giveaway.description, L, doc.y, {
            align: "center",
            width: W,
          });
        doc.fillColor("#000000");
        doc.moveDown(0.3);
      }

      doc.moveDown(0.4);

      // ── 5. Número grande ─────────────────────────────────────────────
      doc
        .fontSize(34)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text(`#${detail.ticketNumber}`, L, doc.y, {
          align: "center",
          width: W,
        });

      doc.moveDown(0.5);

      // ── 6. Separador ─────────────────────────────────────────────────
      _separator(doc, W);
      doc.moveDown(0.8);

      // ── 7. Datos del cliente (label + valor en la misma línea) ───────
      const LABEL_W = 58;
      const VALUE_X = L + LABEL_W + 4;
      const VALUE_W = W - LABEL_W - 4;
      const ROW_H = 14; // altura fija por fila para mantener alineación

      _infoRow(
        doc,
        "Cliente:",
        detail.clientName ?? "—",
        L,
        LABEL_W,
        VALUE_X,
        VALUE_W,
        ROW_H,
      );

      if (detail.clientPhone) {
        _infoRow(
          doc,
          "Teléfono:",
          detail.clientPhone,
          L,
          LABEL_W,
          VALUE_X,
          VALUE_W,
          ROW_H,
        );
      }

      const isPaid =
        detail.status === TicketStatus.PAID ||
        detail.status === TicketStatus.WINNER;

      // Estado — valor en color
      const rowY = doc.y;
      doc
        .fontSize(8.5)
        .font("Helvetica")
        .fillColor("#000000")
        .text("Estado:", L, rowY, { width: LABEL_W, lineBreak: false });
      doc
        .font("Helvetica-Bold")
        .fillColor(isPaid ? "#10B981" : "#F59E0B")
        .text(isPaid ? "PAGADO" : "APARTADO", VALUE_X, rowY, {
          width: VALUE_W,
          lineBreak: false,
        });
      doc.fillColor("#000000");
      doc.y = rowY + ROW_H;

      doc.moveDown(0.6);

      // ── 8. Precio · Sorteo · Premios ─────────────────────────────────
      const rows: [string, string][] = [
        ["Precio boleto:", formatMoney(detail.price)],
        ["Sorteo:", formatDate(giveaway.drawDate)],
        ["Premios:", `${giveaway.prizeCount} lugar(es)`],
      ];

      for (const [label, value] of rows) {
        const y = doc.y;
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#000000")
          .text(label, L, y, { width: 90, lineBreak: false });
        doc.font("Helvetica-Bold").text(value, L + 90, y, {
          width: W - 90,
          align: "right",
          lineBreak: false,
        });
        doc.y = y + ROW_H;
      }

      doc.moveDown(0.5);
      _separator(doc, W);
      doc.moveDown(0.7);

      // ── 9. Código QR ─────────────────────────────────────────────────
      if (qrBuffer) {
        doc
          .fontSize(7.5)
          .font("Helvetica")
          .fillColor("#555555")
          .text("Consulta tu rifa aquí:", L, doc.y, {
            align: "center",
            width: W,
          });

        doc.moveDown(0.3);

        const qrSize = 80;
        const qrX = (doc.page.width - qrSize) / 2;
        doc.image(qrBuffer, qrX, doc.y, { width: qrSize });
        doc.y = doc.y + qrSize + 6;
        doc.fillColor("#000000");
      }

      // ── 10. Pie ───────────────────────────────────────────────────────
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("¡Buena suerte!", L, doc.y, { align: "center", width: W });

      doc.moveDown(0.8);

      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor("#666666")
        .text(`Ref: ${detail.id}`, L, doc.y, { align: "center", width: W });

      doc.moveDown(0.3);

      doc
        .fontSize(7)
        .text(`Generado: ${formatDateTime(new Date())}`, L, doc.y, {
          align: "center",
          width: W,
        });

      doc.end();
    });
  },
};

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Línea separadora horizontal */
function _separator(doc: PDFKit.PDFDocument, W: number) {
  doc
    .moveTo(16, doc.y)
    .lineTo(W + 16, doc.y)
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .stroke()
    .strokeColor("#000000")
    .lineWidth(1);
}

/**
 * Fila label + valor en la misma altura (sin que el valor quede más abajo).
 * Usa coordenadas absolutas para garantizar alineación vertical.
 */
function _infoRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  L: number,
  labelW: number,
  valueX: number,
  valueW: number,
  rowH: number,
) {
  const y = doc.y;
  doc
    .fontSize(8.5)
    .font("Helvetica")
    .fillColor("#000000")
    .text(label, L, y, { width: labelW, lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .text(value, valueX, y, { width: valueW, lineBreak: false });
  doc.y = y + rowH;
}
