import { AppDataSource } from "@/config/data-source";
import { User } from "@/entities/admin/User";
import { EmailService } from "@/services/utils/EmailService";
import { WhatsAppService } from "@/services/utils/WhatsAppService";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const userRepo = AppDataSource.getRepository(User);

export enum SubscriptionPlan {
  FREE = "free",
  TRIAL = "trial",
  PREMIUM = "premium",
}

export const UserService = {
  async register(data: any) {
    const { email, password, fullName, userAccount, phone } = data;

    // Validar que el correo o teléfono no existan
    const existingUser = await userRepo.findOne({
      where: [{ email }, { phone }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new Error("El correo electrónico ya está registrado");
      }
      if (existingUser.phone === phone) {
        throw new Error("El número de teléfono ya está registrado");
      }
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generar token de verificación de email
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    // Expiración: 24 horas
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const newObj = userRepo.create({
      email,
      password: hashedPassword,
      fullName,
      phone,
      emailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: verificationExpiry,
    });

    const saved = await userRepo.save(newObj);

    // Enviar email de verificación
    await EmailService.sendEmailVerification(
      saved.email,
      verificationToken,
      saved.fullName,
    );

    return saved;
  },

  async login(email: string, password: string) {
    const user = await userRepo.findOne({
      where: { email },
      select: [
        "id",
        "email",
        "password",
        "fullName",
        "phone",
        "emailVerified",
        "phoneVerified",
        "createdAt",
      ],
    });

    if (!user) throw new Error("Usuario no encontrado");
    if (!(await bcrypt.compare(password, user.password)))
      throw new Error("Datos incorrectos");

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "1d" },
    );

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        createdAt: user.createdAt,
      },
      token,
    };
  },

  async refreshUserInfo(id: string) {
    const user = await userRepo.findOne({
      where: { id },
      select: [
        "id",
        "email",
        "fullName",
        "phone",
        "emailVerified",
        "createdAt",
      ],
    });

    if (!user) throw new Error("No se puedo obtener la información");

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
    };
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await userRepo.findOne({
      where: { id: userId },
      select: ["id", "password"],
    });

    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    // Verificar contraseña actual
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new Error("La contraseña actual es incorrecta");
    }

    // Encriptar nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    user.password = hashedPassword;
    await userRepo.save(user);

    return { message: "Contraseña actualizada exitosamente" };
  },

  async verifyEmail(token: string) {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await userRepo.findOne({
      where: { emailVerificationToken: hashedToken },
      select: [
        "id",
        "email",
        "fullName",
        "emailVerificationExpires",
        "emailVerified",
        "emailVerificationToken",
      ],
    });

    if (!user) {
      throw new Error("Token inválido o expirado");
    }

    if (user.emailVerified) {
      throw new Error("El correo ya ha sido verificado");
    }

    if (user.emailVerificationExpires! < new Date()) {
      throw new Error("El token ha expirado. Solicita uno nuevo.");
    }

    // Usar update directo en lugar de save para garantizar la persistencia
    await userRepo.update(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });

    return { message: "Correo verificado exitosamente" };
  },

  async resendVerificationEmail(userId: string) {
    const user = await userRepo.findOne({
      where: { id: userId },
      select: ["id", "email", "fullName", "emailVerified"],
    });

    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    if (user.emailVerified) {
      throw new Error("El correo ya está verificado");
    }

    // Generar nuevo token de verificación
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    // Expiración: 24 horas
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = verificationExpiry;
    await userRepo.save(user);

    // Enviar email de verificación
    await EmailService.sendEmailVerification(
      user.email,
      verificationToken,
      user.fullName,
    );

    return { message: "Correo de verificación enviado exitosamente" };
  },

  async requestEmailPasswordReset(email: string) {
    const user = await userRepo.findOne({
      where: { email },
      select: ["id", "email", "fullName"],
    });

    if (!user) {
      // Por seguridad, no revelamos si el usuario existe o no
      return {
        message:
          "Si el correo existe en nuestro sistema, recibirás las instrucciones de recuperación.",
      };
    }

    // Generar token aleatorio seguro
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash del token para guardarlo en la BD
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Expiración: 1 hora
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    // Guardar en el usuario
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await userRepo.save(user);

    // Enviar email con el token original (no hasheado)
    await EmailService.sendPasswordResetEmail(
      user.email,
      resetToken,
      user.fullName,
    );

    return {
      message:
        "Si el correo existe en nuestro sistema, recibirás las instrucciones de recuperación.",
    };
  },

  /**
   * Resetea la contraseña usando el token
   */
  async resetPassword(token: string, newPassword: string) {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await userRepo.findOne({
      where: { resetPasswordToken: hashedToken },
      select: ["id", "email", "fullName", "resetPasswordExpires"],
    });

    if (!user) {
      throw new Error("Token inválido o expirado");
    }

    if (user.resetPasswordExpires! < new Date()) {
      throw new Error("El token ha expirado. Solicita uno nuevo.");
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña y limpiar tokens
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await userRepo.save(user);

    // Enviar email de confirmación
    await EmailService.sendPasswordChangedEmail(user.email, user.fullName);

    return { message: "Contraseña restablecida exitosamente" };
  },

  /**
   * Verifica que el token sea válido
   */
  async verifyResetToken(token: string) {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await userRepo.findOne({
      where: { resetPasswordToken: hashedToken },
      select: ["id", "resetPasswordExpires"],
    });

    if (!user) {
      throw new Error("Token inválido o expirado");
    }

    if (user.resetPasswordExpires! < new Date()) {
      throw new Error("Token expirado");
    }

    return { message: "Token válido" };
  },

  /**
   * Genera un OTP de 6 dígitos, lo guarda hasheado y lo envía
   * por WhatsApp al teléfono del usuario.
   */
  async sendPhoneVerificationCode(userId: string) {
    const user = await userRepo.findOne({
      where: { id: userId },
      select: [
        "id",
        "phone",
        "fullName",
        "phoneVerified",
        "phoneVerificationAttempts",
      ],
    });

    if (!user) throw new Error("Usuario no encontrado");
    if (!user.phone) throw new Error("El usuario no tiene teléfono registrado");
    if (user.phoneVerified) throw new Error("El teléfono ya está verificado");

    // Generar OTP de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hashear para no guardar el código en texto plano
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    // Expiración: 10 minutos
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await userRepo.update(user.id, {
      phoneVerificationCode: hashedOtp,
      phoneVerificationExpires: otpExpiry,
      phoneVerificationAttempts: 0,
    });

    await WhatsAppService.sendPhoneVerificationCode(
      user.phone,
      otp,
      user.fullName,
    );

    return { message: "Código de verificación enviado por WhatsApp" };
  },

  /**
   * Verifica el OTP ingresado por el usuario.
   * Protege contra fuerza bruta: máximo 5 intentos.
   */
  async verifyPhoneCode(userId: string, code: string) {
    const user = await userRepo.findOne({
      where: { id: userId },
      select: [
        "id",
        "phone",
        "fullName",
        "phoneVerified",
        "phoneVerificationCode",
        "phoneVerificationExpires",
        "phoneVerificationAttempts",
      ],
    });

    if (!user) throw new Error("Usuario no encontrado");
    if (user.phoneVerified) throw new Error("El teléfono ya está verificado");

    // Control de intentos fallidos
    if (user.phoneVerificationAttempts >= 5) {
      throw new Error(
        "Demasiados intentos fallidos. Solicita un nuevo código.",
      );
    }

    if (!user.phoneVerificationCode || !user.phoneVerificationExpires) {
      throw new Error("No hay un código activo. Solicita uno nuevo.");
    }

    if (user.phoneVerificationExpires < new Date()) {
      throw new Error("El código ha expirado. Solicita uno nuevo.");
    }

    // Comparar con el hash guardado
    const hashedInput = crypto
      .createHash("sha256")
      .update(code.trim())
      .digest("hex");

    if (hashedInput !== user.phoneVerificationCode) {
      // Incrementar intentos fallidos
      await userRepo.update(user.id, {
        phoneVerificationAttempts: user.phoneVerificationAttempts + 1,
      });
      const remaining = 4 - user.phoneVerificationAttempts;
      throw new Error(`Código incorrecto. Te quedan ${remaining} intento(s).`);
    }

    // Código correcto: marcar teléfono como verificado y limpiar campos
    await userRepo.update(user.id, {
      phoneVerified: true,
      phoneVerificationCode: null,
      phoneVerificationExpires: null,
      phoneVerificationAttempts: 0,
    });

    // Enviar confirmación por WhatsApp
    await WhatsAppService.sendPhoneVerifiedConfirmation(
      user.phone!,
      user.fullName,
    );

    return { message: "Teléfono verificado exitosamente" };
  },

  async startFreeTrial(userId: string) {
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error("Usuario no encontrado");

    if (user.trialEndsAt && user.trialEndsAt > new Date()) {
      throw new Error("Ya tienes un trial activo");
    }

    user.subscriptionPlan = SubscriptionPlan.TRIAL;
    user.trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
    await userRepo.save(user);

    return { message: "Prueba gratis de 7 días activada" };
  },
};
