// src/entities/modules/catalogs/Product.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "@/entities/admin/User";

@Entity("products")
@Index(["userId", "createdAt"])
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ── Relación con el usuario ───────────────────────────────────────────────
  @Column({ type: "varchar", length: 36 })
  @Index()
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  // ── Campos del producto ───────────────────────────────────────────────────
  @Column({ type: "varchar", length: 200 })
  description!: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  price!: number;

  // ── Imagen (Cloudinary) ───────────────────────────────────────────────────
  @Column({ type: "varchar", length: 500, nullable: true })
  imageUrl!: string | null;

  @Column({ type: "varchar", length: 300, nullable: true })
  imagePublicId!: string | null;

  // ── Timestamps ────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
