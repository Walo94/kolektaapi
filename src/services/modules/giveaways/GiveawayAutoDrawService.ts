// GiveawayAutoDrawService.ts - versión mejorada
import { AppDataSource } from "@/config/data-source";
import { LessThanOrEqual } from "typeorm";
import {
  Giveaway,
  GiveawayStatus,
} from "@/entities/modules/giveaways/Giveaway";
import { GiveawayService } from "@/services/modules/giveaways/GiveawayService";
import { NotificationService } from "@/services/modules/notifications/NotificationService";
import { NotificationType } from "@/entities/modules/notifications/Notification";

const POLL_INTERVAL_MS = 60_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export const GiveawayAutoDrawService = {
  _timer: null as ReturnType<typeof setInterval> | null,
  _isRunning: false, // Evitar ejecuciones concurrentes

  start(): void {
    if (this._timer) {
      console.log("[GiveawayAutoDraw] Scheduler ya está corriendo");
      return;
    }

    console.log("[GiveawayAutoDraw] ✅ Scheduler iniciado");
    this._runPending(); // Ejecutar inmediatamente
    this._timer = setInterval(() => this._runPending(), POLL_INTERVAL_MS);
  },

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      console.log("[GiveawayAutoDraw] 🛑 Scheduler detenido");
    }
  },

  async _runPending(): Promise<void> {
    // Evitar ejecución concurrente
    if (this._isRunning) {
      console.log("[GiveawayAutoDraw] ⏳ Ejecución anterior aún en proceso");
      return;
    }

    if (!AppDataSource.isInitialized) {
      console.log("[GiveawayAutoDraw] ⚠️ DB no inicializada");
      return;
    }

    this._isRunning = true;

    try {
      const giveawayRepo = AppDataSource.getRepository(Giveaway);
      const now = new Date();

      const pending = await giveawayRepo.find({
        where: {
          status: GiveawayStatus.OPEN,
          autoDrawExecuted: false,
          autoDrawAt: LessThanOrEqual(now),
        },
        select: ["id", "userId", "title", "autoDrawAt", "autoDrawExecuted"],
      });

      if (pending.length === 0) {
        this._isRunning = false;
        return;
      }

      console.log(
        `[GiveawayAutoDraw] 📋 ${pending.length} rifa(s) pendiente(s) de sorteo automático`,
      );

      for (const giveaway of pending) {
        await this._processGiveaway(giveaway);
      }
    } catch (error) {
      console.error("[GiveawayAutoDraw] ❌ Error general:", error);
    } finally {
      this._isRunning = false;
    }
  },

  async _processGiveaway(giveaway: Giveaway): Promise<void> {
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        console.log(
          `[GiveawayAutoDraw] 🎲 Sorteando "${giveaway.title}" (${giveaway.id}) - Intento ${retries + 1}/${MAX_RETRIES}`,
        );

        await GiveawayService.drawWinnersRandom(giveaway.id, giveaway.userId);

        // Obtener los ganadores después del sorteo
        const giveawayRepo = AppDataSource.getRepository(Giveaway);

        const giveawayWithDetails = await giveawayRepo.findOne({
          where: { id: giveaway.id },
          relations: ["details", "prizes"],
        });

        const winners = (giveawayWithDetails?.details ?? [])
          .filter((d) => d.status === "winner")
          .sort((a, b) => (a.prizePlace ?? 0) - (b.prizePlace ?? 0))
          .map((d) => {
            const prize = giveawayWithDetails?.prizes?.find(
              (p) => p.prizePlace === d.prizePlace,
            );
            return {
              clientName: d.clientName ?? "Sin nombre",
              ticketNumber: d.ticketNumber,
              prizePlace: d.prizePlace,
              prizeDescription: prize?.description ?? `Premio ${d.prizePlace}`,
            };
          });

        await NotificationService.create(
          giveaway.userId,
          NotificationType.GIVEAWAY_AUTO_DRAW_DONE,
          {
            giveawayId: giveaway.id,
            giveawayTitle: giveaway.title,
            winnersCount: winners.length,
            winners,
          },
        );

        return; // Éxito, salir del while
      } catch (err: any) {
        retries++;
        console.error(
          `[GiveawayAutoDraw] ❌ Error en "${giveaway.title}": ${err.message}`,
        );

        // Errores que no deberían reintentar
        const nonRetryableErrors = [
          "No hay boletos pagados",
          "Rifa no encontrada",
          "Usuario no autorizado",
        ];

        if (nonRetryableErrors.some((e) => err.message?.includes(e))) {
          console.log(
            `[GiveawayAutoDraw] ⛔ Error no recuperable, marcando como ejecutado`,
          );
          await this._markAsExecuted(giveaway.id);
          return;
        }

        // Si es el último intento, marcar como ejecutado para no reintentar infinitamente
        if (retries >= MAX_RETRIES) {
          console.log(
            `[GiveawayAutoDraw] ⚠️ Máximos reintentos alcanzados para "${giveaway.title}"`,
          );
          await this._markAsExecuted(giveaway.id);
          return;
        }

        // Esperar antes de reintentar
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  },

  async _markAsExecuted(giveawayId: string): Promise<void> {
    try {
      const giveawayRepo = AppDataSource.getRepository(Giveaway);
      await giveawayRepo.update(giveawayId, { autoDrawExecuted: true });
    } catch (error) {
      console.error(
        `[GiveawayAutoDraw] ❌ Error marcando rifa ${giveawayId} como ejecutada:`,
        error,
      );
    }
  },
};
