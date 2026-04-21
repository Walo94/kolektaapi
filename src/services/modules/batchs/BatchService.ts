import { AppDataSource } from "@/config/data-source";
import {
  Batch,
  BatchFrequency,
  BatchStatus,
} from "@/entities/modules/batchs/Batch";
import {
  BatchDetail,
  BatchDetailStatus,
} from "@/entities/modules/batchs/BatchDetail";
import { User } from "@/entities/admin/User";
import { ActivityService } from "@/services/modules/ActivityService";
import { ActivityModule, ActivityType } from "@/entities/modules/Activity";
import cloudinary from "@/config/cloudinary.config";
import crypto from "crypto";

const batchRepo = AppDataSource.getRepository(Batch);
const detailRepo = AppDataSource.getRepository(BatchDetail);
const userRepo = AppDataSource.getRepository(User);

export enum SubscriptionPlan {
  FREE = "free",
  TRIAL = "trial",
  PREMIUM = "premium",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcDeliveryDate(
  startDate: Date | string,
  frequency: BatchFrequency,
  row: number,
): Date {
  // MySQL devuelve las columnas tipo "date" como string "YYYY-MM-DD".
  // Nos aseguramos de convertir a Date antes de operar.
  const base =
    startDate instanceof Date ? startDate : new Date(startDate as string);
  const date = new Date(base.getTime());

  const periods = row - 1;

  switch (frequency) {
    case BatchFrequency.WEEKLY:
      date.setDate(date.getDate() + periods * 7);
      break;
    case BatchFrequency.BIWEEKLY:
      date.setDate(date.getDate() + periods * 14);
      break;
    case BatchFrequency.MONTHLY:
      date.setMonth(date.getMonth() + periods);
      break;
  }
  return date;
}

function calcNextDelivery(batch: Batch): Date | null {
  if (batch.currentTurn >= batch.totalSlots) return null;
  // startDate puede ser string cuando viene de la DB (columna tipo "date")
  const start =
    batch.startDate instanceof Date
      ? batch.startDate
      : new Date(batch.startDate as unknown as string);
  return calcDeliveryDate(start, batch.frequency, batch.currentTurn + 1);
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Formatea un número como moneda legible. Ej: 1500 → "$1,500" */
function formatMoney(amount: number): string {
  return `$${Number(amount).toLocaleString("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Sube una imagen en base64 a Cloudinary bajo la carpeta "kolekta/batchs".
 * Devuelve { url, publicId }.
 */
async function uploadImageToCloudinary(
  base64Image: string,
  publicIdPrefix: string,
): Promise<{ url: string; publicId: string }> {
  const dataUri = base64Image.startsWith("data:")
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "kolekta/batchs",
    public_id: publicIdPrefix,
    overwrite: true,
    transformation: [
      { width: 800, height: 400, crop: "fill", quality: "auto:good" },
    ],
  });

  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Elimina una imagen de Cloudinary por su public_id.
 * No lanza error si la imagen no existe.
 */
async function deleteImageFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (_) {
    // silencioso: si falla no bloqueamos la operación principal
  }
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface CreateBatchDto {
  name: string;
  entryPrice: number;
  totalSlots: number;
  frequency: BatchFrequency;
  startDate: string;
  notes?: string;
  participants?: ParticipantDto[];
  randomize?: boolean;
  /** Imagen en base64 (opcional). Ej: "data:image/jpeg;base64,..." */
  coverImageBase64?: string;
}

export interface UpdateBatchDto {
  name?: string;
  notes?: string;
  status?: BatchStatus;
  /** Nueva imagen en base64. Si se envía, reemplaza la anterior en Cloudinary. */
  coverImageBase64?: string;
  /** Si true, elimina la imagen actual sin subir una nueva. */
  removeCoverImage?: boolean;
}

export interface ParticipantDto {
  contactName: string;
  phone?: string;
  email?: string;
  notes?: string;
  assignedNumber?: number;
}

export interface AddParticipantDto extends ParticipantDto {
  row: number;
}

export interface UpdateParticipantDto {
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface ListBatchsFilter {
  status?: BatchStatus;
  limit?: number;
  offset?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const BatchService = {
  // ── CRUD Tanda ────────────────────────────────────────────────────────────

  /**
   * Crea una tanda nueva (con o sin participantes iniciales).
   * Registra actividad BATCH_CREATED de forma atómica.
   */
  async createBatch(userId: string, dto: CreateBatchDto): Promise<Batch> {
    const {
      name,
      entryPrice,
      totalSlots,
      frequency,
      startDate,
      notes,
      participants = [],
      randomize = false,
      coverImageBase64,
    } = dto;

    if (totalSlots < 5)
      throw new Error("La tanda debe tener al menos 5 lugares");
    if (entryPrice <= 0)
      throw new Error("El precio de entrada debe ser mayor a 0");
    if (participants.length > totalSlots)
      throw new Error(
        "El número de participantes no puede exceder los lugares de la tanda",
      );

    const [year, month, day] = startDate.split("-").map(Number);
    const start = new Date(year, month - 1, day);
    const publicToken = crypto.randomBytes(32).toString("hex");
    const payoutAmount = entryPrice * totalSlots;

    // ── Subir imagen si se proporcionó ───────────────────
    let coverImage: string | null = null;
    let coverImagePublicId: string | null = null;

    if (coverImageBase64) {
      const batchTempId = `batch_${Date.now()}`;
      const uploaded = await uploadImageToCloudinary(
        coverImageBase64,
        batchTempId,
      );
      coverImage = uploaded.url;
      coverImagePublicId = uploaded.publicId;
    }

    const batch = batchRepo.create({
      userId,
      name,
      entryPrice,
      totalSlots,
      frequency,
      startDate: start,
      nextDeliveryDate: calcDeliveryDate(start, frequency, 1),
      status: BatchStatus.ACTIVE,
      currentTurn: 0,
      publicToken,
      notes: notes ?? null,
      coverImage,
      coverImagePublicId,
    });

    const savedBatch = await batchRepo.save(batch);

    if (participants.length > 0) {
      const allNumbers = Array.from({ length: totalSlots }, (_, i) => i + 1);
      const orderedNumbers = randomize ? shuffle([...allNumbers]) : allNumbers;

      const chosenNumbers = participants
        .map((p) => p.assignedNumber)
        .filter((n): n is number => n !== undefined);

      const chosenSet = new Set(chosenNumbers);
      if (chosenSet.size !== chosenNumbers.length)
        throw new Error("Hay números de participante duplicados");

      chosenNumbers.forEach((n) => {
        if (n < 1 || n > totalSlots)
          throw new Error(
            `El número ${n} está fuera del rango 1-${totalSlots}`,
          );
      });

      const freeNumbers = orderedNumbers.filter((n) => !chosenSet.has(n));
      let freeIdx = 0;

      const details: BatchDetail[] = participants.map((p, i) => {
        const row = i + 1;
        const assignedNumber =
          p.assignedNumber ?? freeNumbers[freeIdx++] ?? row;

        return detailRepo.create({
          batchId: savedBatch.id,
          row,
          assignedNumber,
          contactName: p.contactName,
          phone: p.phone ?? null,
          email: p.email ?? null,
          notes: p.notes ?? null,
          deliveryDate: calcDeliveryDate(start, frequency, assignedNumber),
          payoutAmount,
          status: BatchDetailStatus.PENDING,
          deliveredAt: null,
        });
      });

      await detailRepo.save(details);
    }

    // ── Actividad: tanda creada ───────────────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.BATCH,
      type: ActivityType.BATCH_CREATED,
      title: name,
      description:
        participants.length > 0
          ? `Creaste la tanda "${name}" con ${participants.length} participante(s) de ${totalSlots} lugares`
          : `Creaste la tanda "${name}" con ${totalSlots} lugares`,
      amount: entryPrice,
      referenceId: savedBatch.id,
      metadata: {
        totalSlots,
        frequency,
        payoutAmount,
        participantsCount: participants.length,
      },
    });

    return savedBatch;
  },

  async listBatchsByUser(
    userId: string,
    options: {
      status?: BatchStatus;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ batchs: Batch[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options;

    const where: any = { userId };
    if (status) where.status = status;

    const [batchs, total] = await batchRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
      // No necesitamos relations aquí (el home screen solo muestra lista básica)
    });

    return { batchs, total };
  },

  async getBatchsById(batchId: string, userId: string): Promise<Batch> {
    const batch = await batchRepo.findOne({
      where: { id: batchId, userId },
      relations: ["details"],
      order: { details: { row: "ASC" } } as any,
    });
    if (!batch) throw new Error("Tanda no encontrada");
    return batch;
  },

  /**
   * Actualiza datos generales de la tanda incluyendo imagen.
   * Soporta: cambiar imagen, eliminar imagen, cambiar nombre/notas/estatus.
   */
  async updateBatch(
    batchId: string,
    userId: string,
    data: UpdateBatchDto,
  ): Promise<Batch> {
    const batch = await batchRepo.findOne({ where: { id: batchId, userId } });
    if (!batch) throw new Error("Tanda no encontrada");

    // ── Manejo de imagen ──────────────────────────────────
    if (data.removeCoverImage && batch.coverImagePublicId) {
      await deleteImageFromCloudinary(batch.coverImagePublicId);
      batch.coverImage = null;
      batch.coverImagePublicId = null;
    } else if (data.coverImageBase64) {
      const publicIdPrefix = batch.coverImagePublicId ?? `batch_${batchId}`;
      const uploaded = await uploadImageToCloudinary(
        data.coverImageBase64,
        publicIdPrefix,
      );
      batch.coverImage = uploaded.url;
      batch.coverImagePublicId = uploaded.publicId;
    }

    // ── Resto de campos ───────────────────────────────────
    if (data.name !== undefined) batch.name = data.name;
    if (data.notes !== undefined) batch.notes = data.notes;
    if (data.status !== undefined) batch.status = data.status;

    return batchRepo.save(batch);
  },

  /**
   * Cancela una tanda activa.
   * Registra actividad BATCH_CANCELLED de forma atómica.
   */
  async cancelBatch(batchId: string, userId: string): Promise<Batch> {
    const batch = await batchRepo.findOne({ where: { id: batchId, userId } });
    if (!batch) throw new Error("Tanda no encontrada");
    if (batch.status !== BatchStatus.ACTIVE)
      throw new Error("Solo se puede cancelar una tanda activa");

    batch.status = BatchStatus.CANCELLED;
    const saved = await batchRepo.save(batch);

    // ── Actividad: tanda cancelada ────────────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.BATCH,
      type: ActivityType.BATCH_CANCELLED,
      title: batch.name,
      description: `Cancelaste la tanda "${batch.name}" (turno ${batch.currentTurn}/${batch.totalSlots})`,
      amount: null,
      referenceId: batchId,
      metadata: {
        currentTurn: batch.currentTurn,
        totalSlots: batch.totalSlots,
      },
    });

    return saved;
  },

  /**
   * Elimina una tanda permanentemente.
   * Registra actividad BATCH_DELETED de forma atómica.
   */
  async deleteBatch(batchId: string, userId: string): Promise<Batch> {
    const batch = await batchRepo.findOne({ where: { id: batchId, userId } });
    if (!batch) throw new Error("Tanda no encontrada");

    // Guardamos los datos antes de eliminar para la actividad
    const batchName = batch.name;
    const batchStatus = batch.status;
    const coverImagePublicId = batch.coverImagePublicId;

    const removed = await batchRepo.remove(batch);

    // Eliminar imagen de Cloudinary después del remove para no dejar huérfanos
    if (coverImagePublicId) {
      await deleteImageFromCloudinary(coverImagePublicId);
    }

    // ── Actividad: tanda eliminada ────────────────────────
    // referenceId = null porque el recurso ya no existe
    await ActivityService.create({
      userId,
      module: ActivityModule.BATCH,
      type: ActivityType.BATCH_DELETED,
      title: batchName,
      description: `Eliminaste la tanda "${batchName}"`,
      amount: null,
      referenceId: null,
      metadata: { previousStatus: batchStatus },
    });

    return removed;
  },

  // ── Participantes ─────────────────────────────────────────────────────────

  /**
   * Agrega un participante a un lugar específico.
   * Registra actividad BATCH_PARTICIPANT_ADDED de forma atómica.
   */
  async addParticipant(
    batchId: string,
    userId: string,
    dto: AddParticipantDto,
  ): Promise<BatchDetail> {
    const batch = await batchRepo.findOne({ where: { id: batchId, userId } });
    if (!batch) throw new Error("Tanda no encontrada");
    if (batch.status !== BatchStatus.ACTIVE)
      throw new Error(
        "No se pueden agregar participantes a una tanda inactiva",
      );

    const { row, assignedNumber, contactName, phone, email, notes } = dto;

    if (row < 1 || row > batch.totalSlots)
      throw new Error(`El row debe estar entre 1 y ${batch.totalSlots}`);

    const resolvedNumber = assignedNumber ?? row;
    if (resolvedNumber < 1 || resolvedNumber > batch.totalSlots)
      throw new Error(
        `El número asignado debe estar entre 1 y ${batch.totalSlots}`,
      );

    const existingRow = await detailRepo.findOne({ where: { batchId, row } });
    if (existingRow) throw new Error(`El lugar (row) ${row} ya está ocupado`);

    const existingNumber = await detailRepo.findOne({
      where: { batchId, assignedNumber: resolvedNumber },
    });
    if (existingNumber)
      throw new Error(`El número ${resolvedNumber} ya está asignado`);

    const payoutAmount = Number(batch.entryPrice) * batch.totalSlots;

    const detail = detailRepo.create({
      batchId,
      row,
      assignedNumber: resolvedNumber,
      contactName,
      phone: phone ?? null,
      email: email ?? null,
      notes: notes ?? null,
      deliveryDate: calcDeliveryDate(
        batch.startDate,
        batch.frequency,
        resolvedNumber,
      ),
      payoutAmount,
      status: BatchDetailStatus.PENDING,
      deliveredAt: null,
    });

    const savedDetail = await detailRepo.save(detail);

    // ── Actividad: participante agregado ──────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.BATCH,
      type: ActivityType.BATCH_PARTICIPANT_ADDED,
      title: batch.name,
      description: `Agregaste a ${contactName} con el número #${resolvedNumber} a la tanda "${batch.name}"`,
      amount: null,
      referenceId: batchId,
      metadata: {
        detailId: savedDetail.id,
        contactName,
        assignedNumber: resolvedNumber,
        row,
        phone: phone ?? null,
      },
    });

