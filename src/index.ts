import express from "express";
import { createServer } from "http";
import { AppDataSource } from "@/config/data-source.js";
import cors from "cors";

// Importación de Controladores y Rutas
import UserRoute from "@/routes/admin/UserRoute";

const app = express();
const httpServer = createServer(app);


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
    })
);

app.use(express.json());

app.use("/kolekta-api/auth", UserRoute);

// Inicializar base de datos y servidor
AppDataSource.initialize()
    .then(() => {
        console.log("Data Source ha sido inicializado");

        httpServer.listen(process.env.SERVER_PORT, () => {
            console.log("Servidor corriendo: ", process.env.SERVER_PORT);
        });
    })
    .catch((error) => console.log(error));