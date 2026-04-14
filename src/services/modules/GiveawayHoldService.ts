// src/services/modules/GiveawayHoldService.ts

const HOLD_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface HoldEntry {
  sessionId: string;
  expiresAt: Date;
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

/** Limpia holds expirados periódicamente (cada minuto). */
setInterval(() => {
  const now = new Date();
  for (const [key, entry] of holdMap.entries()) {
    if (entry.expiresAt <= now) holdMap.delete(key);
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
  };
  holdMap.set(key, entry);
  return { held: true, expiresAt: entry.expiresAt };
}

/** Renovar hold existente */
export function renewHold(entry: HoldEntry): void {
  entry.expiresAt = new Date(Date.now() + HOLD_TTL_MS);
}

/** Liberar hold */
export function releaseHold(
  publicToken: string,
  ticketNumber: number,
  sessionId: string,
): boolean {
  const key = holdKey(publicToken, ticketNumber);
  const entry = holdMap.get(key);
  if (entry && entry.sessionId === sessionId) {
    holdMap.delete(key);
    return true;
  }
  return false;
}
