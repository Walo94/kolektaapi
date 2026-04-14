import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "@/entities/admin/User";

@Entity("device_tokens")
@Index(["userId", "token"], { unique: true })
export class DeviceToken {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  @Index()
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  /** Token FCM del dispositivo */
  @Column({ type: "varchar", length: 512 })
  token!: string;

  /** Para saber si el token sigue activo (FCM puede invalidarlos) */
  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
