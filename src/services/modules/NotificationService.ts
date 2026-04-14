import { AppDataSource } from "@/config/data-source";
import {
  Notification,
  NotificationData,
  NotificationType,
} from "@/entities/modules/notifications/Notification";
import { NotificationPreference } from "@/entities/modules/notifications/NotificationPreference";
import { DeviceToken } from "@/entities/modules/notifications/DeviceToken";
import * as admin from "firebase-admin";

const notifRepo = () => AppDataSource.getRepository(Notification);
const prefRepo = () => AppDataSource.getRepository(NotificationPreference);
const tokenRepo = () => AppDataSource.getRepository(DeviceToken);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de texto legible
// ─────────────────────────────────────────────────────────────────────────────
function buildText(
  type: NotificationType,
  data: NotificationData,
): { title: string; body: string } {
  switch (type) {
    case NotificationType.GIVEAWAY_TICKET_RESERVED:
      return {
        title: `Boleto #${data.ticketNumber} apartado en "${data.giveawayTitle}"`,
        body: `${data.clientName}${data.clientPhone ? ` · ${data.clientPhone}` : ""} reservó el número ${data.ticketNumber}.`,
      };

    case NotificationType.GIVEAWAY_AUTO_DRAW_DONE:
      return {
        title: `Sorteo automático realizado: "${data.giveawayTitle}"`,
        body: `Se seleccionaron ${data.winnersCount} ganador(es) automáticamente.`,
      };

    case NotificationType.GIVEAWAY_DRAW_REMINDER:
      return {
        title: `Hoy es el sorteo de "${data.giveawayTitle}"`,
        body: `Recuerda realizar el sorteo de tu rifa programada para hoy (${data.drawDate}).`,
      };

    case NotificationType.BATCH_DELIVERY_REMINDER: {
      const days = Number(data.daysUntil);
      const when =
        days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`;
      return {
        title: `Entrega de tanda "${data.batchName}" — ${when}`,
        body: `Le toca cobrar a ${data.contactName} (turno ${data.row}), el ${data.deliveryDate}.`,
      };
    }

    default:
      return { title: "Nueva notificación", body: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Envío FCM (Firebase Cloud Messaging)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía un push a todos los dispositivos activos del usuario.
 * Si un token está inválido (unregistered), lo desactiva en BD.
 */
async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data: NotificationData,
): Promise<void> {
  const deviceTokens = await tokenRepo().find({
    where: { userId, active: true },
  });

  if (deviceTokens.length === 0) return;

  // Convertir data a Record<string, string> que exige FCM
  const fcmData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) {
      fcmData[key] = String(value);
    }
  }

  const invalidTokenIds: string[] = [];

  for (const device of deviceTokens) {
    try {
      await admin.messaging().send({
        token: device.token,
        notification: { title, body },
        data: fcmData,
        android: {
          // Prioridad alta para que llegue aunque el teléfono esté en reposo
          priority: "high",
          notification: {
            channelId: "kolekta_main", // debe coincidir con el canal de Flutter
            sound: "default",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      });
      console.log(`[Push] ✅ Enviado a dispositivo ${device.id}`);
    } catch (err: any) {
      const code = err?.errorInfo?.code ?? err?.code ?? "";
      // Tokens inválidos o no registrados — marcarlos como inactivos
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-argument"
      ) {
        console.warn(`[Push] Token inválido, desactivando: ${device.id}`);
        invalidTokenIds.push(device.id);
      } else {
        console.error(`[Push] ❌ Error enviando push a ${device.id}:`, err);
      }
    }
  }

  // Desactivar tokens inválidos en lote
  if (invalidTokenIds.length > 0) {
    await tokenRepo()
      .createQueryBuilder()
      .update(DeviceToken)
      .set({ active: false })
      .whereInIds(invalidTokenIds)
      .execute();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública del servicio
// ─────────────────────────────────────────────────────────────────────────────
export const NotificationService = {
  /**
   * Crea una notificación en BD y la envía por push si el usuario tiene
   * habilitado ese tipo. Si nunca personalizó sus preferencias, se asume
   * habilitado (opt-out).
   */
  async create(
    userId: string,
    type: NotificationType,
    data: NotificationData,
  ): Promise<Notification | null> {
    // Verificar preferencia del usuario
    const pref = await prefRepo().findOne({ where: { userId, type } });
    if (pref && !pref.enabled) return null;

    const { title, body } = buildText(type, data);

    // 1. Guardar en BD
    const notif = notifRepo().create({ userId, type, title, body, data });
    const saved = await notifRepo().save(notif);

    // 2. Enviar push (no bloquea si falla)
    sendPushToUser(userId, title, body, data).catch((err) =>
      console.error("[Push] Error en sendPushToUser:", err),
    );

    return saved;
  },

  // ── Tokens de dispositivo ─────────────────────────────────────────────────

  /**
   * Registra o actualiza el token FCM de un dispositivo.
   * Si el token ya existe para este usuario, lo reactiva.
   * Si existe para otro usuario (cambio de cuenta), lo reasigna.
   */
  async registerDeviceToken(
    userId: string,
    fcmToken: string,
  ): Promise<DeviceToken> {
    // ¿El token ya existe en algún registro?
    let existing = await tokenRepo().findOne({
      where: { token: fcmToken },
    });

    if (existing) {
      // Reasignar al usuario actual y reactivar
      existing.userId = userId;
      existing.active = true;
      return tokenRepo().save(existing);
    }

    // Crear nuevo registro
    const device = tokenRepo().create({
      userId,
      token: fcmToken,
      active: true,
    });
    return tokenRepo().save(device);
  },

  /**
   * Desactiva todos los tokens de un usuario (útil en logout).
   * Llamar desde el endpoint de logout si quieres implementarlo.
   */
  async deactivateUserTokens(userId: string): Promise<void> {
    await tokenRepo().update({ userId }, { active: false });
  },

  // ── Lectura ──────────────────────────────────────────────────────────────

  async getAll(
    userId: string,
    opts?: { limit?: number; offset?: number; onlyUnread?: boolean },
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    const qb = notifRepo()
      .createQueryBuilder("n")
      .where("n.userId = :userId", { userId })
      .orderBy("n.createdAt", "DESC");

    if (opts?.onlyUnread) qb.andWhere("n.isRead = false");

    qb.take(opts?.limit ?? 50).skip(opts?.offset ?? 0);

    const [notifications, total] = await qb.getManyAndCount();
    const unreadCount = await notifRepo().count({
      where: { userId, isRead: false },
    });

    return { notifications, total, unreadCount };
  },

  // ── Marcar como leídas ───────────────────────────────────────────────────

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notif = await notifRepo().findOne({ where: { id, userId } });
    if (!notif) throw new Error("Notificación no encontrada");
    notif.isRead = true;
    return notifRepo().save(notif);
  },

  async markAllAsRead(userId: string): Promise<void> {
    await notifRepo().update({ userId, isRead: false }, { isRead: true });
  },

  // ── Eliminar ─────────────────────────────────────────────────────────────

  async delete(id: string, userId: string): Promise<void> {
    const notif = await notifRepo().findOne({ where: { id, userId } });
    if (!notif) throw new Error("Notificación no encontrada");
    await notifRepo().remove(notif);
  },

  async deleteAll(userId: string): Promise<void> {
    await notifRepo().delete({ userId });
  },

  // ── Preferencias ─────────────────────────────────────────────────────────

  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    const existing = await prefRepo().find({ where: { userId } });

    const allTypes = Object.values(NotificationType);
    const existingTypes = new Set(existing.map((p) => p.type));

    const defaults: Partial<NotificationPreference>[] = allTypes
      .filter((t) => !existingTypes.has(t))
      .map((type) => ({
        userId,
        type,
        enabled: true,
        daysBeforeDelivery:
          type === NotificationType.BATCH_DELIVERY_REMINDER ? 0 : null,
      }));

    return [...existing, ...(defaults as NotificationPreference[])];
  },

  async updatePreference(
    userId: string,
    type: NotificationType,
    patch: { enabled?: boolean; daysBeforeDelivery?: number | null },
  ): Promise<NotificationPreference> {
    let pref = await prefRepo().findOne({ where: { userId, type } });

    if (!pref) {
      pref = prefRepo().create({
        userId,
        type,
        enabled: true,
        daysBeforeDelivery:
          type === NotificationType.BATCH_DELIVERY_REMINDER ? 0 : null,
      });
    }

    if (patch.enabled !== undefined) pref.enabled = patch.enabled;
    if (
      patch.daysBeforeDelivery !== undefined &&
      type === NotificationType.BATCH_DELIVERY_REMINDER
    ) {
      pref.daysBeforeDelivery = patch.daysBeforeDelivery;
    }

    return prefRepo().save(pref);
  },
};
