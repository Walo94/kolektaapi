import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { User } from "@/entities/admin/User";

dotenv.config();

export const AppDataSource = new DataSource({
    type: "mysql",
    host: process.env.HOST!,
    port: Number(process.env.DB_PORT!),
    username: process.env.USER!,
    password: process.env.PASSWORD!,
    database: process.env.DATABASE!,
    connectorPackage: "mysql2",
    synchronize: true,
    logging: false,
    entities: [User],
    extra: {
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0,
        keepAliveInitialDelay: 10000,
        enableKeepAlive: true,
        ssl: {
            rejectUnauthorized: false,
        },
    },
});