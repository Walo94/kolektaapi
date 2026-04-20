import { AppDataSource } from "@/config/data-source";
import { Between, LessThanOrEqual } from "typeorm";
import {
  Giveaway,
  GiveawayStatus,
} from "@/entities/modules/giveaways/Giveaway";
import { Batch, BatchStatus } from "@/entities/modules/batchs/Batch";
import {
  BatchDetail,
  BatchDetailStatus,
} from "@/entities/modules/batchs/BatchDetail";
import { NotificationPreference } from "@/entities/modules/notifications/NotificationPreference";
import { NotificationService } from "./NotificationService";
import { NotificationType } from "@/entities/modules/notifications/Notification";

const POLL_INTERVAL_MS = 60_000;

/**
 * Guarda qué notificaciones ya fueron enviadas hoy para no duplicar.
 * Clave: "type:entityId:YYYY-MM-DD"
 * Se limpia al reiniciar el proceso (en producción se podría persistir en Redis o DB).
 */
const sentToday = new Set<string>();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function dedupeKey(type: string, id: string): string {
  return `${type}:${id}:${todayStr()}`;
}

export const NotificationScheduler = {
  _timer: null as ReturnType<typeof setInterval> | null,
  _isRunning: false,

  start(): void {
    if (this._timer) return;
    console.log("[NotificationScheduler] ✅ Iniciado");
    this._run();
    this._timer = setInterval(() => this._run(), POLL_INTERVAL_MS);
  },

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      console.log("[NotificationScheduler] 🛑 Detenido");
    }
  },

  async _run(): Promise<void> {
    if (this._isRunning || !AppDataSource.isInitialized) return;
    this._isRunning = true;
    try {
      await Promise.all([
        this._checkGiveawayDrawReminders(),
        this._checkBatchDeliveryReminders(),
      ]);
    } catch (err) {
      console.error("[NotificationScheduler] ❌ Error general:", err);
    } finally {
      this._isRunning = false;
    }
  },

  // ── Rifas: recordatorio el día del sorteo ─────────────────────────────────
  async _checkGiveawayDrawReminders(): Promise<void> {
    const today = todayStr();

    const giveaways = await AppDataSource.getRepository(Giveaway).find({
      where: {
        status: GiveawayStatus.OPEN,
        drawDate: today,
        // Solo rifas SIN sorteo automático configurado
        // (las automáticas las maneja GiveawayAutoDrawService)
        autoDrawAt: undefined as any,
      },
      select: ["id", "userId", "title", "drawDate"],
    });

    for (const g of giveaways) {
      const key = dedupeKey(NotificationType.GIVEAWAY_DRAW_REMINDER, g.id);
      if (sentToday.has(key)) continue;
      sentToday.add(key);

      await NotificationService.create(
        g.userId,
        NotificationType.GIVEAWAY_DRAW_REMINDER,
        { giveawayId: g.id, giveawayTitle: g.title, drawDate: g.drawDate },
      );
    }
  },

  // ── Tandas: recordatorio N días antes de la entrega ───────────────────────
  async _checkBatchDeliveryReminders(): Promise<void> {
    const today = new Date();

    // Obtener todos los usuarios con preferencia activa para este tipo
    const prefs = await AppDataSource.getRepository(
      NotificationPreference,
    ).find({
      where: {
        type: NotificationType.BATCH_DELIVERY_REMINDER,
        enabled: true,
      },
    });

    if (prefs.length === 0) return;

    // Para cada usuario con preferencia activa, buscar sus entregas pendientes
    for (const pref of prefs) {
      const daysAhead = pref.daysBeforeDelivery ?? 0;

      // Fecha objetivo = hoy + daysAhead
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysAhead);
      const targetStr = targetDate.toISOString().slice(0, 10);

      const details = await AppDataSource.getRepository(BatchDetail)
        .createQueryBuilder("d")
        .innerJoin("d.batch", "b")
        .where("b.userId = :userId", { userId: pref.userId })
        .andWhere("b.status = :status", { status: BatchStatus.ACTIVE })
        .andWhere("d.status = :dStatus", { dStatus: BatchDetailStatus.PENDING })
        .andWhere("CAST(d.deliveryDate AS CHAR) = :targetStr", { targetStr })
        .select([
          "d.id",
          "d.row",
          "d.contactName",
          "d.deliveryDate",
          "b.id",
          "b.name",
        ])
        .getMany();

      for (const detail of details) {
        const key = dedupeKey(
          NotificationType.BATCH_DELIVERY_REMINDER,
          detail.id,
        );
        if (sentToday.has(key)) continue;
        sentToday.add(key);

        await NotificationService.create(
          pref.userId,
          NotificationType.BATCH_DELIVERY_REMINDER,
          {
            batchId: (detail as any).batchId,
            batchName: (detail as any).batch?.name ?? "",
            row: detail.row,
            contactName: detail.contactName,
            deliveryDate: detail.deliveryDate,
            daysUntil: daysAhead,
          },
        );
      }
    }
  },
};
