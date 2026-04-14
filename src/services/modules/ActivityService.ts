import { AppDataSource } from "@/config/data-source";
import {
  Activity,
  ActivityModule,
  ActivityType,
} from "@/entities/modules/Activity";
import {
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  FindManyOptions,
} from "typeorm";

const activityRepo = AppDataSource.getRepository(Activity);

// ─── Helpers de rango de fechas ───────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Lunes de la semana ISO de la fecha dada */
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Dom … 6=Sáb
  const diff = day === 0 ? -6 : 1 - day; // ajuste a lunes
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return startOfDay(monday);
}

/** Primer día del mes de la fecha dada */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

// ─── DTO para crear una actividad ────────────────────────────────────────────

export interface CreateActivityDto {
  userId: string;
  module: ActivityModule;
  type: ActivityType;
  title: string;
  description: string;
  amount?: number | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ─── Filtros para listar ──────────────────────────────────────────────────────

export type ActivityPeriod = "week" | "month" | "all";

export interface ListActivitiesFilter {
  period?: ActivityPeriod;
  module?: ActivityModule;
  type?: ActivityType;
  /** Número máximo de registros (default 100) */
  limit?: number;
  /** Offset para paginación (default 0) */
  offset?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const ActivityService = {
  // ── Crear ─────────────────────────────────────────────────────────────────

  /**
   * Crea un registro de actividad.
   * Diseñado para llamarse dentro de transacciones del servicio origen.
   * Si falla, lanza el error para que la transacción padre haga rollback.
   */
  async create(dto: CreateActivityDto): Promise<Activity> {
    const activity = activityRepo.create({
      userId: dto.userId,
      module: dto.module,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      amount: dto.amount ?? null,
      referenceId: dto.referenceId ?? null,
      metadata: dto.metadata ?? null,
    });
    return activityRepo.save(activity);
  },

  // ── Listar por usuario ────────────────────────────────────────────────────

  /**
   * Devuelve las actividades del usuario con filtros opcionales.
   * Ordenadas de más reciente a más antigua.
   */
  async listByUser(
    userId: string,
    filter: ListActivitiesFilter = {},
  ): Promise<{ activities: Activity[]; total: number }> {
    const { period = "all", module, type, limit = 100, offset = 0 } = filter;

    const now = new Date();
    const options: FindManyOptions<Activity> = {
      where: { userId } as any,
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    };

    // ── Filtro de período ─────────────────────────────────
    let dateFilter: any = {};
    if (period === "week") {
      dateFilter = Between(startOfWeek(now), endOfDay(now));
    } else if (period === "month") {
      dateFilter = Between(startOfMonth(now), endOfDay(now));
    }

    // ── Construir where dinámico ──────────────────────────
    const where: Record<string, any> = { userId };
    if (period !== "all") where.createdAt = dateFilter;
    if (module) where.module = module;
    if (type) where.type = type;

    options.where = where;

    const [activities, total] = await activityRepo.findAndCount(options);
    return { activities, total };
  },

  // ── Obtener por ID ────────────────────────────────────────────────────────

  async getById(id: string, userId: string): Promise<Activity> {
    const activity = await activityRepo.findOne({ where: { id, userId } });
    if (!activity) throw new Error("Actividad no encontrada");
    return activity;
  },

  // ── Resumen rápido para dashboard ─────────────────────────────────────────

  /**
   * Devuelve conteos agrupados por módulo para el período dado.
   * Útil para el home/dashboard del usuario.
   */
  async getSummary(
    userId: string,
    period: ActivityPeriod = "month",
  ): Promise<{
    total: number;
    byModule: Record<ActivityModule, number>;
    recent: Activity[];
  }> {
    const now = new Date();
    let createdAt: any;

    if (period === "week") {
      createdAt = MoreThanOrEqual(startOfWeek(now));
    } else if (period === "month") {
      createdAt = MoreThanOrEqual(startOfMonth(now));
    }

    const where: Record<string, any> = { userId };
    if (createdAt) where.createdAt = createdAt;

    const all = await activityRepo.find({
      where,
      order: { createdAt: "DESC" },
    });

    const byModule = {
      [ActivityModule.BATCH]: 0,
      [ActivityModule.GIVEAWAY]: 0,
      [ActivityModule.CATALOG]: 0,
    };

    for (const a of all) {
      byModule[a.module] = (byModule[a.module] ?? 0) + 1;
    }

    return {
      total: all.length,
      byModule,
      recent: all.slice(0, 10), // los 10 más recientes
    };
  },

  // ── Eliminar un registro ──────────────────────────────────────────────────

  async deleteOne(id: string, userId: string): Promise<void> {
    const activity = await activityRepo.findOne({ where: { id, userId } });
    if (!activity) throw new Error("Actividad no encontrada");
    await activityRepo.remove(activity);
  },

  // ── Limpiar todo el historial del usuario ─────────────────────────────────

  /**
   * Elimina TODAS las actividades del usuario.
   * Opcionalmente puede filtrar solo un módulo.
   */
  async clearAll(userId: string, module?: ActivityModule): Promise<number> {
    const where: Record<string, any> = { userId };
    if (module) where.module = module;

    const activities = await activityRepo.find({ where });
    if (activities.length === 0) return 0;

    await activityRepo.remove(activities);
    return activities.length;
  },
};
