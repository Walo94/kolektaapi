// src/services/modules/giveaways/GiveawayHoldService.ts
//
// CAMBIOS vs versión anterior:
//   • createHold()  → emite "ticket:held"
//   • releaseHold() → emite "ticket:released" con reason "manual"
//   • El intervalo de limpieza → emite "ticket:released" con reason "expired"
//
// IMPORTANTE: emitTicketHeld / emitTicketReleased son no-ops si el
// GiveawaySocketService aún no fue inicializado, por lo que el módulo
// puede importarse sin romper tests unitarios que no arrancan Socket.IO.

import {
  emitTicketHeld,
  emitTicketReleased,
} from "@/services/modules/giveaways/GiveawaySocketService";

const HOLD_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface HoldEntry {
  sessionId: string;
  expiresAt: Date;
  /** Guardamos el publicToken para poder emitir el evento de expiración */
  publicToken: string;
  ticketNumber: number;
}

const holdMap = new Map<string, HoldEntry>();

function holdKey(publicToken: string, ticketNumber: number): string {
  return `${publicToken}:${ticketNumber}`;
}

/** Devuelve el hold si existe y aún es válido; lo elimina si expiró. */
export function getActiveHold(
  publicToken: string,
  ticketNumber: number,
): HoldEntry | null {
  const key = holdKey(publicToken, ticketNumber);
  const entry = holdMap.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= new Date()) {
    holdMap.delete(key);
    return null;
  }
  return entry;
}

/** Limpia holds expirados y emite "ticket:released" a cada room afectada. */
setInterval(() => {
  const now = new Date();
  for (const [key, entry] of holdMap.entries()) {
    if (entry.expiresAt <= now) {
      holdMap.delete(key);
      try {
        emitTicketReleased(entry.publicToken, {
          ticketNumber: entry.ticketNumber,
          reason: "expired",
        });
      } catch (_) {
        // Silencioso: no interrumpir la limpieza si WS no está listo
      }
    }
  }
}, 60_000);

/** Función para uso público desde el Service */
export function getActiveHoldForPublic(
  publicToken: string,
  ticketNumber: number,
): HoldEntry | null {
  return getActiveHold(publicToken, ticketNumber);
}

/** Retener un boleto (usado en el router) */
export function createHold(
  publicToken: string,
  ticketNumber: number,
  sessionId: string,
): { held: boolean; expiresAt: Date } {
  const key = holdKey(publicToken, ticketNumber);
  const entry: HoldEntry = {
    sessionId,
    expiresAt: new Date(Date.now() + HOLD_TTL_MS),
    publicToken,
    ticketNumber,
  };
  holdMap.set(key, entry);

  console.log(
    `🔵 [HoldService] Creando hold para ticket ${ticketNumber} en rifa ${publicToken}`,
  );

  try {
    emitTicketHeld(publicToken, {
      ticketNumber,
      expiresAt: entry.expiresAt.toISOString(),
    });
    console.log(
      `✅ [HoldService] Evento ticket:held emitido para ticket ${ticketNumber}`,
    );
  } catch (error) {
    console.error(`❌ [HoldService] Error emitiendo ticket:held:`, error);
  }

  return { held: true, expiresAt: entry.expiresAt };
}

/** Renovar hold existente (sin emitir: el estado ya era temp_held) */
export function renewHold(entry: HoldEntry): void {
  entry.expiresAt = new Date(Date.now() + HOLD_TTL_MS);
}

/** Liberar hold manualmente */
export function releaseHold(
  publicToken: string,
  ticketNumber: number,
  sessionId: string,
): boolean {
  const key = holdKey(publicToken, ticketNumber);
  const entry = holdMap.get(key);
  if (entry && entry.sessionId === sessionId) {
    holdMap.delete(key);

    // ── Notificar liberación a todos los viewers ──────────────────────────
    try {
      emitTicketReleased(publicToken, { ticketNumber, reason: "manual" });
    } catch (_) {}

    return true;
  }
  return false;
}
