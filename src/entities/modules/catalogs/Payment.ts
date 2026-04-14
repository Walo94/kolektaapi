// src/entities/modules/Payment.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Sale } from "@/entities/modules/catalogs/Sale";

export enum PaymentStatus {
  PAID = "paid", // Pago registrado y activo
  CANCELLED = "cancelled", // Pago cancelado (su monto regresa al balance de la venta)
}

@Entity("payments")
@Index(["saleId", "createdAt"])
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ── Relación con la venta ─────────────────────────────────────────────────
  @Column({ type: "varchar", length: 36 })
  @Index()
  saleId!: string;

  @ManyToOne(() => Sale, (s) => s.payments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "saleId" })
  sale!: Sale;

  // ── Fecha del pago ────────────────────────────────────────────────────────
  /** Fecha y hora en que se registró o acordó el pago */
  @Column({ type: "datetime" })
  date!: Date;

  // ── Monto ─────────────────────────────────────────────────────────────────
  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount!: number;

  // ── Estado ────────────────────────────────────────────────────────────────
  @Column({ type: "enum", enum: PaymentStatus, default: PaymentStatus.PAID })
  status!: PaymentStatus;

  // ── Timestamp ─────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt!: Date;

  // Los pagos NO tienen updatedAt — no se editan, solo se cancelan
}
