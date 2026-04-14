// src/entities/modules/giveaways/GiveawayPrize.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Giveaway } from "@/entities/modules/giveaways/Giveaway";

/**
 * Descripción e imagen opcional de cada lugar de premio en una rifa.
 * Ej: prizePlace=1 → "iPhone 15 Pro Max", prizePlace=2 → "AirPods Pro"
 */
@Entity("giveaway_prizes")
@Index(["giveawayId", "prizePlace"], { unique: true })
export class GiveawayPrize {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  @Index()
  giveawayId!: string;

  @ManyToOne(() => Giveaway, (g) => g.prizes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "giveawayId" })
  giveaway!: Giveaway;

  /** Lugar al que corresponde este premio (1 = primer lugar, 2 = segundo, …) */
  @Column({ type: "int", unsigned: true })
  prizePlace!: number;

  /** Descripción textual del premio. Ej: "iPhone 15 Pro Max 256 GB" */
  @Column({ type: "varchar", length: 500 })
  description!: string;

  /** URL pública en Cloudinary. Null si no se subió imagen para este premio. */
  @Column({ type: "varchar", length: 500, nullable: true })
  imageUrl!: string | null;

  /** Public ID de Cloudinary para poder eliminarla. */
  @Column({ type: "varchar", length: 300, nullable: true })
  imagePublicId!: string | null;
}
