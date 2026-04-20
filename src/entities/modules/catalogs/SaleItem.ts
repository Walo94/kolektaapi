// src/entities/modules/catalogs/SaleItem.ts
//
// Snapshot de un producto dentro de una venta.
// Guarda description, unitPrice y quantity en el momento de agregar,
// de modo que editar o eliminar el Product original NO afecta la venta.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from "typeorm";
import { Sale } from "@/entities/modules/catalogs/Sale";

@Entity("sale_items")
export class SaleItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ── Relación con la venta ─────────────────────────────────────────────────
  @Column({ type: "varchar", length: 36 })
  @Index()
  saleId!: string;

  @ManyToOne(() => Sale, (s) => s.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "saleId" })
  sale!: Sale;

  // ── Referencia opcional al producto de catálogo ───────────────────────────
  // Puede ser null cuando se agregó como "producto libre" (sin catálogo).
  @Column({ type: "varchar", length: 36, nullable: true })
  productId!: string | null;

  // ── Snapshot del producto al momento de agregar ───────────────────────────
  /** Nombre/descripción capturado al agregar el ítem a la venta. */
  @Column({ type: "varchar", length: 200 })
  productName!: string;

  /** Precio unitario capturado al agregar el ítem a la venta. */
  @Column({ type: "decimal", precision: 10, scale: 2 })
  unitPrice!: number;

  /** Cantidad de unidades. */
  @Column({ type: "int", unsigned: true })
  quantity!: number;

  /** Subtotal calculado: unitPrice × quantity. */
  @Column({ type: "decimal", precision: 10, scale: 2 })
  subtotal!: number;

  // ── Timestamp ─────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt!: Date;
}
