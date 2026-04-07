import { Resend } from "resend";

// Inicializar Resend con la API key
const resend = new Resend(process.env.RESEND_API_KEY);

export const EmailService = {
  async sendEmailVerification(
    to: string,
    verificationToken: string,
    fullName: string,
  ): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;

    // Logo de Kolekta alojado en tu dominio (colócalo en /public/logo.png de tu React app)
    const logoUrl = `${process.env.FRONTEND_URL}/logo.png`;

    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to,
        subject: `Verifica tu correo electrónico - Kolekta App`,
        html: `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verificación de correo - Kolekta</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f0f4ff;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" style="width: 100%; max-width: 580px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(30, 100, 220, 0.12);">

            <!-- Header con gradiente Kolekta -->
            <tr>
              <td align="center" style="padding: 36px 30px 28px 30px; background: linear-gradient(135deg, #1E64DC 0%, #2D8EFF 60%, #4FAFFF 100%);">
                <!-- Logo -->
                <img
                  src="${logoUrl}"
                  alt="Kolekta"
                  width="140"
                  style="display: block; margin: 0 auto; max-width: 140px;"
                  onerror="this.style.display='none'"
                />
                <!-- Fallback text si el logo no carga -->
                <h1 style="margin: 12px 0 0 0; color: #ffffff; font-size: 26px; font-weight: bold; letter-spacing: -0.5px;">
                  Kolekta
                </h1>
                <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 13px; letter-spacing: 1px;">
                  Tandas &bull; Rifas &bull; Pagos
                </p>
              </td>
            </tr>

            <!-- Cuerpo -->
            <tr>
              <td style="padding: 40px 36px 32px 36px;">

                <!-- Ícono de sobre -->
                <table role="presentation" style="margin: 0 auto 24px auto;">
                  <tr>
                    <td align="center" style="width: 60px; height: 60px; background-color: #EEF4FF; border-radius: 50%;">
                      <span style="font-size: 28px; line-height: 60px; display: block;">✉️</span>
                    </td>
                  </tr>
                </table>

                <h2 style="margin: 0 0 12px 0; color: #1a1a2e; font-size: 22px; font-weight: bold; text-align: center;">
                  ¡Bienvenido, ${fullName}!
                </h2>

                <p style="margin: 0 0 16px 0; color: #555577; font-size: 15px; line-height: 1.7; text-align: center;">
                  Gracias por registrarte en <strong style="color: #1E64DC;">Kolekta App</strong>.<br>
                  Para activar tu cuenta y empezar a usar tandas, rifas y pagos, necesitamos verificar tu correo electrónico.
                </p>

                <p style="margin: 0 0 28px 0; color: #555577; font-size: 15px; line-height: 1.7; text-align: center;">
                  Haz clic en el botón para continuar:
                </p>

                <!-- Botón de verificación -->
                <table role="presentation" style="margin: 0 auto 28px auto;">
                  <tr>
                    <td align="center" style="border-radius: 10px; background-color: #1E64DC; box-shadow: 0 4px 14px rgba(30,100,220,0.35);">
                      <a
                        href="${verificationUrl}"
                        target="_blank"
                        style="display: inline-block; padding: 15px 44px; color: #ffffff !important; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 10px; letter-spacing: 0.3px; mso-padding-alt: 15px 44px;"
                      >
                        <span style="color: #ffffff; font-size: 16px; font-weight: bold;">Verificar mi correo</span>
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Enlace alternativo -->
                <p style="margin: 0 0 6px 0; color: #888899; font-size: 13px; line-height: 1.6; text-align: center;">
                  O copia y pega este enlace en tu navegador:
                </p>
                <p style="margin: 0 0 28px 0; text-align: center;">
                  <a href="${verificationUrl}" style="color: #1E64DC; font-size: 12px; word-break: break-all; text-decoration: underline;">
                    ${verificationUrl}
                  </a>
                </p>

                <!-- Aviso de expiración -->
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 14px 18px; background-color: #FFF8E7; border-left: 4px solid #FFC107; border-radius: 6px;">
                      <p style="margin: 0; color: #7a6000; font-size: 13px; line-height: 1.6;">
                        <strong>⚠️ Importante:</strong> Este enlace expirará en <strong>24 horas</strong> por razones de seguridad. Si no lo usas a tiempo, podrás solicitar uno nuevo desde la app.
                      </p>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- Separador de colores de marca -->
            <tr>
              <td style="height: 5px; background: linear-gradient(90deg, #1E64DC 0%, #2D8EFF 40%, #4CAF50 70%, #FFC107 100%);"></td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 24px 36px; background-color: #f7f9ff; border-radius: 0 0 16px 16px;">
                <p style="margin: 0 0 8px 0; color: #aaaacc; font-size: 12px; text-align: center;">
                  Si no te registraste en Kolekta App, puedes ignorar este correo de forma segura.
                </p>
                <p style="margin: 0 0 8px 0; color: #aaaacc; font-size: 12px; text-align: center;">
                  Este es un correo automático, por favor no respondas a este mensaje.
                </p>
                <p style="margin: 0; color: #aaaacc; font-size: 12px; text-align: center;">
                  © ${new Date().getFullYear()} <strong style="color: #1E64DC;">Kolekta App</strong>. Todos los derechos reservados.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
      `,
        text: `
Hola ${fullName},

Gracias por registrarte en Kolekta App (Tandas • Rifas • Pagos).

Para verificar tu correo electrónico, visita el siguiente enlace:
${verificationUrl}

Este enlace expirará en 24 horas por razones de seguridad.

Si no te registraste en Kolekta App, puedes ignorar este correo de forma segura.

Saludos,
El equipo de Kolekta App
      `,
      });

      console.log(`Email de verificación enviado a: ${to}`);
    } catch (error) {
      console.error("Error al enviar email con Resend:", error);
      throw new Error("No se pudo enviar el correo de verificación");
    }
  },

  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    userName: string,
  ): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const logoUrl = `${process.env.FRONTEND_URL}/logo.png`;

    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to,
        subject: `Recupera tu contraseña - Kolekta App`,
        html: `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recuperación de contraseña - Kolekta</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f0f4ff;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" style="width: 100%; max-width: 580px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(30, 100, 220, 0.12);">

            <!-- Header con gradiente Kolekta -->
            <tr>
              <td align="center" style="padding: 36px 30px 28px 30px; background: linear-gradient(135deg, #1E64DC 0%, #2D8EFF 60%, #4FAFFF 100%);">
                <img
                  src="${logoUrl}"
                  alt="Kolekta"
                  width="140"
                  style="display: block; margin: 0 auto; max-width: 140px;"
                  onerror="this.style.display='none'"
                />
                <h1 style="margin: 12px 0 0 0; color: #ffffff; font-size: 26px; font-weight: bold; letter-spacing: -0.5px;">
                  Kolekta
                </h1>
                <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 13px; letter-spacing: 1px;">
                  Tandas &bull; Rifas &bull; Pagos
                </p>
              </td>
            </tr>

            <!-- Cuerpo -->
            <tr>
              <td style="padding: 40px 36px 32px 36px;">

                <!-- Ícono de candado -->
                <table role="presentation" style="margin: 0 auto 24px auto;">
                  <tr>
                    <td align="center" style="width: 60px; height: 60px; background-color: #EEF4FF; border-radius: 50%;">
                      <span style="font-size: 28px; line-height: 60px; display: block;">🔒</span>
                    </td>
                  </tr>
                </table>

                <h2 style="margin: 0 0 12px 0; color: #1a1a2e; font-size: 22px; font-weight: bold; text-align: center;">
                  ¿Olvidaste tu contraseña?
                </h2>

                <p style="margin: 0 0 16px 0; color: #555577; font-size: 15px; line-height: 1.7; text-align: center;">
                  Hola, <strong style="color: #1E64DC;">${userName}</strong>.<br>
                  Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong style="color: #1E64DC;">Kolekta App</strong>.
                </p>

                <p style="margin: 0 0 28px 0; color: #555577; font-size: 15px; line-height: 1.7; text-align: center;">
                  Haz clic en el botón para continuar:
                </p>

                <!-- Botón de recuperación -->
                <table role="presentation" style="margin: 0 auto 28px auto;">
                  <tr>
                    <td align="center" style="border-radius: 10px; background-color: #1E64DC; box-shadow: 0 4px 14px rgba(30,100,220,0.35);">
                      <a
                        href="${resetUrl}"
                        target="_blank"
                        style="display: inline-block; padding: 15px 44px; color: #ffffff !important; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 10px; letter-spacing: 0.3px; mso-padding-alt: 15px 44px;"
                      >
                        <span style="color: #ffffff; font-size: 16px; font-weight: bold;">Restablecer contraseña</span>
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Enlace alternativo -->
                <p style="margin: 0 0 6px 0; color: #888899; font-size: 13px; line-height: 1.6; text-align: center;">
                  O copia y pega este enlace en tu navegador:
                </p>
                <p style="margin: 0 0 28px 0; text-align: center;">
                  <a href="${resetUrl}" style="color: #1E64DC; font-size: 12px; word-break: break-all; text-decoration: underline;">
                    ${resetUrl}
                  </a>
                </p>

                <!-- Aviso de expiración -->
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 14px 18px; background-color: #FFF8E7; border-left: 4px solid #FFC107; border-radius: 6px;">
                      <p style="margin: 0; color: #7a6000; font-size: 13px; line-height: 1.6;">
                        <strong>⚠️ Importante:</strong> Este enlace expirará en <strong>1 hora</strong> por razones de seguridad. Si no lo solicitaste, puedes ignorar este correo.
                      </p>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- Separador de colores de marca -->
            <tr>
              <td style="height: 5px; background: linear-gradient(90deg, #1E64DC 0%, #2D8EFF 40%, #4CAF50 70%, #FFC107 100%);"></td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 24px 36px; background-color: #f7f9ff; border-radius: 0 0 16px 16px;">
                <p style="margin: 0 0 8px 0; color: #aaaacc; font-size: 12px; text-align: center;">
                  Si no solicitaste restablecer tu contraseña, puedes ignorar este correo de forma segura.
                </p>
                <p style="margin: 0 0 8px 0; color: #aaaacc; font-size: 12px; text-align: center;">
                  Este es un correo automático, por favor no respondas a este mensaje.
                </p>
                <p style="margin: 0; color: #aaaacc; font-size: 12px; text-align: center;">
                  © ${new Date().getFullYear()} <strong style="color: #1E64DC;">Kolekta App</strong>. Todos los derechos reservados.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
        `,
        text: `
Hola ${userName},

Recibimos una solicitud para restablecer tu contraseña en Kolekta App (Tandas • Rifas • Pagos).

Para restablecer tu contraseña, visita el siguiente enlace:
${resetUrl}

Este enlace expirará en 1 hora por razones de seguridad.

Si no realizaste esta solicitud, puedes ignorar este correo de forma segura.

Saludos,
El equipo de Kolekta App
        `,
      });

      console.log(`Email de recuperación enviado a: ${to}`);
    } catch (error) {
      console.error("Error al enviar email con Resend:", error);
      throw new Error("No se pudo enviar el correo de recuperación");
    }
  },

  async sendPasswordChangedEmail(to: string, userName: string): Promise<void> {
    const logoUrl = `${process.env.FRONTEND_URL}/logo.png`;

    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to,
        subject: `Tu contraseña ha sido cambiada - Kolekta App`,
        html: `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contraseña cambiada - Kolekta</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f0f4ff;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" style="width: 100%; max-width: 580px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(30, 100, 220, 0.12);">

            <!-- Header con gradiente Kolekta -->
            <tr>
              <td align="center" style="padding: 36px 30px 28px 30px; background: linear-gradient(135deg, #1E64DC 0%, #2D8EFF 60%, #4FAFFF 100%);">
                <img
                  src="${logoUrl}"
                  alt="Kolekta"
                  width="140"
                  style="display: block; margin: 0 auto; max-width: 140px;"
                  onerror="this.style.display='none'"
                />
                <h1 style="margin: 12px 0 0 0; color: #ffffff; font-size: 26px; font-weight: bold; letter-spacing: -0.5px;">
                  Kolekta
                </h1>
                <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 13px; letter-spacing: 1px;">
                  Tandas &bull; Rifas &bull; Pagos
                </p>
              </td>
            </tr>

            <!-- Cuerpo -->
            <tr>
              <td style="padding: 40px 36px 32px 36px;">

                <!-- Ícono de candado abierto -->
                <table role="presentation" style="margin: 0 auto 24px auto;">
                  <tr>
                    <td align="center" style="width: 60px; height: 60px; background-color: #EEF4FF; border-radius: 50%;">
                      <span style="font-size: 28px; line-height: 60px; display: block;">🔐</span>
                    </td>
                  </tr>
                </table>

                <h2 style="margin: 0 0 12px 0; color: #1a1a2e; font-size: 22px; font-weight: bold; text-align: center;">
                  Contraseña actualizada
                </h2>

                <p style="margin: 0 0 16px 0; color: #555577; font-size: 15px; line-height: 1.7; text-align: center;">
                  Hola, <strong style="color: #1E64DC;">${userName}</strong>.<br>
                  Te confirmamos que la contraseña de tu cuenta en <strong style="color: #1E64DC;">Kolekta App</strong> ha sido cambiada exitosamente.
                </p>

                <!-- Aviso de confirmación -->
                <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                  <tr>
                    <td style="padding: 14px 18px; background-color: #EEFAF3; border-left: 4px solid #4CAF50; border-radius: 6px;">
                      <p style="margin: 0; color: #1a6e3a; font-size: 13px; line-height: 1.6;">
                        <strong>✅ Todo en orden:</strong> Tu cuenta está segura y puedes iniciar sesión con tu nueva contraseña.
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- Aviso de seguridad -->
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 14px 18px; background-color: #FFF8E7; border-left: 4px solid #FFC107; border-radius: 6px;">
                      <p style="margin: 0; color: #7a6000; font-size: 13px; line-height: 1.6;">
                        <strong>⚠️ ¿No realizaste este cambio?</strong> Si no fuiste tú, por favor contacta a nuestro equipo de soporte de inmediato para proteger tu cuenta.
                      </p>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- Separador de colores de marca -->
            <tr>
              <td style="height: 5px; background: linear-gradient(90deg, #1E64DC 0%, #2D8EFF 40%, #4CAF50 70%, #FFC107 100%);"></td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 24px 36px; background-color: #f7f9ff; border-radius: 0 0 16px 16px;">
                <p style="margin: 0 0 8px 0; color: #aaaacc; font-size: 12px; text-align: center;">
                  Este es un correo automático, por favor no respondas a este mensaje.
                </p>
                <p style="margin: 0; color: #aaaacc; font-size: 12px; text-align: center;">
                  © ${new Date().getFullYear()} <strong style="color: #1E64DC;">Kolekta App</strong>. Todos los derechos reservados.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
      `,
        text: `
Hola ${userName},

Tu contraseña en Kolekta App (Tandas • Rifas • Pagos) ha sido cambiada exitosamente.

Si no realizaste este cambio, por favor contacta a nuestro equipo de soporte de inmediato.

Saludos,
El equipo de Kolekta App
      `,
      });

      console.log(`Email de cambio de contraseña enviado a: ${to}`);
    } catch (error) {
      console.error("Error al enviar email con Resend:", error);
      throw new Error("No se pudo enviar el correo de confirmación");
    }
  },
};
