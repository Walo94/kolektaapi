// src/entities/modules/catalogs/Sale.ts
// CAMBIOS respecto a la versión anterior:
//  - Se agrega la relación OneToMany con SaleItem (items)
//  - totalAmount ahora es calculado desde los items (el servicio lo recalcula)
//  - Se elimina el campo `description` de nivel superior (la descripción
//    ahora vive en cada SaleItem); se mantiene `title` como resumen.

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
import { SaleItem } from "@/entities/modules/catalogs/SaleItem";

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
  @Column({ type: "int", unsigned: true })
  orderNum!: number;

  // ── Cliente ───────────────────────────────────────────────────────────────
  @Column({ type: "varchar", length: 150 })
  clientName!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  clientPhone!: string | null;

  // ── Título de la venta ────────────────────────────────────────────────────
  /** Título corto. Ej: "Catálogo Andrea" */
  @Column({ type: "varchar", length: 150 })
  title!: string;

  // ── Montos ────────────────────────────────────────────────────────────────
  /**
   * Suma de subtotales de todos los SaleItems.
   * Se recalcula cada vez que se agregan / editan / eliminan ítems.
   */
  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  totalAmount!: number;

  /**
   * Saldo pendiente de cobro.
   * Inicia igual a totalAmount y se reduce con cada pago.
   */
  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  balance!: number;

  // ── Fecha acordada de la venta ────────────────────────────────────────────
  @Column({ type: "date" })
  date!: string; // "YYYY-MM-DD"

  // ── Estado ────────────────────────────────────────────────────────────────
  @Column({ type: "enum", enum: SaleStatus, default: SaleStatus.PENDING })
  status!: SaleStatus;

  // ── Relaciones ────────────────────────────────────────────────────────────
  @OneToMany(() => SaleItem, (i) => i.sale, { cascade: true })
  items!: SaleItem[];

  @OneToMany(() => Payment, (p) => p.sale, { cascade: true })
  payments!: Payment[];

  // ── Timestamps ────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
