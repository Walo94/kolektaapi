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
import cloudinary from "@/config/cloudinary.config";
import crypto from "crypto";

const batchRepo = AppDataSource.getRepository(Batch);
const detailRepo = AppDataSource.getRepository(BatchDetail);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcDeliveryDate(
  startDate: Date,
  frequency: BatchFrequency,
  row: number,
): Date {
  // Copiamos la fecha asegurándonos que sea UTC
  const date = new Date(startDate.getTime());

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
  return calcDeliveryDate(
    batch.startDate,
    batch.frequency,
    batch.currentTurn + 1,
  );
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Sube una imagen en base64 a Cloudinary bajo la carpeta "kolekta/batchs".
 * Devuelve { url, publicId }.
 */
async function uploadImageToCloudinary(
  base64Image: string,
  publicIdPrefix: string,
): Promise<{ url: string; publicId: string }> {
  // base64Image puede venir como "data:image/jpeg;base64,..." o solo la cadena base64
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

// ─── Service ─────────────────────────────────────────────────────────────────

export const BatchService = {
  // ── CRUD Tanda ────────────────────────────────────────────────────────────

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

    return savedBatch;
  },

  async listBatchsByUser(userId: string): Promise<Batch[]> {
    return batchRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
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
      // Eliminar imagen actual de Cloudinary
      await deleteImageFromCloudinary(batch.coverImagePublicId);
      batch.coverImage = null;
      batch.coverImagePublicId = null;
    } else if (data.coverImageBase64) {
      // Reemplazar imagen: si ya tiene una, la sobreescribimos con el mismo publicId
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

  async cancelBatch(batchId: string, userId: string): Promise<Batch> {
    const batch = await batchRepo.findOne({ where: { id: batchId, userId } });
    if (!batch) throw new Error("Tanda no encontrada");
    if (batch.status !== BatchStatus.ACTIVE)
      throw new Error("Solo se puede cancelar una tanda activa");

    batch.status = BatchStatus.CANCELLED;
    return batchRepo.save(batch);
  },

  // ── Participantes ─────────────────────────────────────────────────────────

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

    return detailRepo.save(detail);
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

    await detailRepo.remove(detail);
  },

  // ── Entregas ──────────────────────────────────────────────────────────────

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

    if (tanda.currentTurn >= tanda.totalSlots) {
      tanda.status = BatchStatus.FINISHED;
      tanda.nextDeliveryDate = null;
    } else {
      tanda.nextDeliveryDate = calcNextDelivery(tanda);
    }

    const savedTanda = await batchRepo.save(tanda);
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

  async deleteBatch(batchId: string, userId: string): Promise<Batch> {
    const batch = await batchRepo.findOne({ where: { id: batchId, userId } });
    if (!batch) throw new Error("Tanda no encontrada");

    return batchRepo.remove(batch);
  },
};
