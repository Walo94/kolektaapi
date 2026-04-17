import { Router } from "express";
import { UserController } from "@/controllers/admin/UserController";
import { authMiddleware } from "@/middlewares/authMiddleware";

const router = Router();

// ── Rutas públicas ────────────────────────────────────────
router.post("/register", UserController.register);
router.post("/login", UserController.login);
router.get("/verify-email/:token", UserController.verifyEmail);

router.post("/forgot-password", UserController.requestEmailPasswordReset);
router.get("/reset-password/:token/verify", UserController.verifyResetToken);
router.post("/reset-password/:token", UserController.resetPassword);

// ── Rutas protegidas ────────────────────────────────────────
// Reenviar email de verificación
router.post(
  "/profile/resend-verification",
  authMiddleware,
  UserController.resendVerificationEmail,
);

router.post(
  "/profile/start-trial",
  authMiddleware,
  UserController.startFreeTrial,
);

router.put(
  "/profile/change-password",
  authMiddleware,
  UserController.changePassword,
);

// Enviar OTP de verificación de teléfono por WhatsApp
router.post(
  "/profile/send-phone-code",
  authMiddleware,
  UserController.sendPhoneVerificationCode,
);

// Verificar el OTP ingresado
router.post(
  "/profile/verify-phone",
  authMiddleware,
  UserController.verifyPhoneCode,
);

router.get(
  "/profile/refresh-info",
  authMiddleware,
  UserController.refreshUserInfo,
);

export default router;
