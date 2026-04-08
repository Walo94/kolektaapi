import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { User } from "@/entities/admin/User";
import { BatchDetail } from "@/entities/modules/batchs/BatchDetail";

export enum BatchStatus {
  ACTIVE = "active",
  FINISHED = "finished",
  CANCELLED = "cancelled",
}

export enum BatchFrequency {
  WEEKLY = "weekly",
  BIWEEKLY = "biweekly",
  MONTHLY = "monthly",
}

@Entity("batchs")
export class Batch {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Usuario administrador que creó la tanda */
  @Column({ type: "varchar", length: 36 })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user!: User;

  /** Nombre descriptivo de la tanda, ej: "Tanda de Navidad 2025" */
  @Column({ type: "varchar", length: 150 })
  name!: string;

  /**
   * Precio de entrada por número.
   * El monto total a cobrar por turno = entryPrice * totalSlots
   */
  @Column({ type: "decimal", precision: 10, scale: 2 })
  entryPrice!: number;

  /**
   * Total de lugares/números en la tanda.
   * Determina cuántos TandaDetail se crean.
   */
  @Column({ type: "int" })
  totalSlots!: number;

  /** Periodicidad de las entregas */
  @Column({
    type: "enum",
    enum: BatchFrequency,
    default: BatchFrequency.WEEKLY,
  })
  frequency!: BatchFrequency;

  @Column({
    type: "enum",
    enum: BatchStatus,
    default: BatchStatus.ACTIVE,
  })
  status!: BatchStatus;

  /**
   * Último número/turno entregado.
   * 0 = aún no se ha hecho ninguna entrega.
   * Cuando currentTurn === totalSlots la tanda puede marcarse como FINISHED.
   */
  @Column({ type: "int", default: 0 })
  currentTurn!: number;

  /** Fecha en que inicia la tanda (primera entrega) */
  @Column({ type: "date" })
  startDate!: Date;

  /**
   * Fecha de la próxima entrega.
   * Se recalcula cada vez que se registra una entrega.
   */
  @Column({ type: "date", nullable: true })
  nextDeliveryDate!: Date | null;

  /**
   * Token único para generar la URL pública de consulta.
   * Ej: /public/tanda/:publicToken
   */
  @Column({ type: "varchar", length: 64, unique: true })
  publicToken!: string;

  /** Notas u observaciones opcionales del administrador */
  @Column({ type: "text", nullable: true })
  notes!: string | null;

  /**
   * URL pública de la imagen de portada almacenada en Cloudinary.
   * Opcional — null si el usuario no subió imagen.
   * Ej: "https://res.cloudinary.com/djzm0mzck/image/upload/v.../batch_xyz.jpg"
   */
  @Column({ type: "varchar", length: 500, nullable: true })
  coverImage!: string | null;

  /**
   * Public ID de Cloudinary para poder eliminar/reemplazar la imagen.
   * Ej: "kolekta/batchs/batch_abc123"
   */
  @Column({ type: "varchar", length: 255, nullable: true })
  coverImagePublicId!: string | null;

  @OneToMany(() => BatchDetail, (detail) => detail.batch)
  details!: BatchDetail[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
