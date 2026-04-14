// src/entities/modules/notifications/Notification.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "@/entities/admin/User";

export enum NotificationType {
  // ── Rifas ────────────────────────────────────────────────────────
  GIVEAWAY_TICKET_RESERVED = "giveaway_ticket_reserved", // cliente apartó boleto por link
  GIVEAWAY_AUTO_DRAW_DONE = "giveaway_auto_draw_done", // sorteo automático ejecutado
  GIVEAWAY_DRAW_REMINDER = "giveaway_draw_reminder", // hoy es el día del sorteo

  // ── Tandas ───────────────────────────────────────────────────────
  BATCH_DELIVERY_REMINDER = "batch_delivery_reminder", // hoy (o en N días) toca entrega

  // ── Futuro: pagos / links de abono ───────────────────────────────
  // PAYMENT_RECEIVED         = "payment_received",
  // GIVEAWAY_TICKET_PAID     = "giveaway_ticket_paid",
  // BATCH_CONTRIBUTION_PAID  = "batch_contribution_paid",
}

/**
 * Metadata libre según el tipo de notificación.
 * Se guarda como JSON para no crear columnas por cada caso.
 *
 * Ejemplos:
 *  GIVEAWAY_TICKET_RESERVED  → { giveawayId, giveawayTitle, ticketNumber, clientName, clientPhone? }
 *  GIVEAWAY_AUTO_DRAW_DONE   → { giveawayId, giveawayTitle, winnersCount }
 *  GIVEAWAY_DRAW_REMINDER    → { giveawayId, giveawayTitle, drawDate }
 *  BATCH_DELIVERY_REMINDER   → { batchId, batchName, row, contactName, deliveryDate, daysUntil }
 */
export type NotificationData = Record<string, unknown>;

@Entity("notifications")
@Index(["userId", "createdAt"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ── Relación con el usuario ───────────────────────────────────────
  @Column({ type: "varchar", length: 36 })
  @Index()
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  // ── Tipo ──────────────────────────────────────────────────────────
  @Column({ type: "enum", enum: NotificationType })
  type!: NotificationType;

  // ── Texto legible (generado al crear) ─────────────────────────────
  @Column({ type: "varchar", length: 300 })
  title!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  body!: string | null;

  // ── Metadata estructurada ─────────────────────────────────────────
  @Column({ type: "json", nullable: true })
  data!: NotificationData | null;

  // ── Estado de lectura ─────────────────────────────────────────────
  @Column({ type: "boolean", default: false })
  isRead!: boolean;

  // ── Timestamp ─────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt!: Date;
  // No hay updatedAt — las notificaciones no se editan, solo se leen/eliminan.
}
