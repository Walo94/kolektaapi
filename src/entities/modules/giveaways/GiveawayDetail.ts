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
import { Giveaway } from "@/entities/modules/giveaways/Giveaway";

export enum TicketStatus {
  FREE = "free", // Libre — disponible para apartar o vender
  RESERVED = "reserved", // Apartado — el cliente lo seleccionó pero aún no paga
  PAID = "paid", // Pagado — el organizador confirmó el pago
  WINNER = "winner", // Ganador — fue seleccionado en el sorteo
  CANCELLED = "cancelled", // Cancelado — fue liberado manualmente; vuelve a FREE lógicamente
  // (en práctica se elimina el registro y se recrea como FREE,
  //  pero se deja el enum por compatibilidad con reportes)
}

@Entity("giveaway_details")
@Index(["giveawayId", "ticketNumber"], { unique: true })
export class GiveawayDetail {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ── Relación con la rifa ──────────────────────────────────────────────────
  @Column({ type: "varchar", length: 36 })
  @Index()
  giveawayId!: string;

  @ManyToOne(() => Giveaway, (g) => g.details, { onDelete: "CASCADE" })
  @JoinColumn({ name: "giveawayId" })
  giveaway!: Giveaway;

  // ── Boleto ────────────────────────────────────────────────────────────────
  /** Número de boleto (1 … totalTickets) */
  @Column({ type: "int", unsigned: true })
  ticketNumber!: number;

  /** Precio del boleto al momento de la venta (snapshot del ticketPrice de la rifa) */
  @Column({ type: "decimal", precision: 10, scale: 2 })
  price!: number;

  // ── Estado ────────────────────────────────────────────────────────────────
  @Column({ type: "enum", enum: TicketStatus, default: TicketStatus.FREE })
  status!: TicketStatus;

  // ── Premio ────────────────────────────────────────────────────────────────
  /**
   * Lugar ganado en el sorteo. Ej: 1 = primer lugar, 2 = segundo lugar.
   * Null si el boleto no es ganador.
   */
  @Column({ type: "int", unsigned: true, nullable: true })
  prizePlace!: number | null;

  // ── Datos del cliente ─────────────────────────────────────────────────────
  /** Nombre del cliente. Null si el boleto está libre. */
  @Column({ type: "varchar", length: 150, nullable: true })
  clientName!: string | null;

  /** Teléfono del cliente. Null si no se proporcionó. */
  @Column({ type: "varchar", length: 20, nullable: true })
  clientPhone!: string | null;

  // ── Fecha de venta / apartado ─────────────────────────────────────────────
  /** Fecha en que se vendió o apartó el boleto. Null si está libre. */
  @Column({ type: "datetime", nullable: true })
  soldAt!: Date | null;

  // ── Timestamps ────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
