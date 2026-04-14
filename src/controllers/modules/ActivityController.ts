import { Response } from "express";
import {
  ActivityService,
  ActivityPeriod,
  ListActivitiesFilter,
} from "@/services/modules/ActivityService";
import { ActivityModule, ActivityType } from "@/entities/modules/Activity";

export const ActivityController = {
  // ── Listar actividades del usuario ────────────────────────────────────────

  /**
   * GET /activities
   * Query params:
   *   - period: "week" | "month" | "all"  (default: "all")
   *   - module: "batch" | "giveaway" | "catalog"
   *   - type:   ActivityType específico
   *   - limit:  número (default 100)
   *   - offset: número (default 0)
   */
  async list(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { period, module, type, limit, offset } = req.query;

      // Validar period
      const validPeriods: ActivityPeriod[] = ["week", "month", "all"];
      if (period && !validPeriods.includes(period as ActivityPeriod)) {
        return res.status(400).json({
          error: `El período debe ser uno de: ${validPeriods.join(", ")}`,
        });
      }

      // Validar module si viene
      if (
        module &&
        !Object.values(ActivityModule).includes(module as ActivityModule)
      ) {
        return res.status(400).json({
          error: `El módulo debe ser uno de: ${Object.values(ActivityModule).join(", ")}`,
        });
      }

      // Validar type si viene
      if (type && !Object.values(ActivityType).includes(type as ActivityType)) {
        return res.status(400).json({
          error: `El tipo no es válido`,
        });
      }

      const filter: ListActivitiesFilter = {
        period: (period as ActivityPeriod) ?? "all",
        module: module as ActivityModule | undefined,
        type: type as ActivityType | undefined,
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
      };

      const result = await ActivityService.listByUser(userId, filter);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ── Resumen / dashboard ───────────────────────────────────────────────────

  /**
   * GET /activities/summary
   * Query params:
   *   - period: "week" | "month" | "all"  (default: "month")
   */
  async summary(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { period } = req.query;

      const validPeriods: ActivityPeriod[] = ["week", "month", "all"];
      if (period && !validPeriods.includes(period as ActivityPeriod)) {
        return res.status(400).json({
          error: `El período debe ser uno de: ${validPeriods.join(", ")}`,
        });
      }

      const result = await ActivityService.getSummary(
        userId,
        (period as ActivityPeriod) ?? "month",
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ── Obtener por ID ────────────────────────────────────────────────────────

  /**
   * GET /activities/:id
   */
  async getOne(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const activity = await ActivityService.getById(id, userId);
      res.json({ activity });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  },

  // ── Eliminar un registro ──────────────────────────────────────────────────

  /**
   * DELETE /activities/:id
   */
  async deleteOne(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      await ActivityService.deleteOne(id, userId);
      res.json({ message: "Actividad eliminada correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ── Limpiar historial ─────────────────────────────────────────────────────

  /**
   * DELETE /activities
   * Query params:
   *   - module: "batch" | "giveaway" | "catalog"  (opcional — si omite, borra todo)
   *
   * Requiere header: X-Confirm-Clear: true
   * para evitar borrados accidentales.
   */
  async clearAll(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { module } = req.query;

      // Header de seguridad para prevenir borrados accidentales
      const confirmed = req.headers["x-confirm-clear"];
      if (confirmed !== "true") {
        return res.status(400).json({
          error:
            "Debes enviar el header 'X-Confirm-Clear: true' para confirmar esta operación",
        });
      }

      if (
        module &&
        !Object.values(ActivityModule).includes(module as ActivityModule)
      ) {
        return res.status(400).json({
          error: `El módulo debe ser uno de: ${Object.values(ActivityModule).join(", ")}`,
        });
      }

      const deleted = await ActivityService.clearAll(
        userId,
        module as ActivityModule | undefined,
      );

      res.json({
        message: `Se eliminaron ${deleted} registro(s) de actividad`,
        deleted,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
};
