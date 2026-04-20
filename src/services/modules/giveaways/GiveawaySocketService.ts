// src/services/modules/giveaways/GiveawaySocketService.ts
//
// Centraliza TODA la comunicación WebSocket del módulo de rifas.
// Cada rifa tiene su propia "room" identificada por su publicToken.
// Así los eventos solo llegan a quienes están viendo esa rifa.
//
// Eventos emitidos (cliente los escucha con socket.on(...)):
//
//   "ticket:held"     → Un boleto fue retenido temporalmente
//   "ticket:released" → Un hold expiró o fue liberado manualmente
//   "ticket:reserved" → Un boleto fue apartado definitivamente
//   "ticket:updated"  → Estado de un boleto cambió (paid, cancelled, winner…)
//   "giveaway:finished" → La rifa fue sorteada
//   "giveaway:cancelled" → La rifa fue cancelada
//   "viewers:count"   → Cuántos usuarios están viendo la rifa ahora mismo
//
// ─────────────────────────────────────────────────────────────────────────────

import { Server as SocketIOServer, Socket } from "socket.io";

// ── Tipos de payload ──────────────────────────────────────────────────────────

export interface TicketHeldPayload {
  ticketNumber: number;
  expiresAt: string; // ISO string
}

export interface TicketReleasedPayload {
  ticketNumber: number;
  reason: "expired" | "manual";
}

export interface TicketReservedPayload {
  ticketNumber: number;
  clientName: string;
  status: "reserved";
}

export interface TicketUpdatedPayload {
  ticketNumber: number;
  status: "free" | "reserved" | "paid" | "cancelled" | "winner";
  prizePlace?: number | null;
}

export interface ViewersCountPayload {
  count: number;
}

// ── Singleton del servidor Socket.IO ─────────────────────────────────────────

let _io: SocketIOServer | null = null;

// Rastrea cuántos sockets hay en cada room (publicToken → Set de socket.id)
const roomViewers = new Map<string, Set<string>>();

// ── Inicialización (llamar UNA sola vez desde index.ts) ───────────────────────

export function initGiveawaySocket(io: SocketIOServer): void {
  _io = io;

  io.on("connection", (socket: Socket) => {
    // El cliente emite "join:giveaway" con { publicToken } para suscribirse
    socket.on("join:giveaway", (publicToken: string) => {
      if (!publicToken || typeof publicToken !== "string") return;

      socket.join(publicToken);

      // Actualizar contador de viewers
      if (!roomViewers.has(publicToken)) {
        roomViewers.set(publicToken, new Set());
      }
      roomViewers.get(publicToken)!.add(socket.id);

      _broadcastViewers(io, publicToken);
    });

    // El cliente emite "leave:giveaway" al desmontar la página
    socket.on("leave:giveaway", (publicToken: string) => {
      _handleLeave(io, socket, publicToken);
    });

    // Limpieza cuando el socket se desconecta sin "leave" explícito
    socket.on("disconnect", () => {
      for (const [token, viewers] of roomViewers.entries()) {
        if (viewers.has(socket.id)) {
          viewers.delete(socket.id);
          if (viewers.size === 0) roomViewers.delete(token);
          else _broadcastViewers(io, token);
        }
      }
    });
  });
}

function _handleLeave(
  io: SocketIOServer,
  socket: Socket,
  publicToken: string,
): void {
  socket.leave(publicToken);
  const viewers = roomViewers.get(publicToken);
  if (viewers) {
    viewers.delete(socket.id);
    if (viewers.size === 0) roomViewers.delete(publicToken);
    else _broadcastViewers(io, publicToken);
  }
}

function _broadcastViewers(io: SocketIOServer, publicToken: string): void {
  const count = roomViewers.get(publicToken)?.size ?? 0;
  io.to(publicToken).emit("viewers:count", {
    count,
  } satisfies ViewersCountPayload);
}

// ── API pública para emitir desde otros servicios ─────────────────────────────

function getIO(): SocketIOServer {
  if (!_io) throw new Error("[GiveawaySocket] Socket.IO no está inicializado");
  return _io;
}

/** Boleto retenido temporalmente (hold de 5 min) */
export function emitTicketHeld(
  publicToken: string,
  payload: TicketHeldPayload,
): void {
  getIO().to(publicToken).emit("ticket:held", payload);
}

/** Hold liberado (expiró o el usuario lo soltó manualmente) */
export function emitTicketReleased(
  publicToken: string,
  payload: TicketReleasedPayload,
): void {
  getIO().to(publicToken).emit("ticket:released", payload);
}

/** Boleto apartado definitivamente */
export function emitTicketReserved(
  publicToken: string,
  payload: TicketReservedPayload,
): void {
  getIO().to(publicToken).emit("ticket:reserved", payload);
}

/** Cambio de estado genérico (paid, cancelled, winner…) */
export function emitTicketUpdated(
  publicToken: string,
  payload: TicketUpdatedPayload,
): void {
  getIO().to(publicToken).emit("ticket:updated", payload);
}

/** Rifa finalizada (ganadores sorteados) */
export function emitGiveawayFinished(publicToken: string): void {
  getIO().to(publicToken).emit("giveaway:finished");
}

/** Rifa cancelada */
export function emitGiveawayCancelled(publicToken: string): void {
  getIO().to(publicToken).emit("giveaway:cancelled");
}
