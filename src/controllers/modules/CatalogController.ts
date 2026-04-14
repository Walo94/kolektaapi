// src/controllers/modules/CatalogController.ts

import { Response } from "express";
import { CatalogService } from "@/services/modules/CatalogService";
import { SaleStatus } from "@/entities/modules/catalogs/Sale";

export const CatalogController = {
  // ══════════════════════════════════════════════════════════════════════════
  // VENTAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /catalog/sales
   * Body: { clientName, clientPhone?, title, description, totalAmount, date }
   */
  async createSale(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { clientName, clientPhone, title, description, totalAmount, date } =
        req.body;

      if (!clientName || !title || !description || !totalAmount || !date) {
        return res.status(400).json({
          error:
            "Faltan campos requeridos: clientName, title, description, totalAmount, date",
        });
      }

      if (isNaN(Number(totalAmount)) || Number(totalAmount) <= 0) {
        return res
          .status(400)
          .json({ error: "totalAmount debe ser un número mayor a 0" });
      }

      const sale = await CatalogService.createSale({
        userId,
        clientName,
        clientPhone: clientPhone ?? null,
        title,
        description,
        totalAmount: Number(totalAmount),
        date,
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

  /**
   * GET /catalog/sales/:id
   */
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
   * Body: { title?, description?, clientPhone?, totalAmount? }
   */
  async updateSale(req: any, res: Response) {
    try {
      const { title, description, clientPhone, totalAmount } = req.body;

      if (
        totalAmount !== undefined &&
        (isNaN(Number(totalAmount)) || Number(totalAmount) <= 0)
      ) {
        return res
          .status(400)
          .json({ error: "totalAmount debe ser un número mayor a 0" });
      }

      const sale = await CatalogService.updateSale(req.params.id, req.user.id, {
        title,
        description,
        clientPhone,
        totalAmount:
          totalAmount !== undefined ? Number(totalAmount) : undefined,
      });

      res.json({ sale });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * PATCH /catalog/sales/:id/cancel
   */
  async cancelSale(req: any, res: Response) {
    try {
      const sale = await CatalogService.cancelSale(req.params.id, req.user.id);
      res.json({ sale, message: "Venta cancelada correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * DELETE /catalog/sales/:id
   */
  async deleteSale(req: any, res: Response) {
    try {
      await CatalogService.deleteSale(req.params.id, req.user.id);
      res.json({ message: "Venta eliminada correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PAGOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /catalog/sales/:saleId/payments
   * Body: { amount, date }
   */
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

  /**
   * GET /catalog/sales/:saleId/payments
   */
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

  /**
   * PATCH /catalog/payments/:id/cancel
   */
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

  /**
   * DELETE /catalog/payments/:id
   */
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
