import { AppDataSource } from "@/config/data-source";
import { User, SubscriptionPlan } from "@/entities/admin/User";
import { LessThanOrEqual } from "typeorm";

const userRepo = AppDataSource.getRepository(User);

let intervalId: NodeJS.Timeout | null = null;

export const SubscriptionTrialService = {
  /** Inicia la verificación automática cada 5 minutos */
  start() {
    if (intervalId) return;

    console.log(
      "[SubscriptionTrialService] ✅ Iniciado — verificando trials expirados cada 5 minutos",
    );

    intervalId = setInterval(
      async () => {
        try {
          const now = new Date();

          // Buscar usuarios con trial expirado (trialEndsAt <= ahora)
          const expiredUsers = await userRepo.find({
            where: {
              subscriptionPlan: SubscriptionPlan.TRIAL,
              trialEndsAt: LessThanOrEqual(now), // ← Corrección aquí
            },
          });

          if (expiredUsers.length === 0) {
            // Opcional: loguear solo cuando hay actividad
            // console.log("[SubscriptionTrialService] No hay trials expirados");
            return;
          }

          console.log(
            `[SubscriptionTrialService] 🔄 Encontrados ${expiredUsers.length} trials expirados`,
          );

          let updatedCount = 0;

          for (const user of expiredUsers) {
            user.subscriptionPlan = SubscriptionPlan.FREE;
            user.trialEndsAt = null;
            await userRepo.save(user);
            updatedCount++;

            console.log(
              `[SubscriptionTrialService] → Usuario ${user.id} (${user.email}) cambiado a FREE`,
            );
          }

          console.log(
            `[SubscriptionTrialService] ✅ Finalizado: ${updatedCount} usuarios actualizados a plan FREE`,
          );
        } catch (error) {
          console.error(
            "[SubscriptionTrialService] ❌ Error al procesar trials:",
            error,
          );
        }
      },
      5 * 60 * 1000,
    ); // 5 minutos
  },

  /** Detiene el servicio */
  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log("[SubscriptionTrialService] ⛔ Detenido");
    }
  },
};
