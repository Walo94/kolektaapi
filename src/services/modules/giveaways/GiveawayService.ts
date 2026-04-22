import { AppDataSource } from "@/config/data-source";
import {
  Giveaway,
  GiveawayStatus,
} from "@/entities/modules/giveaways/Giveaway";
import {
  GiveawayDetail,
  TicketStatus,
} from "@/entities/modules/giveaways/GiveawayDetail";
import { User } from "@/entities/admin/User";
import { GiveawayPrize } from "@/entities/modules/giveaways/GiveawayPrize";
import { ActivityService } from "@/services/modules/ActivityService";
import { ActivityModule, ActivityType } from "@/entities/modules/Activity";
import { getActiveHoldForPublic } from "@/services/modules/giveaways/GiveawayHoldService";
import { NotificationService } from "@/services/modules/notifications/NotificationService";
import { NotificationType } from "@/entities/modules/notifications/Notification";
import {
  emitTicketReserved,
  emitTicketUpdated,
  emitGiveawayFinished,
  emitGiveawayCancelled,
} from "@/services/modules/giveaways/GiveawaySocketService";
import cloudinary from "@/config/cloudinary.config";
import crypto from "crypto";

const giveawayRepo = AppDataSource.getRepository(Giveaway);
const detailRepo = AppDataSource.getRepository(GiveawayDetail);
const prizeRepo = AppDataSource.getRepository(GiveawayPrize);

