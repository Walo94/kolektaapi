import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

/**
 * Servicio de WhatsApp usando whatsapp-web.js.
 *
 * Funciona como singleton: el cliente se inicializa una sola vez
 * al arrancar el servidor y mantiene la sesión activa.
 *
 * La sesión se persiste en ./.wwebjs_auth para no tener que
 * escanear el QR en cada reinicio del servidor.
 *
 * Instalación:
 *   npm install whatsapp-web.js qrcode-terminal
 */

class WhatsAppClient {
  private client: Client;
  private ready = false;
  private initializing = false;

  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: "./.wwebjs_auth", // carpeta donde se guarda la sesión
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--disable-extensions",
        ],
        timeout: 60000,
      },
      restartOnAuthFail: true,
      qrMaxRetries: 5,
    });

    this._registerEvents();
  }

  private _registerEvents() {
    // Mostrar QR en la terminal la primera vez (o si la sesión expira)
    this.client.on("qr", (qr) => {
      console.log("\n📱 Escanea este QR con WhatsApp para conectar Kolekta:\n");
      qrcode.generate(qr, { small: true });
      console.log(
        "\n⚠️  El QR expira en ~60 segundos. Si no lo escaneaste a tiempo, reinicia el servidor.\n",
      );
    });

    this.client.on("ready", () => {
      this.ready = true;
      console.log("✅ WhatsApp conectado y listo para enviar mensajes.");
    });

    this.client.on("authenticated", () => {
      console.log("🔐 WhatsApp: sesión autenticada correctamente.");
    });

    this.client.on("auth_failure", (msg) => {
      this.ready = false;
      console.error("❌ WhatsApp: fallo de autenticación:", msg);
    });

    this.client.on("disconnected", (reason) => {
      this.ready = false;
      console.warn("WhatsApp desconectado:", reason);
      // Reintentar conexión tras 10 segundos
      setTimeout(() => this.initialize(), 10_000);
    });
  }

  /**
   * Inicializa el cliente. Llamar una sola vez al arrancar el servidor.
   */
  async initialize(): Promise<void> {
    if (this.initializing || this.ready) return;
    this.initializing = true;
    try {
      await this.client.initialize();
    } catch (err: any) {
      // "Navigating frame was detached" ocurre en el primer arranque en Windows
      // cuando tsx watch interfiere. whatsapp-web.js reintenta solo.
      if (
        err?.message?.includes("detached") ||
        err?.message?.includes("LifecycleWatcher")
      ) {
        console.warn(
          "⚠️  WhatsApp: primer arranque interrumpido, reintentando en 5s...",
        );
        this.initializing = false;
        setTimeout(() => this.initialize(), 5000);
      } else {
        console.error("❌ Error al inicializar WhatsApp:", err);
        this.initializing = false;
      }
    }
  }

  /**
   * Envía un mensaje de WhatsApp al número indicado.
   * @param phone  Número sin espacios ni guiones (ej: "4792889714")
   * @param message Texto del mensaje
   */
  async sendMessage(phone: string, message: string): Promise<void> {
    if (!this.ready) {
      throw new Error(
        "WhatsApp aún no está conectado. Espera a que el servidor escanee el QR.",
      );
    }

    // whatsapp-web.js necesita el número en formato internacional sin "+"
    // México: 52 + 10 dígitos → "524792889714@c.us"
    const countryCode = process.env.WHATSAPP_COUNTRY_CODE ?? "52";
    const cleanPhone = phone.replace(/\D/g, ""); // eliminar caracteres no numéricos
    const chatId = `${countryCode}${cleanPhone}@c.us`;

    try {
      await this.client.sendMessage(chatId, message);
      console.log(`WhatsApp enviado a ${chatId}`);
    } catch (err) {
      console.error(`Error al enviar WhatsApp a ${chatId}:`, err);
      throw new Error("No se pudo enviar el mensaje de WhatsApp");
    }
  }

  isReady(): boolean {
    return this.ready;
  }
}

// ── Singleton ─────────────────────────────────────────────
export const whatsAppClient = new WhatsAppClient();

// ── Servicio de mensajes de verificación ─────────────────
export const WhatsAppService = {
  /**
   * Envía el código OTP de verificación de teléfono.
   */
  async sendPhoneVerificationCode(
    phone: string,
    code: string,
    fullName: string,
  ): Promise<void> {
    const message =
      `🔐 *Kolekta App* — Verificación de teléfono\n\n` +
      `Hola ${fullName}, tu código de verificación es:\n\n` +
      `*${code}*\n\n` +
      `⏱ Este código expira en *10 minutos*.\n` +
      `Si no solicitaste esto, ignora este mensaje.`;

    await whatsAppClient.sendMessage(phone, message);
  },

  /**
   * Envía confirmación de que el teléfono fue verificado.
   */
  async sendPhoneVerifiedConfirmation(
    phone: string,
    fullName: string,
  ): Promise<void> {
    const message =
      `✅ *Kolekta App* — Teléfono verificado\n\n` +
      `¡Hola ${fullName}! Tu número de teléfono ha sido verificado exitosamente.\n\n` +
      `Ya puedes disfrutar todas las funciones de Kolekta. 🎉`;

    await whatsAppClient.sendMessage(phone, message);
  },
};
