import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Batch } from "@/entities/modules/batchs/Batch";

export enum BatchDetailStatus {
  PENDING = "pending",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
}

@Entity("batch_details")
export class BatchDetail {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  batchId!: string;

  @ManyToOne(() => Batch, (batch) => batch.details, { onDelete: "CASCADE" })
  @JoinColumn({ name: "batchId" })
  batch!: Batch;

  /**
   * Posición en la fila (row) que define el orden de entrega.
   * Ejemplo: row=1 cobra primero, row=10 cobra último.
   * Único dentro de la misma tanda.
   */
  @Column({ type: "int" })
  row!: number;

  /**
   * Número elegido por el participante.
   * Puede diferir del row cuando el admin permite elegir número libre.
   * Ejemplo: row=3, assignedNumber=7 (el participante eligió el 7).
   * Único dentro de la misma tanda.
   */
  @Column({ type: "int" })
  assignedNumber!: number;

  /** Nombre o alias del participante */
  @Column({ type: "varchar", length: 150 })
  contactName!: string;

  /** Teléfono del participante (puede ser con formato internacional) */
  @Column({ type: "varchar", length: 30, nullable: true })
  phone!: string | null;

  /** Correo electrónico opcional */
  @Column({ type: "varchar", length: 255, nullable: true })
  email!: string | null;

  /**
   * Fecha programada para recibir el dinero.
   * Se calcula automáticamente desde startDate + frequency * (row - 1).
   */
  @Column({ type: "date" })
  deliveryDate!: Date;

  /**
   * Monto total que recibirá este participante en su turno.
   * = tanda.entryPrice * tanda.totalSlots
   * Se guarda desnormalizado para facilitar reportes.
   */
  @Column({ type: "decimal", precision: 10, scale: 2 })
  payoutAmount!: number;

  @Column({
    type: "enum",
    enum: BatchDetailStatus,
    default: BatchDetailStatus.PENDING,
  })
  status!: BatchDetailStatus;

  /** Fecha real en que se realizó la entrega */
  @Column({ type: "timestamp", nullable: true })
  deliveredAt!: Date | null;

  /** Notas opcionales del administrador para este participante */
  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