export enum SubscriptionPlan {
  FREE = "free",
  TRIAL = "trial",
  PREMIUM = "premium",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(amount: number): string {
  return `$${Number(amount).toLocaleString("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function toNumber(value: number | string): number {
  return typeof value === "string" ? parseFloat(value) : value;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function uploadImageToCloudinary(
  base64Image: string,
  publicIdPrefix: string,
  folder = "kolekta/giveaways",
  transformation?: object[],
): Promise<{ url: string; publicId: string }> {
  const dataUri = base64Image.startsWith("data:")
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicIdPrefix,
    overwrite: true,
    transformation: transformation ?? [
      { width: 800, height: 400, crop: "fill", quality: "auto:good" },
    ],
  });

  return { url: result.secure_url, publicId: result.public_id };
}

async function deleteImageFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (_) {
    // silencioso
  }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface PrizeDto {
  prizePlace: number;
  description: string;
  imageBase64?: string; // opcional
}

export interface CreateGiveawayDto {
  title: string;
  description?: string;
  drawDate: string; // "YYYY-MM-DD"
  /** Fecha/hora ISO para sorteo automático. Null = desactivado. */
  autoDrawAt?: string | null;
  ticketPrice: number;
  totalTickets: number;
  prizeCount?: number;
  coverImageBase64?: string;
  /** Descripciones de premios por lugar */
  prizes?: PrizeDto[];
}

export interface UpdateGiveawayDto {
  title?: string;
  description?: string;
  drawDate?: string;
  /** null desactiva el sorteo automático; ISO string lo activa/modifica */
  autoDrawAt?: string | null;
  ticketPrice?: number;
  prizeCount?: number;
  coverImageBase64?: string;
  removeCoverImage?: boolean;
  /** Actualizar descripciones/imágenes de premios */
  prizes?: PrizeDto[];
}

export interface AssignTicketDto {
  ticketNumber: number;
  clientName: string;
  clientPhone?: string;
  paid?: boolean;
}

export interface UpdateTicketDto {
  clientName?: string;
  clientPhone?: string;
  paid?: boolean;
}

export interface DrawWinnersManualDto {
  winnerTicketNumbers: number[];
}

export interface ListGiveawaysFilter {
  status?: GiveawayStatus;
  limit?: number;
  offset?: number;
}

// ─── Helpers de premios ───────────────────────────────────────────────────────

/**
 * Sincroniza los premios de una rifa:
 * - Elimina los que ya no corresponden al rango de prizeCount.
 * - Crea / actualiza los que se pasan en el array.
 */
async function syncPrizes(
  giveawayId: string,
  prizeCount: number,
  prizes: PrizeDto[],
): Promise<void> {
  // Eliminar premios fuera del rango actual
  const existing = await prizeRepo.find({ where: { giveawayId } });
  const toDelete = existing.filter((p) => p.prizePlace > prizeCount);
  if (toDelete.length > 0) {
    for (const p of toDelete) {
      if (p.imagePublicId) await deleteImageFromCloudinary(p.imagePublicId);
    }
    await prizeRepo.remove(toDelete);
  }

  for (const dto of prizes) {
    if (dto.prizePlace < 1 || dto.prizePlace > prizeCount) continue;

    let record = await prizeRepo.findOne({
      where: { giveawayId, prizePlace: dto.prizePlace },
    });

    if (!record) {
      record = prizeRepo.create({ giveawayId, prizePlace: dto.prizePlace });
    }

    record.description = dto.description;

    if (dto.imageBase64) {
      if (record.imagePublicId) {
        await deleteImageFromCloudinary(record.imagePublicId);
      }
      const uploaded = await uploadImageToCloudinary(
        dto.imageBase64,
        `giveaway_prize_${giveawayId}_${dto.prizePlace}`,
        "kolekta/giveaway_prizes",
        [{ width: 600, height: 600, crop: "fill", quality: "auto:good" }],
      );
      record.imageUrl = uploaded.url;
      record.imagePublicId = uploaded.publicId;
    }

    await prizeRepo.save(record);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const GiveawayService = {
  // ══════════════════════════════════════════════════════════════════════════
  // CRUD RIFA
  // ══════════════════════════════════════════════════════════════════════════

  async createGiveaway(
    userId: string,
    dto: CreateGiveawayDto,
  ): Promise<Giveaway> {
    const {
      title,
      description,
      drawDate,
      autoDrawAt,
      ticketPrice,
      totalTickets,
      prizeCount = 1,
      coverImageBase64,
      prizes = [],
    } = dto;

    if (totalTickets < 2)
      throw new Error("La rifa debe tener al menos 2 boletos");
    if (totalTickets > 1000)
      throw new Error("La rifa no puede tener más de 1,000 boletos");
    if (ticketPrice <= 0)
      throw new Error("El precio del boleto debe ser mayor a 0");
    if (prizeCount < 1) throw new Error("Debe haber al menos 1 premio");
    if (prizeCount > totalTickets)
      throw new Error("El número de premios no puede exceder el de boletos");
    const drawDateObj = new Date(drawDate);
    if (isNaN(drawDateObj.getTime()))
      throw new Error("La fecha del sorteo no es válida");

    // Validar autoDrawAt
    let autoDrawAtDate: Date | null = null;
    if (autoDrawAt) {
      autoDrawAtDate = new Date(autoDrawAt);
      if (isNaN(autoDrawAtDate.getTime()))
        throw new Error("La fecha/hora del sorteo automático no es válida");
      if (autoDrawAtDate <= new Date())
        throw new Error("La fecha del sorteo automático debe ser futura");
    }

    const publicToken = crypto.randomBytes(32).toString("hex");

    let coverImage: string | null = null;
    let coverImagePublicId: string | null = null;
    if (coverImageBase64) {
      const tempId = `giveaway_${Date.now()}`;
      const uploaded = await uploadImageToCloudinary(coverImageBase64, tempId);
      coverImage = uploaded.url;
      coverImagePublicId = uploaded.publicId;
    }

    const giveaway = giveawayRepo.create({
      userId,
      title,
      description: description ?? null,
      drawDate,
      autoDrawAt: autoDrawAtDate,
      autoDrawExecuted: false,
      ticketPrice,
      totalTickets,
      prizeCount,
      soldTickets: 0,
      publicToken,
      status: GiveawayStatus.OPEN,
      coverImage,
      coverImagePublicId,
    });

    const saved = await giveawayRepo.save(giveaway);

    // Generar todos los boletos en estado FREE
    const details: GiveawayDetail[] = [];
    for (let i = 1; i <= totalTickets; i++) {
      details.push(
        detailRepo.create({
          giveawayId: saved.id,
          ticketNumber: i,
          price: ticketPrice,
          status: TicketStatus.FREE,
          clientName: null,
          clientPhone: null,
          soldAt: null,
          prizePlace: null,
        }),
      );
    }
    await detailRepo.save(details);

    // Sincronizar descripciones de premios
    if (prizes.length > 0) {
      await syncPrizes(saved.id, prizeCount, prizes);
    }

    await ActivityService.create({
      userId,
      module: ActivityModule.GIVEAWAY,
      type: ActivityType.GIVEAWAY_CREATED,
      title,
      description: `Rifa "${title}" creada con ${totalTickets} boletos a ${formatMoney(ticketPrice)} c/u`,
      amount: ticketPrice * totalTickets,
      referenceId: saved.id,
      metadata: { totalTickets, ticketPrice, prizeCount, drawDate, autoDrawAt },
    });

    return giveawayRepo.findOne({
      where: { id: saved.id },
      relations: ["details", "prizes"],
    }) as Promise<Giveaway>;
  },

  // ── Listar rifas ──────────────────────────────────────────────────────────

  async listGiveaways(
    userId: string,
    filter: ListGiveawaysFilter = {},
  ): Promise<{ giveaways: Giveaway[]; total: number }> {
    const { status, limit = 100, offset = 0 } = filter;

    const where: Record<string, any> = { userId };
    if (status) where.status = status;

    const [giveaways, total] = await giveawayRepo.findAndCount({
      where,
      relations: ["prizes"],
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return { giveaways, total };
  },

  // ── Obtener rifa por ID (con boletos y premios) ────────────────────────────

  async getGiveawayById(id: string, userId: string): Promise<Giveaway> {
    const giveaway = await giveawayRepo.findOne({
      where: { id, userId },
      relations: ["details", "prizes"],
      order: { details: { ticketNumber: "ASC" } } as any,
    });
    if (!giveaway) throw new Error("Rifa no encontrada");
    return giveaway;
  },

  // ── Editar rifa ───────────────────────────────────────────────────────────

  async updateGiveaway(
    id: string,
    userId: string,
    dto: UpdateGiveawayDto,
  ): Promise<Giveaway> {
    const giveaway = await giveawayRepo.findOne({
      where: { id, userId },
      relations: ["prizes"],
    });
    if (!giveaway) throw new Error("Rifa no encontrada");

    if (giveaway.status !== GiveawayStatus.OPEN)
      throw new Error("Solo se pueden editar rifas abiertas");

    // ── drawDate: se puede editar aunque haya boletos vendidos ────────────
    if (dto.drawDate !== undefined) {
      const newDraw = new Date(dto.drawDate);
      if (isNaN(newDraw.getTime()))
        throw new Error("La fecha del sorteo no es válida");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newDraw < today)
        throw new Error("La nueva fecha del sorteo debe ser futura");
      giveaway.drawDate = dto.drawDate;
    }

    // ── autoDrawAt: se puede activar/desactivar/modificar antes del sorteo
    if ("autoDrawAt" in dto) {
      if (!dto.autoDrawAt) {
        giveaway.autoDrawAt = null;
        giveaway.autoDrawExecuted = false;
      } else {
        const autoDate = new Date(dto.autoDrawAt);
        if (isNaN(autoDate.getTime()))
          throw new Error("La fecha/hora del sorteo automático no es válida");
        if (autoDate <= new Date())
          throw new Error(
            "La fecha del sorteo automático debe ser en el futuro",
          );
        giveaway.autoDrawAt = autoDate;
        giveaway.autoDrawExecuted = false;
      }
    }

    if (dto.title !== undefined) giveaway.title = dto.title;
    if (dto.description !== undefined)
      giveaway.description = dto.description ?? null;

    if (dto.ticketPrice !== undefined) {
      if (dto.ticketPrice <= 0)
        throw new Error("El precio del boleto debe ser mayor a 0");
      // Solo se puede cambiar si no hay boletos vendidos/apartados
      if (giveaway.soldTickets > 0)
        throw new Error(
          "No se puede cambiar el precio si ya hay boletos vendidos o apartados",
        );
      giveaway.ticketPrice = dto.ticketPrice;
      await detailRepo.update(
        { giveawayId: id, status: TicketStatus.FREE },
        { price: dto.ticketPrice },
      );
    }

    if (dto.prizeCount !== undefined) {
      if (dto.prizeCount < 1) throw new Error("Debe haber al menos 1 premio");
      if (dto.prizeCount > giveaway.totalTickets)
        throw new Error("El número de premios no puede exceder el de boletos");
      giveaway.prizeCount = dto.prizeCount;
    }

    // ── Imagen portada ─────────────────────────────────────────────────────
    if (dto.removeCoverImage && giveaway.coverImagePublicId) {
      await deleteImageFromCloudinary(giveaway.coverImagePublicId);
      giveaway.coverImage = null;
      giveaway.coverImagePublicId = null;
    } else if (dto.coverImageBase64) {
      if (giveaway.coverImagePublicId) {
        await deleteImageFromCloudinary(giveaway.coverImagePublicId);
      }
      const uploaded = await uploadImageToCloudinary(
        dto.coverImageBase64,
        `giveaway_${id}`,
      );
      giveaway.coverImage = uploaded.url;
      giveaway.coverImagePublicId = uploaded.publicId;
    }

    await giveawayRepo.save(giveaway);

    // ── Premios: sincronizar si se enviaron ───────────────────────────────
    if (dto.prizes && dto.prizes.length > 0) {
      await syncPrizes(id, giveaway.prizeCount, dto.prizes);
    } else if (dto.prizeCount !== undefined) {
      // Si cambió prizeCount sin enviar prizes, elimina los que sobran
      await syncPrizes(id, giveaway.prizeCount, []);
    }

    return giveawayRepo.findOne({
      where: { id },
      relations: ["prizes"],
    }) as Promise<Giveaway>;
  },

  // ── Cancelar rifa ─────────────────────────────────────────────────────────

  async cancelGiveaway(giveawayId: string, userId: string): Promise<Giveaway> {
    const giveaway = await giveawayRepo.findOne({
      where: { id: giveawayId, userId },
    });
    if (!giveaway) throw new Error("Rifa no encontrada");
    if (giveaway.status !== GiveawayStatus.OPEN)
      throw new Error("Solo se pueden cancelar rifas abiertas");

    giveaway.status = GiveawayStatus.CANCELLED;
    const saved = await giveawayRepo.save(giveaway);

    // ── Notificar en tiempo real ──────────────────────────────────────────
    try {
      emitGiveawayCancelled(giveaway.publicToken);
    } catch (_) {}
    // ────────────────────────────────────────────────────────────────────────

    await ActivityService.create({
      userId,
      module: ActivityModule.GIVEAWAY,
      type: ActivityType.GIVEAWAY_CANCELLED,
      title: giveaway.title,
      description: `Rifa "${giveaway.title}" cancelada`,
      amount: null,
      referenceId: giveawayId,
      metadata: {},
    });

    return saved;
  },

  // ── Eliminar rifa ─────────────────────────────────────────────────────────

  async deleteGiveaway(id: string, userId: string): Promise<void> {
    const giveaway = await giveawayRepo.findOne({
      where: { id, userId },
      relations: ["details", "prizes"],
    });
    if (!giveaway) throw new Error("Rifa no encontrada");

    const hasSoldOrReserved = giveaway.details.some(
      (d) =>
        d.status === TicketStatus.PAID || d.status === TicketStatus.RESERVED,
    );

    if (hasSoldOrReserved && giveaway.status === GiveawayStatus.OPEN) {
      throw new Error(
        "No se puede eliminar la rifa mientras haya boletos vendidos o apartados. Cancela la rifa primero.",
      );
    }

    if (giveaway.coverImagePublicId) {
      await deleteImageFromCloudinary(giveaway.coverImagePublicId);
    }
    for (const prize of giveaway.prizes ?? []) {
      if (prize.imagePublicId)
        await deleteImageFromCloudinary(prize.imagePublicId);
    }

    await ActivityService.create({
      userId,
      module: ActivityModule.GIVEAWAY,
      type: ActivityType.GIVEAWAY_DELETED,
      title: giveaway.title,
      description: `Rifa "${giveaway.title}" eliminada`,
      amount: null,
      referenceId: id,
      metadata: {
        totalTickets: giveaway.totalTickets,
        status: giveaway.status,
      },
    });

    await giveawayRepo.remove(giveaway);
  },

  // ── Estadísticas rápidas ──────────────────────────────────────────────────

  async countOpenGiveaways(userId: string): Promise<number> {
    return giveawayRepo.count({
      where: { userId, status: GiveawayStatus.OPEN },
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BOLETOS
  // ══════════════════════════════════════════════════════════════════════════

  async assignTicket(
    giveawayId: string,
    userId: string,
    dto: AssignTicketDto,
  ): Promise<GiveawayDetail> {
    const giveaway = await giveawayRepo.findOne({
      where: { id: giveawayId, userId },
    });
    if (!giveaway) throw new Error("Rifa no encontrada");
    if (giveaway.status !== GiveawayStatus.OPEN)
      throw new Error("Solo se pueden vender boletos de rifas abiertas");

    const detail = await detailRepo.findOne({
      where: { giveawayId, ticketNumber: dto.ticketNumber },
    });
    if (!detail) throw new Error(`El boleto #${dto.ticketNumber} no existe`);
    if (detail.status !== TicketStatus.FREE)
      throw new Error(
        `El boleto #${dto.ticketNumber} ya está ${detail.status}`,
      );

    detail.clientName = dto.clientName;
    detail.clientPhone = dto.clientPhone ?? null;
    detail.status = dto.paid ? TicketStatus.PAID : TicketStatus.RESERVED;
    detail.soldAt = new Date();

    const saved = await detailRepo.save(detail);

    giveaway.soldTickets += 1;
    await giveawayRepo.save(giveaway);

    await ActivityService.create({
      userId,
      module: ActivityModule.GIVEAWAY,
      type: ActivityType.GIVEAWAY_TICKET_SOLD,
      title: giveaway.title,
      description: `Boleto #${dto.ticketNumber} ${dto.paid ? "pagado" : "apartado"} a ${dto.clientName} — ${giveaway.title}`,
      amount: toNumber(detail.price),
      referenceId: giveawayId,
      metadata: {
        ticketNumber: dto.ticketNumber,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone ?? null,
        status: detail.status,
      },
    });

    return saved;
  },

