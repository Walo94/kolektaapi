import { Response } from "express";
import { CatalogService } from "@/services/modules/catalogs/CatalogService";
import { SaleStatus } from "@/entities/modules/catalogs/Sale";

export const CatalogController = {
  // ══════════════════════════════════════════════════════════════════════════
  // VENTAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /catalog/sales
   * Body: {
   *   clientName, clientPhone?, title, date,
   *   items: [{ productId?, description?, price?, quantity }]
   * }
   */
  async createSale(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { clientName, clientPhone, title, date, items } = req.body;

      if (!clientName || !title || !date) {
        return res.status(400).json({
          error: "Faltan campos requeridos: clientName, title, date",
        });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error: "La venta debe incluir al menos un ítem en el campo `items`",
        });
      }

      const sale = await CatalogService.createSale({
        userId,
        clientName,
        clientPhone: clientPhone ?? null,
        title,
        date,
        items,
      });

      res.status(201).json({ sale });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * GET /catalog/sales
   * Query: status?, limit?, offset?
   */
  async listSales(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { status, limit, offset } = req.query;

      const validStatuses = Object.values(SaleStatus);
      if (status && !validStatuses.includes(status as SaleStatus)) {
        return res.status(400).json({
          error: `status debe ser uno de: ${validStatuses.join(", ")}`,
        });
      }

      const result = await CatalogService.listSales(userId, {
        status: status as SaleStatus | undefined,
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /** GET /catalog/sales/:id */
  async getSale(req: any, res: Response) {
    try {
      const sale = await CatalogService.getSaleById(req.params.id, req.user.id);
      res.json({ sale });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  },

  /**
   * PATCH /catalog/sales/:id
   * Body: {
   *   title?, clientPhone?,
   *   items?: [{ productId?, description?, price?, quantity }]
   * }
   * Solo se puede editar mientras no haya pagos activos.
   * Si se envía `items`, se reemplazan todos los productos de la venta
   * y se recalcula totalAmount.
   */
  async updateSale(req: any, res: Response) {
    try {
      const { title, clientPhone, items } = req.body;

      if (
        items !== undefined &&
        (!Array.isArray(items) || items.length === 0)
      ) {
        return res.status(400).json({
          error:
            "Si envías `items`, debe ser un arreglo con al menos un elemento",
        });
      }

      const sale = await CatalogService.updateSale(req.params.id, req.user.id, {
        title,
        clientPhone,
        items,
      });

      res.json({ sale });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /** PATCH /catalog/sales/:id/cancel */
  async cancelSale(req: any, res: Response) {
    try {
      const sale = await CatalogService.cancelSale(req.params.id, req.user.id);
      res.json({ sale, message: "Venta cancelada correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /** DELETE /catalog/sales/:id */
  async deleteSale(req: any, res: Response) {
    try {
      await CatalogService.deleteSale(req.params.id, req.user.id);
      res.json({ message: "Venta eliminada correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PAGOS  (sin cambios)
  // ══════════════════════════════════════════════════════════════════════════

  /** POST /catalog/sales/:saleId/payments */
  async createPayment(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { saleId } = req.params;
      const { amount, date } = req.body;

      if (!amount || !date) {
        return res
          .status(400)
          .json({ error: "Faltan campos requeridos: amount, date" });
      }
      if (isNaN(Number(amount)) || Number(amount) <= 0) {
        return res
          .status(400)
          .json({ error: "amount debe ser un número mayor a 0" });
      }

      const result = await CatalogService.createPayment(saleId, userId, {
        amount: Number(amount),
        date: new Date(date),
      });

      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /** GET /catalog/sales/:saleId/payments */
  async listPayments(req: any, res: Response) {
    try {
      const payments = await CatalogService.listPayments(
        req.params.saleId,
        req.user.id,
      );
      res.json({ payments });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /** PATCH /catalog/payments/:id/cancel */
  async cancelPayment(req: any, res: Response) {
    try {
      const result = await CatalogService.cancelPayment(
        req.params.id,
        req.user.id,
      );
      res.json({ ...result, message: "Pago cancelado correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /** DELETE /catalog/payments/:id */
  async deletePayment(req: any, res: Response) {
    try {
      const result = await CatalogService.deletePayment(
        req.params.id,
        req.user.id,
      );
      res.json({ ...result, message: "Pago eliminado correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
};
