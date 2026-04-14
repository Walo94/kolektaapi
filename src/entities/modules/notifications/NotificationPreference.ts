import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  UpdateDateColumn,
} from "typeorm";
import { User } from "@/entities/admin/User";
import { NotificationType } from "./Notification";

@Entity("notification_preferences")
@Index(["userId", "type"], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  @Index()
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "enum", enum: NotificationType })
  type!: NotificationType;

  /** true = el usuario quiere recibir esta notificación */
  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  /**
   * Solo para BATCH_DELIVERY_REMINDER:
   * cuántos días antes del día de entrega se dispara.
   * 0 = el mismo día. Null para tipos que no aplica.
   */
  @Column({ type: "int", unsigned: true, nullable: true, default: null })
  daysBeforeDelivery!: number | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