    return savedDetail;
  },

  async updateParticipant(
    detailId: string,
    batchId: string,
    userId: string,
    dto: UpdateParticipantDto,
  ): Promise<BatchDetail> {
    const batch = await batchRepo.findOne({ where: { id: batchId, userId } });
    if (!batch) throw new Error("Tanda no encontrada");

    const detail = await detailRepo.findOne({
      where: { id: detailId, batchId },
    });
    if (!detail) throw new Error("Participante no encontrado");

    Object.assign(detail, {
      contactName: dto.contactName ?? detail.contactName,
      phone: dto.phone ?? detail.phone,
      email: dto.email ?? detail.email,
      notes: dto.notes ?? detail.notes,
    });

    return detailRepo.save(detail);
  },

  /**
   * Elimina (libera) el lugar de un participante.
   * Registra actividad BATCH_PARTICIPANT_REMOVED de forma atómica.
   */
  async removeParticipant(
    detailId: string,
    batchId: string,
    userId: string,
  ): Promise<void> {
    const batch = await batchRepo.findOne({ where: { id: batchId, userId } });
    if (!batch) throw new Error("Tanda no encontrada");

    const detail = await detailRepo.findOne({
      where: { id: detailId, batchId },
    });
    if (!detail) throw new Error("Participante no encontrado");
    if (detail.status === BatchDetailStatus.DELIVERED)
      throw new Error(
        "No se puede eliminar un participante con entrega realizada",
      );

    const contactName = detail.contactName;
    const assignedNumber = detail.assignedNumber;

    await detailRepo.remove(detail);

    // ── Actividad: participante eliminado ─────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.BATCH,
      type: ActivityType.BATCH_PARTICIPANT_REMOVED,
      title: batch.name,
      description: `Eliminaste a ${contactName} (número #${assignedNumber}) de la tanda "${batch.name}"`,
      amount: null,
      referenceId: batchId,
      metadata: {
        contactName,
        assignedNumber,
      },
    });
  },

  // ── Entregas ──────────────────────────────────────────────────────────────

  /**
   * Registra la entrega a un participante específico.
   * Avanza currentTurn y nextDeliveryDate en la tanda.
   * Si se completan todos los turnos, marca la tanda como FINISHED.
   * Registra actividad BATCH_DELIVERY_REGISTERED (y BATCH_FINISHED si aplica) de forma atómica.
   */
  async registerDelivery(
    batchId: string,
    userId: string,
    detailId: string,
  ): Promise<{ tanda: Batch; detail: BatchDetail }> {
    const tanda = await batchRepo.findOne({
      where: { id: batchId, userId },
      relations: ["details"],
    });
    if (!tanda) throw new Error("Tanda no encontrada");
    if (tanda.status !== BatchStatus.ACTIVE)
      throw new Error("La tanda no está activa");

    const detail = await detailRepo.findOne({
      where: { id: detailId, batchId },
    });
    if (!detail) throw new Error("Participante no encontrado");
    if (detail.status === BatchDetailStatus.DELIVERED)
      throw new Error("Esta entrega ya fue registrada");

    detail.status = BatchDetailStatus.DELIVERED;
    detail.deliveredAt = new Date();
    await detailRepo.save(detail);

    tanda.currentTurn += 1;
    const isFinished = tanda.currentTurn >= tanda.totalSlots;

    if (isFinished) {
      tanda.status = BatchStatus.FINISHED;
      tanda.nextDeliveryDate = null;
    } else {
      tanda.nextDeliveryDate = calcNextDelivery(tanda);
    }

    const savedTanda = await batchRepo.save(tanda);

    // ── Actividad: entrega registrada ─────────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.BATCH,
      type: ActivityType.BATCH_DELIVERY_REGISTERED,
      title: tanda.name,
      description: `Entregaste el turno #${detail.assignedNumber} a ${detail.contactName} (${formatMoney(Number(detail.payoutAmount))}) en la tanda "${tanda.name}"`,
      amount: Number(detail.payoutAmount),
      referenceId: batchId,
      metadata: {
        detailId,
        contactName: detail.contactName,
        assignedNumber: detail.assignedNumber,
        turn: tanda.currentTurn,
        totalSlots: tanda.totalSlots,
        deliveredAt: detail.deliveredAt,
      },
    });

    // ── Actividad extra: tanda finalizada ─────────────────
    if (isFinished) {
      await ActivityService.create({
        userId,
        module: ActivityModule.BATCH,
        type: ActivityType.BATCH_FINISHED,
        title: tanda.name,
        description: `¡La tanda "${tanda.name}" se completó! Todos los ${tanda.totalSlots} turnos fueron entregados`,
        amount: null,
        referenceId: batchId,
        metadata: { totalSlots: tanda.totalSlots },
      });
    }

    return { tanda: savedTanda, detail };
  },

  // ── Vista pública ─────────────────────────────────────────────────────────

  async getPublicBatchInfo(publicToken: string): Promise<{
    name: string;
    coverImage: string | null;
    totalSlots: number;
    frequency: BatchFrequency;
    status: BatchStatus;
    currentTurn: number;
    startDate: Date;
    nextDeliveryDate: Date | null;
    participants: Array<{
      row: number;
      assignedNumber: number;
      contactName: string;
      deliveryDate: Date;
      payoutAmount: number;
      status: BatchDetailStatus;
    }>;
  }> {
    const batch = await batchRepo.findOne({
      where: { publicToken },
      relations: ["details"],
    });
    if (!batch) throw new Error("Tanda no encontrada");

    const participants = (batch.details ?? [])
      .sort((a, b) => a.row - b.row)
      .map((d) => ({
        row: d.row,
        assignedNumber: d.assignedNumber,
        contactName: d.contactName,
        deliveryDate: d.deliveryDate,
        payoutAmount: Number(d.payoutAmount),
        status: d.status,
      }));

    return {
      name: batch.name,
      coverImage: batch.coverImage,
      totalSlots: batch.totalSlots,
      frequency: batch.frequency,
      status: batch.status,
      currentTurn: batch.currentTurn,
      startDate: batch.startDate,
      nextDeliveryDate: batch.nextDeliveryDate,
      participants,
    };
  },

  // ── Aleatorio ─────────────────────────────────────────────────────────────

  async randomizeRemainingSlots(
    batchId: string,
    userId: string,
  ): Promise<BatchDetail[]> {
    const batch = await batchRepo.findOne({
      where: { id: batchId, userId },
      relations: ["details"],
    });
    if (!batch) throw new Error("Tanda no encontrada");
    if (batch.status !== BatchStatus.ACTIVE)
      throw new Error("La tanda no está activa");

    const pending = batch.details.filter(
      (d) => d.status === BatchDetailStatus.PENDING,
    );

    const pendingNumbers = shuffle(pending.map((d) => d.assignedNumber));

    const updated = pending.map((d, i) => {
      d.assignedNumber = pendingNumbers[i];
      d.deliveryDate = calcDeliveryDate(
        batch.startDate,
        batch.frequency,
        d.assignedNumber,
      );
      return d;
    });

    return detailRepo.save(updated);
  },

  async countActiveBatchs(userId: string): Promise<number> {
    return batchRepo.count({
      where: { userId, status: BatchStatus.ACTIVE },
    });
  },

  // ── Búsqueda ──────────────────────────────────────────────────────────────

  /**
   * Busca tandas del usuario por nombre de tanda o nombre de participante.
   * Devuelve resultados agrupados por status con paginación independiente.
   *
   * Si se envía `status`, solo devuelve ese grupo (útil para load-more).
   * Si no se envía `status`, devuelve los tres grupos en una sola consulta.
   */
  async searchBatchs(
    userId: string,
    query: string,
    options: {
      limit?: number;
      offset?: number;
      status?: BatchStatus;
    } = {},
  ): Promise<{
    active?: { batchs: Batch[]; total: number };
    finished?: { batchs: Batch[]; total: number };
    cancelled?: { batchs: Batch[]; total: number };
  }> {
    const { limit = 20, offset = 0, status } = options;
    const q = `%${query.toLowerCase()}%`;

    const statuses: BatchStatus[] = status
      ? [status]
      : [BatchStatus.ACTIVE, BatchStatus.FINISHED, BatchStatus.CANCELLED];

    const result: Record<string, { batchs: Batch[]; total: number }> = {};

    for (const st of statuses) {
      // Subconsulta: IDs de tandas que tienen un participante con ese nombre
      const matchingByParticipant = await detailRepo
        .createQueryBuilder("d")
        .select("DISTINCT d.batchId", "batchId")
        .innerJoin(
          "d.batch",
          "b",
          "b.userId = :userId AND b.status = :status",
          {
            userId,
            status: st,
          },
        )
        .where("LOWER(d.contactName) LIKE :q", { q })
        .getRawMany<{ batchId: string }>();

      const participantBatchIds = matchingByParticipant.map((r) => r.batchId);

      // Query principal: tandas por nombre O que tengan un participante coincidente
      const qb = batchRepo
        .createQueryBuilder("b")
        .where("b.userId = :userId", { userId })
        .andWhere("b.status = :status", { status: st })
        .andWhere(
          participantBatchIds.length > 0
            ? "(LOWER(b.name) LIKE :q OR b.id IN (:...ids))"
            : "LOWER(b.name) LIKE :q",
          participantBatchIds.length > 0
            ? { q, ids: participantBatchIds }
            : { q },
        )
        .orderBy("b.createdAt", "DESC");

      const total = await qb.getCount();
      const batchs = await qb.skip(offset).take(limit).getMany();

      const key = st.toLowerCase() as "active" | "finished" | "cancelled";
      result[key] = { batchs, total };
    }

    return result;
  },
};
