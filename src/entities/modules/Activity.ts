// src/entities/modules/Activity.ts
// ── ACTUALIZACIÓN: se agregan tipos reales para el módulo catalog ─────────────

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

export enum ActivityModule {
  BATCH = "batch",
  GIVEAWAY = "giveaway",
  CATALOG = "catalog",
}

export enum ActivityType {
  // ── Tandas ────────────────────────────────────────────────────────────────
  BATCH_CREATED = "batch_created",
  BATCH_CANCELLED = "batch_cancelled",
  BATCH_DELETED = "batch_deleted",
  BATCH_FINISHED = "batch_finished",
  BATCH_DELIVERY_REGISTERED = "batch_delivery_registered",
  BATCH_PARTICIPANT_ADDED = "batch_participant_added",
  BATCH_PARTICIPANT_REMOVED = "batch_participant_removed",

  // ── Rifas ─────────────────────────────────────────────────────────────────
  GIVEAWAY_CREATED = "giveaway_created",
  GIVEAWAY_CANCELLED = "giveaway_cancelled",
  GIVEAWAY_DELETED = "giveaway_deleted",
  GIVEAWAY_WINNER_DRAWN = "giveaway_winner_drawn",
  GIVEAWAY_TICKET_SOLD = "giveaway_ticket_sold",
  GIVEAWAY_TICKET_CANCELLED = "giveaway_ticket_cancelled",

  // ── Catálogo — Ventas ─────────────────────────────────────────────────────
  CATALOG_SALE_CREATED = "catalog_sale_created",
  CATALOG_SALE_UPDATED = "catalog_sale_updated",
  CATALOG_SALE_CANCELLED = "catalog_sale_cancelled",
  CATALOG_SALE_DELETED = "catalog_sale_deleted",
  CATALOG_SALE_PAID = "catalog_sale_paid",

  // ── Catálogo — Pagos ──────────────────────────────────────────────────────
  CATALOG_PAYMENT_REGISTERED = "catalog_payment_registered",
  CATALOG_PAYMENT_CANCELLED = "catalog_payment_cancelled",
}

@Entity("activities")
@Index(["userId", "createdAt"])
export class Activity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  @Index()
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "enum", enum: ActivityModule })
  module!: ActivityModule;

  @Column({ type: "enum", enum: ActivityType })
  type!: ActivityType;

  @Column({ type: "varchar", length: 150 })
  title!: string;

  @Column({ type: "varchar", length: 500 })
  description!: string;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  amount!: number | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  referenceId!: string | null;

  @Column({ type: "json", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
