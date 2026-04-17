import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100 })
  fullName!: string;

  @Column({
    type: "varchar",
    length: 255,
    unique: true,
  })
  email!: string;

  @Column({
    type: "varchar",
    length: 255,
    unique: true,
    nullable: true,
  })
  phone!: string | null;

  @Column({ type: "varchar", length: 255, select: false })
  password!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  stripeCustomerId!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  purchaseId!: string | null;

  @Column({ type: "boolean", default: false })
  twoFactorEnabled!: boolean;

  @Column({ type: "varchar", length: 255, nullable: true, select: false })
  twoFactorSecret!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, select: false })
  resetPasswordToken!: string | null;

  @Column({ type: "timestamp", nullable: true, select: false })
  resetPasswordExpires!: Date | null;

  @Column({ type: "boolean", default: false })
  emailVerified!: boolean;

  @Column({ type: "varchar", length: 255, nullable: true, select: false })
  emailVerificationToken!: string | null;

  @Column({ type: "timestamp", nullable: true, select: false })
  emailVerificationExpires!: Date | null;

  // ── Verificación de teléfono (WhatsApp) ───────────────────
  @Column({ type: "boolean", default: false })
  phoneVerified!: boolean;

  // Código OTP de 6 dígitos hasheado
  @Column({ type: "varchar", length: 255, nullable: true, select: false })
  phoneVerificationCode!: string | null;

  // Expiración del OTP (10 minutos)
  @Column({ type: "timestamp", nullable: true, select: false })
  phoneVerificationExpires!: Date | null;

  // Intentos fallidos para proteger de fuerza bruta
  @Column({ type: "int", default: 0 })
  phoneVerificationAttempts!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
