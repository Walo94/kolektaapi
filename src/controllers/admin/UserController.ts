import { Request, Response } from "express";
import { UserService } from "@/services/admin/UserService";
import { GoogleAuthService } from "@/services/admin/GoogleAuthService";

export const UserController = {
  async register(req: Request, res: Response) {
    try {
      const { email, phone, password, fullName } = req.body;

      if (!email || !phone || !password || !fullName) {
        return res
          .status(400)
          .json({ message: "Todos los campos son requeridos!" });
      }

      const user = await UserService.register(req.body);

      res.status(201).json({
        message:
          "Usuario registrado exitosamente. Por favor verifica tu correo electrónico.",
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          fullName: user.fullName,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
      console.log("Error: ", error);
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Todos los campos son requeridos!" });
      }

      const result = await UserService.login(email, password);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  },

  async refreshUserInfo(req: Request, res: Response) {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ message: "Id no encontrado!" });
      }

      const result = await UserService.refreshUserInfo(id);
      res.json(result);
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  },

  async changePassword(req: any, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!currentPassword || !newPassword) {
        return res
          .status(400)
          .json({ error: "Todos los campos son requeridos" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          error: "La nueva contraseña debe tener al menos 6 caracteres",
        });
      }

      const result = await UserService.changePassword(
        userId,
        currentPassword,
        newPassword,
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async verifyEmail(req: Request, res: Response) {
    try {
      const { token } = req.params;
      if (!token) return res.status(400).json({ error: "Token es requerido" });

      const result = await UserService.verifyEmail(token as string);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async resendVerificationEmail(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const result = await UserService.resendVerificationEmail(userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async requestEmailPasswordReset(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return res
          .status(400)
          .json({ error: "El correo electrónico es requerido" });
      }

      const result = await UserService.requestEmailPasswordReset(email);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async verifyResetToken(req: Request, res: Response) {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ error: "Token es requerido" });
      }

      const result = await UserService.verifyResetToken(token as string);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async resetPassword(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const { newPassword } = req.body;

      if (!token || !newPassword) {
        return res
          .status(400)
          .json({ error: "Token y nueva contraseña son requeridos" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          error: "La nueva contraseña debe tener al menos 6 caracteres",
        });
      }

      const result = await UserService.resetPassword(
        token as string,
        newPassword,
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * POST /profile/send-phone-code
   * Genera un OTP y lo envía por WhatsApp al teléfono del usuario.
   * Requiere autenticación.
   */
  async sendPhoneVerificationCode(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const result = await UserService.sendPhoneVerificationCode(userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * POST /profile/verify-phone
   * Verifica el OTP ingresado por el usuario.
   * Body: { code: string }
   * Requiere autenticación.
   */
  async verifyPhoneCode(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ error: "El código es requerido" });
      }
      if (typeof code !== "string" || code.trim().length !== 6) {
        return res
          .status(400)
          .json({ error: "El código debe tener 6 dígitos" });
      }

      const result = await UserService.verifyPhoneCode(userId, code);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * POST /google/mobile
   * Recibe el idToken generado por google_sign_in en Flutter,
   * lo verifica con Google y devuelve un JWT propio + datos del usuario.
   *
   * Body: { idToken: string }
   *
   * Respuesta si el perfil está incompleto (falta teléfono):
   *   { requiresProfile: true, token, user }
   *
   * Respuesta si el perfil está completo:
   *   { token, user }
   */
  async googleMobileAuth(req: Request, res: Response) {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({ error: "idToken es requerido" });
      }

      // 1. Verificar el token con Google
      const payload = await GoogleAuthService.verifyMobileIdToken(idToken);

      // 2. Buscar / crear usuario en BD
      const user = await GoogleAuthService.findOrCreateFromPayload(payload);

      // 3. Generar JWT propio
      const result = GoogleAuthService.generateToken(user);

      // 4. Indicar si aún necesita completar su perfil (teléfono)
      if (user.googleProfileIncomplete) {
        return res.json({
          requiresProfile: true,
          ...result,
        });
      }

      res.json(result);
    } catch (error: any) {
      console.error("Google mobile auth error:", error);
      res.status(401).json({ error: "Autenticación con Google fallida" });
    }
  },

  async completeGoogleProfile(req: any, res: Response) {
    try {
      const { phone, fullName } = req.body;
      const userId = req.user.id;

      if (!phone || !fullName) {
        return res
          .status(400)
          .json({ error: "Teléfono y nombre completo son requeridos" });
      }

      if (phone.trim().length < 10) {
        return res
          .status(400)
          .json({ error: "El teléfono de usuario debe tener 10 caracteres" });
      }

      const result = await UserService.completeGoogleProfile(
        userId,
        phone.trim(),
        fullName.trim(),
      );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
};