  async updateTicket(
    giveawayId: string,
    ticketId: string,
    userId: string,
    dto: UpdateTicketDto,
  ): Promise<GiveawayDetail> {
    const giveaway = await giveawayRepo.findOne({
      where: { id: giveawayId, userId },
    });
    if (!giveaway) throw new Error("Rifa no encontrada");
    if (giveaway.status !== GiveawayStatus.OPEN)
      throw new Error("Solo se pueden editar boletos de rifas abiertas");

    const detail = await detailRepo.findOne({
      where: { id: ticketId, giveawayId },
    });
    if (!detail) throw new Error("Boleto no encontrado");

    if (detail.status === TicketStatus.FREE)
      throw new Error(
        "El boleto está libre, usa la asignación para registrar datos",
      );
    if (detail.status === TicketStatus.WINNER)
      throw new Error("No se pueden editar boletos ganadores");
    if (detail.status === TicketStatus.CANCELLED)
      throw new Error("No se pueden editar boletos cancelados");

    if (dto.clientName !== undefined) detail.clientName = dto.clientName;
    if (dto.clientPhone !== undefined)
      detail.clientPhone = dto.clientPhone ?? null;
    if (dto.paid === true && detail.status === TicketStatus.RESERVED) {
      detail.status = TicketStatus.PAID;
    }

    return detailRepo.save(detail);
  },

