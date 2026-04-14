import express from "express";
import { createServer } from "http";
import { AppDataSource } from "@/config/data-source.js";
import * as admin from "firebase-admin";
import serviceAccount from "@/config/firebase-service-account.json";
import cors from "cors";

// Importación de Controladores y Rutas
import UserRoute from "@/routes/admin/UserRoute";
import BatchRoute from "@/routes/modules/BatchRoute";
import BatchSharedRoute from "@/routes/modules/BatchSharedRoute";
import ActivityRoute from "@/routes/modules/ActivityRoute";
import CatalogRoute from "@/routes/modules/CatalogRoute";
import GiveawayRoute from "@/routes/modules/GiveawayRoute";
import GiveawaySharedRoute from "@/routes/modules/GiveawaySharedRoute";
import { GiveawayAutoDrawService } from "@/services/modules/GiveawayAutoDrawService";
import NotificationRoute from "@/routes/modules/NotificationRoute";
import { NotificationScheduler } from "@/services/modules/NotificationScheduler";

const app = express();
const httpServer = createServer(app);

process.on("SIGTERM", () => {
  console.log("SIGTERM recibido, cerrando servidor...");
  GiveawayAutoDrawService.stop();
  NotificationScheduler.stop();
  httpServer.close(() => {
    console.log("Servidor cerrado");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT recibido, cerrando servidor...");
  GiveawayAutoDrawService.stop();
  httpServer.close(() => {
    console.log("Servidor cerrado");
    process.exit(0);
  });
});

const allowedOrigins = [
  "http://localhost:8080",
  "http://192.168.70.108:8080",
  "https://kolekta.gamezdev.com.mx",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (Postman, mobile apps)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS bloqueado para el origen: ${origin}`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── RUTAS PÚBLICAS (sin auth) ─────────────────────────────────────
app.use("/kolekta-api/modules", BatchSharedRoute);
app.use("/kolekta-api/modules", GiveawaySharedRoute);

// ── RUTAS PROTEGIDAS ─────────────────────────────────────────────
app.use("/kolekta-api/auth", UserRoute);
app.use("/kolekta-api/modules", BatchRoute);
app.use("/kolekta-api/modules", CatalogRoute);
app.use("/kolekta-api/modules", GiveawayRoute);
app.use("/kolekta-api/modules/activities", ActivityRoute);
app.use("/kolekta-api/modules", NotificationRoute);

// Inicializar Firebase Admin (solo una vez)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
  console.log("[Firebase Admin] ✅ Inicializado");
}

// Inicializar base de datos y servidor
AppDataSource.initialize()
  .then(() => {
    console.log("Data Source ha sido inicializado");

    setTimeout(() => {
      GiveawayAutoDrawService.start();
      NotificationScheduler.start();
    }, 2000);

    httpServer.listen(process.env.SERVER_PORT, () => {
      console.log("Servidor corriendo: ", process.env.SERVER_PORT);
    });
  })
  .catch((error) => console.log(error));
