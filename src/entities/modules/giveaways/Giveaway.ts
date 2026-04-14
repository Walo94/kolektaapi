// src/entities/modules/giveaways/Giveaway.ts

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
import { GiveawayDetail } from "@/entities/modules/giveaways/GiveawayDetail";
import { GiveawayPrize } from "@/entities/modules/giveaways/GiveawayPrize";

export enum GiveawayStatus {
  OPEN = "open", // Abierta — en venta de boletos
  FINISHED = "finished", // Sorteo realizado — ganadores asignados
  CANCELLED = "cancelled", // Cancelada manualmente antes del sorteo
}

@Entity("giveaways")
@Index(["userId", "createdAt"])
export class Giveaway {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ── Relación con el usuario ───────────────────────────────────────────────
  @Column({ type: "varchar", length: 36 })
  @Index()
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  // ── Información general ───────────────────────────────────────────────────
  /** Título corto. Ej: "Rifa entre amigos" */
  @Column({ type: "varchar", length: 150 })
  title!: string;

  /** Descripción larga con detalles de premios, causa, etc. */
  @Column({ type: "varchar", length: 1000, nullable: true })
  description!: string | null;

  // ── Fecha del sorteo ──────────────────────────────────────────────────────
  @Column({ type: "date" })
  drawDate!: string; // "YYYY-MM-DD"

  // ── Sorteo automático ─────────────────────────────────────────────────────
  /**
   * Fecha y hora exacta para ejecutar el sorteo automático.
   * Null = sorteo manual. Si se establece, el scheduler llamará
   * a drawWinnersRandom en esa fecha/hora.
   */
  @Column({ type: "datetime", nullable: true })
  autoDrawAt!: Date | null;

  /**
   * Indica si el sorteo automático ya fue ejecutado (para evitar doble ejecución).
   * Solo relevante cuando autoDrawAt != null.
   */
  @Column({ type: "boolean", default: false })
  autoDrawExecuted!: boolean;

  // ── Boletos ───────────────────────────────────────────────────────────────
  /** Precio por boleto */
  @Column({ type: "decimal", precision: 10, scale: 2 })
  ticketPrice!: number;

  /** Total de boletos generados al crear la rifa (mínimo 2) */
  @Column({ type: "int", unsigned: true })
  totalTickets!: number;

  /**
   * Boletos vendidos = count de details con status SOLD o PAID o WINNER.
   * Se mantiene como campo desnormalizado para evitar counts frecuentes.
   */
  @Column({ type: "int", unsigned: true, default: 0 })
  soldTickets!: number;

  // ── Premios ───────────────────────────────────────────────────────────────
  /**
   * Número de premios que se rifan.
   * Las descripciones/imágenes de cada lugar van en GiveawayPrize.
   */
  @Column({ type: "int", unsigned: true, default: 1 })
  prizeCount!: number;

  // ── Imagen de portada ─────────────────────────────────────────────────────
  /** URL pública en Cloudinary. Null si no se subió imagen. */
  @Column({ type: "varchar", length: 500, nullable: true })
  coverImage!: string | null;

  /** Public ID de Cloudinary para poder eliminarla. */
  @Column({ type: "varchar", length: 300, nullable: true })
  coverImagePublicId!: string | null;

  // ── Token público ─────────────────────────────────────────────────────────
  @Column({ type: "varchar", length: 64, unique: true })
  publicToken!: string;

  // ── Estado ────────────────────────────────────────────────────────────────
  @Column({ type: "enum", enum: GiveawayStatus, default: GiveawayStatus.OPEN })
  status!: GiveawayStatus;

  // ── Relaciones ────────────────────────────────────────────────────────────
  @OneToMany(() => GiveawayDetail, (d) => d.giveaway, { cascade: true })
  details!: GiveawayDetail[];

  /** Descripciones de premios por lugar (1°, 2°, …) */
  @OneToMany(() => GiveawayPrize, (p) => p.giveaway, {
    cascade: true,
    eager: true,
  })
  prizes!: GiveawayPrize[];

  // ── Timestamps ────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