  async cancelTicket(
    giveawayId: string,
    ticketId: string,
    userId: string,
  ): Promise<GiveawayDetail> {
    const giveaway = await giveawayRepo.findOne({
      where: { id: giveawayId, userId },
    });
    if (!giveaway) throw new Error("Rifa no encontrada");
    if (giveaway.status !== GiveawayStatus.OPEN)
      throw new Error("Solo se pueden cancelar boletos de rifas abiertas");

    const detail = await detailRepo.findOne({
      where: { id: ticketId, giveawayId },
    });
    if (!detail) throw new Error("Boleto no encontrado");

    if (detail.status === TicketStatus.FREE)
      throw new Error("El boleto ya está libre");
    if (detail.status === TicketStatus.WINNER)
      throw new Error("No se puede cancelar un boleto ganador");
    if (detail.status === TicketStatus.CANCELLED)
      throw new Error("El boleto ya está cancelado");

    const prevClientName = detail.clientName;
    const prevTicketNumber = detail.ticketNumber;

    detail.status = TicketStatus.FREE;
    detail.clientName = null;
    detail.clientPhone = null;
    detail.soldAt = null;
    detail.prizePlace = null;

    const saved = await detailRepo.save(detail);

    if (giveaway.soldTickets > 0) {
      giveaway.soldTickets -= 1;
      await giveawayRepo.save(giveaway);
    }

    await ActivityService.create({
      userId,
      module: ActivityModule.GIVEAWAY,
      type: ActivityType.GIVEAWAY_TICKET_SOLD,
      title: giveaway.title,
      description: `Boleto #${prevTicketNumber} cancelado y liberado (cliente: ${prevClientName ?? "—"}) — ${giveaway.title}`,
      amount: null,
      referenceId: giveawayId,
      metadata: { ticketNumber: prevTicketNumber, clientName: prevClientName },
    });

    return saved;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SORTEO
  // ══════════════════════════════════════════════════════════════════════════

  async drawWinnersRandom(
    giveawayId: string,
    userId: string,
  ): Promise<GiveawayDetail[]> {
    const giveaway = await giveawayRepo.findOne({
      where: { id: giveawayId, userId },
      relations: ["details"],
    });
    if (!giveaway) throw new Error("Rifa no encontrada");
    if (giveaway.status !== GiveawayStatus.OPEN)
      throw new Error("El sorteo ya fue realizado o la rifa está cancelada");

    const paidTickets = giveaway.details.filter(
      (d) => d.status === TicketStatus.PAID,
    );

    if (paidTickets.length < giveaway.prizeCount) {
      throw new Error(
        `Se necesitan al menos ${giveaway.prizeCount} boleto(s) pagado(s) para realizar el sorteo. Actualmente hay ${paidTickets.length}.`,
      );
    }

    const shuffled = shuffle(paidTickets);
    const winners = shuffled.slice(0, giveaway.prizeCount);

    return this._applyWinners(giveaway, winners);
  },

  async drawWinnersManual(
    giveawayId: string,
    userId: string,
    dto: DrawWinnersManualDto,
  ): Promise<GiveawayDetail[]> {
    const { winnerTicketNumbers } = dto;

    const giveaway = await giveawayRepo.findOne({
      where: { id: giveawayId, userId },
      relations: ["details"],
    });
    if (!giveaway) throw new Error("Rifa no encontrada");
    if (giveaway.status !== GiveawayStatus.OPEN)
      throw new Error("El sorteo ya fue realizado o la rifa está cancelada");

    if (winnerTicketNumbers.length !== giveaway.prizeCount) {
      throw new Error(
        `Debes indicar exactamente ${giveaway.prizeCount} número(s) ganador(es)`,
      );
    }

    const uniqueNumbers = new Set(winnerTicketNumbers);
    if (uniqueNumbers.size !== winnerTicketNumbers.length)
      throw new Error("Hay números ganadores duplicados");

    const winnerDetails: GiveawayDetail[] = [];
    for (const ticketNumber of winnerTicketNumbers) {
      const detail = giveaway.details.find(
        (d) => d.ticketNumber === ticketNumber,
      );
      if (!detail)
        throw new Error(`El boleto #${ticketNumber} no existe en esta rifa`);
      if (detail.status !== TicketStatus.PAID)
        throw new Error(
          `El boleto #${ticketNumber} no está pagado (status: ${detail.status}). Solo se pueden sortear boletos pagados.`,
        );
      winnerDetails.push(detail);
    }

    return this._applyWinners(giveaway, winnerDetails);
  },

  async _applyWinners(
    giveaway: Giveaway,
    winners: GiveawayDetail[],
  ): Promise<GiveawayDetail[]> {
    const updatedWinners = winners.map((d, i) => {
      d.status = TicketStatus.WINNER;
      d.prizePlace = i + 1;
      return d;
    });
    await detailRepo.save(updatedWinners);

    giveaway.status = GiveawayStatus.FINISHED;
    giveaway.autoDrawExecuted = true;
    await giveawayRepo.save(giveaway);

    // ── Notificar en tiempo real ──────────────────────────────────────────
    try {
      emitGiveawayFinished(giveaway.publicToken);
    } catch (_) {}

    const winnersText = updatedWinners
      .map(
        (w) =>
          `${w.prizePlace}° lugar: boleto #${w.ticketNumber} (${w.clientName ?? "—"})`,
      )
      .join(", ");

    await ActivityService.create({
      userId: giveaway.userId,
      module: ActivityModule.GIVEAWAY,
      type: ActivityType.GIVEAWAY_WINNER_DRAWN,
      title: giveaway.title,
      description: `Sorteo realizado en "${giveaway.title}". Ganadores: ${winnersText}`,
      amount: null,
      referenceId: giveaway.id,
      metadata: {
        prizeCount: giveaway.prizeCount,
        winners: updatedWinners.map((w) => ({
          prizePlace: w.prizePlace,
          ticketNumber: w.ticketNumber,
          clientName: w.clientName,
          clientPhone: w.clientPhone,
        })),
      },
    });

    return updatedWinners;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VISTA PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  async getPublicGiveawayInfo(publicToken: string): Promise<{
    id: string;
    title: string;
    description: string | null;
    coverImage: string | null;
    drawDate: string;
    ticketPrice: number;
    totalTickets: number;
    soldTickets: number;
    prizeCount: number;
    prizes: Array<{
      prizePlace: number;
      description: string;
      imageUrl: string | null;
    }>;
    status: GiveawayStatus;
    tickets: Array<{
      id: string;
      ticketNumber: number;
      status: TicketStatus | "temp_held";
    }>;
  }> {
    const giveaway = await giveawayRepo.findOne({
      where: { publicToken },
      relations: ["details", "prizes"],
    });
    if (!giveaway) throw new Error("Rifa no encontrada");

    const tickets = (giveaway.details ?? [])
      .sort((a, b) => a.ticketNumber - b.ticketNumber)
      .map((d) => {
        const activeHold = getActiveHoldForPublic(publicToken, d.ticketNumber);
        const finalStatus: TicketStatus | "temp_held" =
          activeHold && d.status === TicketStatus.FREE ? "temp_held" : d.status;
        return { id: d.id, ticketNumber: d.ticketNumber, status: finalStatus };
      });

    const prizes = (giveaway.prizes ?? [])
      .sort((a, b) => a.prizePlace - b.prizePlace)
      .map((p) => ({
        prizePlace: p.prizePlace,
        description: p.description,
        imageUrl: p.imageUrl,
      }));

    return {
      id: giveaway.id,
      title: giveaway.title,
      description: giveaway.description,
      coverImage: giveaway.coverImage,
      drawDate: giveaway.drawDate,
      ticketPrice: toNumber(giveaway.ticketPrice),
      totalTickets: giveaway.totalTickets,
      soldTickets: giveaway.soldTickets,
      prizeCount: giveaway.prizeCount,
      prizes,
      status: giveaway.status,
      tickets,
    };
  },

  async reserveTicketPublic(
    publicToken: string,
    ticketNumber: number,
    clientName: string,
    clientPhone?: string,
  ): Promise<GiveawayDetail> {
    const giveaway = await giveawayRepo.findOne({ where: { publicToken } });
    if (!giveaway) throw new Error("Rifa no encontrada");
    if (giveaway.status !== GiveawayStatus.OPEN)
      throw new Error("Esta rifa ya no acepta reservaciones");

    const detail = await detailRepo.findOne({
      where: { giveawayId: giveaway.id, ticketNumber },
    });
    if (!detail) throw new Error(`El boleto #${ticketNumber} no existe`);
    if (detail.status !== TicketStatus.FREE)
      throw new Error(`El boleto #${ticketNumber} ya no está disponible`);

    if (!clientName || clientName.trim().length === 0)
      throw new Error("El nombre del cliente es requerido");

    detail.clientName = clientName.trim();
    detail.clientPhone = clientPhone?.trim() ?? null;
    detail.status = TicketStatus.RESERVED;
    detail.soldAt = new Date();

    const saved = await detailRepo.save(detail);

    // ── 🆕 Notificar en tiempo real ──────────────────────────────────────────
    try {
      emitTicketReserved(publicToken, {
        ticketNumber,
        clientName: clientName.trim(),
        status: "reserved",
      });
    } catch (_) {}
    // ────────────────────────────────────────────────────────────────────────

    await NotificationService.create(
      giveaway.userId,
      NotificationType.GIVEAWAY_TICKET_RESERVED,
      {
        giveawayId: giveaway.id,
        giveawayTitle: giveaway.title,
        ticketNumber: ticketNumber,
        clientName: clientName,
        clientPhone: clientPhone ?? null,
      },
    );

    giveaway.soldTickets += 1;
    await giveawayRepo.save(giveaway);

    await ActivityService.create({
      userId: giveaway.userId,
      module: ActivityModule.GIVEAWAY,
      type: ActivityType.GIVEAWAY_TICKET_SOLD,
      title: giveaway.title,
      description: `Boleto #${ticketNumber} apartado por ${clientName} desde el link público — ${giveaway.title}`,
      amount: toNumber(detail.price),
      referenceId: giveaway.id,
      metadata: {
        ticketNumber,
        clientName,
        clientPhone: clientPhone ?? null,
        source: "public_link",
      },
    });

    return saved;
  },

  /**
   * Busca rifas del usuario por título o descripción.
   * Devuelve resultados agrupados por status con paginación independiente.
   *
   * Si se envía `status`, solo devuelve ese grupo (útil para load-more).
   */
  async searchGiveaways(
    userId: string,
    query: string,
    options: {
      limit?: number;
      offset?: number;
      status?: GiveawayStatus;
    } = {},
  ): Promise<{
    open?: { giveaways: Giveaway[]; total: number };
    finished?: { giveaways: Giveaway[]; total: number };
    cancelled?: { giveaways: Giveaway[]; total: number };
  }> {
    const { limit = 20, offset = 0, status } = options;
    const q = `%${query.toLowerCase()}%`;

    const statuses: GiveawayStatus[] = status
      ? [status]
      : [
          GiveawayStatus.OPEN,
          GiveawayStatus.FINISHED,
          GiveawayStatus.CANCELLED,
        ];

    const result: Record<string, { giveaways: Giveaway[]; total: number }> = {};

    for (const st of statuses) {
      const qb = giveawayRepo
        .createQueryBuilder("g")
        .where("g.userId = :userId", { userId })
        .andWhere("g.status = :status", { status: st })
        .andWhere(
          "(LOWER(g.title) LIKE :q OR LOWER(COALESCE(g.description, '')) LIKE :q)",
          { q },
        )
        .orderBy("g.createdAt", "DESC");

      const total = await qb.getCount();
      const giveaways = await qb.skip(offset).take(limit).getMany();

      const key = st.toLowerCase() as "open" | "finished" | "cancelled";
      result[key] = { giveaways, total };
    }

    return result;
  },
};
