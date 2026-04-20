import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { User } from "@/entities/admin/User";
import { Batch } from "@/entities/modules/batchs/Batch";
import { BatchDetail } from "@/entities/modules/batchs/BatchDetail";
import { Activity } from "@/entities/modules/Activity";
import { Payment } from "@/entities/modules/catalogs/Payment";
import { Sale } from "@/entities/modules/catalogs/Sale";
import { SaleItem } from "@/entities/modules/catalogs/SaleItem";
import { Product } from "@/entities/modules/catalogs/Product";
import { Giveaway } from "@/entities/modules/giveaways/Giveaway";
import { GiveawayDetail } from "@/entities/modules/giveaways/GiveawayDetail";
import { GiveawayPrize } from "@/entities/modules/giveaways/GiveawayPrize";
import { Notification } from "@/entities/modules/notifications/Notification";
import { NotificationPreference } from "@/entities/modules/notifications/NotificationPreference";
import { DeviceToken } from "@/entities/modules/notifications/DeviceToken";

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
  entities: [
    Activity,
    DeviceToken,
    User,
    Batch,
    BatchDetail,
    Payment,
    Sale,
    SaleItem,
    Product,
    Giveaway,
    GiveawayDetail,
    GiveawayPrize,
    Notification,
    NotificationPreference,
  ],
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
