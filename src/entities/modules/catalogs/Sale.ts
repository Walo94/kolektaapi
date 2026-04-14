// src/entities/modules/Sale.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "@/entities/admin/User";
import { Payment } from "@/entities/modules/catalogs/Payment";

export enum SaleStatus {
  PENDING = "pending", // Pendiente — tiene saldo por cobrar
  PAID = "paid", // Pagado — balance llegó a 0
  CANCELLED = "cancelled", // Cancelado manualmente
}

@Entity("sales")
@Index(["userId", "createdAt"])
export class Sale {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ── Relación con el usuario ───────────────────────────────────────────────
  @Column({ type: "varchar", length: 36 })
  @Index()
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  // ── Número de orden (legible por el usuario) ──────────────────────────────
  /**
   * Número de orden auto-generado dentro del contexto del usuario.
   * Ej: 1, 2, 3 … Se calcula en el servicio al crear.
   */
  @Column({ type: "int", unsigned: true })
  orderNum!: number;

  // ── Cliente ───────────────────────────────────────────────────────────────
  @Column({ type: "varchar", length: 150 })
  clientName!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  clientPhone!: string | null;

  // ── Descripción de la venta ───────────────────────────────────────────────
  /** Título corto. Ej: "Catálogo Andrea" */
  @Column({ type: "varchar", length: 150 })
  title!: string;

  /** Detalle de lo vendido. Ej: "2 pares zapatos talla 26 + bolsa" */
  @Column({ type: "varchar", length: 500 })
  description!: string;

  // ── Montos ────────────────────────────────────────────────────────────────
  /**
   * Monto total original de la venta.
   * Solo editable mientras no existan pagos registrados.
   */
  @Column({ type: "decimal", precision: 10, scale: 2 })
  totalAmount!: number;

  /**
   * Saldo pendiente de cobro.
   * Inicia igual a totalAmount y se reduce con cada pago.
   * Cuando llega a 0 el status cambia automáticamente a PAID.
   */
  @Column({ type: "decimal", precision: 10, scale: 2 })
  balance!: number;

  // ── Fecha acordada de la venta ────────────────────────────────────────────
  @Column({ type: "date" })
  date!: string; // "YYYY-MM-DD"

  // ── Estado ────────────────────────────────────────────────────────────────
  @Column({ type: "enum", enum: SaleStatus, default: SaleStatus.PENDING })
  status!: SaleStatus;

  // ── Relación con pagos ────────────────────────────────────────────────────
  @OneToMany(() => Payment, (p) => p.sale, { cascade: true })
  payments!: Payment[];

  // ── Timestamps ────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
