import { Response } from "express";
import { NotificationService } from "@/services/modules/notifications/NotificationService";
import { NotificationType } from "@/entities/modules/notifications/Notification";

export const NotificationController = {
  /** GET /notifications */
  async getAll(req: any, res: Response) {
    try {
      const { limit, offset, onlyUnread } = req.query;
      const result = await NotificationService.getAll(req.user.id, {
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
        onlyUnread: onlyUnread === "true",
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  /** PATCH /notifications/:id/read */
  async markAsRead(req: any, res: Response) {
    try {
      const notif = await NotificationService.markAsRead(
        req.params.id,
        req.user.id,
      );
      res.json({ notification: notif });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  },

  /** PATCH /notifications/read-all */
  async markAllAsRead(req: any, res: Response) {
    try {
      await NotificationService.markAllAsRead(req.user.id);
      res.json({ message: "Todas las notificaciones marcadas como leídas" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  /** DELETE /notifications/:id */
  async delete(req: any, res: Response) {
    try {
      await NotificationService.delete(req.params.id, req.user.id);
      res.json({ message: "Notificación eliminada" });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  },

  /** DELETE /notifications */
  async deleteAll(req: any, res: Response) {
    try {
      await NotificationService.deleteAll(req.user.id);
      res.json({ message: "Todas las notificaciones eliminadas" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  // ── Preferencias ──────────────────────────────────────────────────────────

  /** GET /notifications/preferences */
  async getPreferences(req: any, res: Response) {
    try {
      const prefs = await NotificationService.getPreferences(req.user.id);
      res.json({ preferences: prefs });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  /** PATCH /notifications/preferences/:type */
  async updatePreference(req: any, res: Response) {
    try {
      const { type } = req.params;
      const validTypes = Object.values(NotificationType);

      if (!validTypes.includes(type as NotificationType)) {
        return res.status(400).json({
          error: `Tipo inválido. Debe ser uno de: ${validTypes.join(", ")}`,
        });
      }

      const { enabled, daysBeforeDelivery } = req.body;

      if (enabled !== undefined && typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled debe ser boolean" });
      }
      if (
        daysBeforeDelivery !== undefined &&
        (!Number.isInteger(Number(daysBeforeDelivery)) ||
          Number(daysBeforeDelivery) < 0)
      ) {
        return res.status(400).json({
          error: "daysBeforeDelivery debe ser un entero >= 0",
        });
      }

      const pref = await NotificationService.updatePreference(
        req.user.id,
        type as NotificationType,
        {
          enabled,
          daysBeforeDelivery:
            daysBeforeDelivery !== undefined
              ? Number(daysBeforeDelivery)
              : undefined,
        },
      );
      res.json({ preference: pref });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  // ── Token FCM ─────────────────────────────────────────────────────────────

  /**
   * POST /notifications/device-token
   * body: { token: string }
   *
   * Flutter lo llama justo después del login con el FCM token del dispositivo.
   * El backend lo guarda en la tabla device_tokens para poder enviar push.
   */
  async registerDeviceToken(req: any, res: Response) {
    try {
      const { token } = req.body;

      if (!token || typeof token !== "string" || token.trim().length === 0) {
        return res.status(400).json({
          error: "El campo 'token' es requerido y debe ser un string",
        });
      }

      const device = await NotificationService.registerDeviceToken(
        req.user.id,
        token.trim(),
      );

      res.json({
        message: "Token registrado correctamente",
        deviceId: device.id,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
};
