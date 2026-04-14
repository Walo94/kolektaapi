import { Request, Response } from "express";
import { BatchService } from "@/services/modules/BatchService";
import { BatchFrequency, BatchStatus } from "@/entities/modules/batchs/Batch";

export const BatchController = {
  // ── Tanda CRUD ────────────────────────────────────────────────────────────

  /**
   * POST /tandas
   * Crea una tanda nueva (con o sin participantes iniciales).
   */
  async createBatch(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const {
        name,
        entryPrice,
        totalSlots,
        frequency,
        startDate,
        notes,
        participants,
        randomize,
        coverImageBase64,
      } = req.body;

      // Validaciones básicas
      if (!name || !entryPrice || !totalSlots || !frequency || !startDate) {
        return res.status(400).json({
          error:
            "Los campos name, entryPrice, totalSlots, frequency y startDate son requeridos",
        });
      }

      const validFrequencies = Object.values(BatchFrequency);
      if (!validFrequencies.includes(frequency)) {
        return res.status(400).json({
          error: `La periodicidad debe ser una de: ${validFrequencies.join(", ")}`,
        });
      }

      if (isNaN(Number(entryPrice)) || Number(entryPrice) <= 0) {
        return res
          .status(400)
          .json({ error: "El precio de entrada debe ser un número mayor a 0" });
      }

      if (!Number.isInteger(Number(totalSlots)) || Number(totalSlots) < 2) {
        return res.status(400).json({
          error: "El total de lugares debe ser un entero mayor o igual a 2",
        });
      }

      const batch = await BatchService.createBatch(userId, {
        name,
        entryPrice: Number(entryPrice),
        totalSlots: Number(totalSlots),
        frequency,
        startDate,
        notes,
        participants,
        randomize: Boolean(randomize),
        coverImageBase64,
      });

      res.status(201).json({ batch });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * GET /tandas
   * Lista todas las tandas del usuario autenticado.
   */
  async listBatchs(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { status, limit, offset } = req.query;

      // Validación opcional del status
      const validStatuses = Object.values(BatchStatus);
      if (status && !validStatuses.includes(status as BatchStatus)) {
        return res.status(400).json({
          error: `status debe ser uno de: ${validStatuses.join(", ")}`,
        });
      }

      const result = await BatchService.listBatchsByUser(userId, {
        status: status as BatchStatus | undefined,
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * GET /tandas/:id
   * Detalle completo de una tanda (con participantes).
   */
  async getBatch(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const batch = await BatchService.getBatchsById(id, userId);
      res.json({ batch });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  },

  /**
   * PATCH /batchs/:id
   * Actualiza nombre, notas, estatus e imagen de la tanda.
   * Body acepta:
   *   - name, notes, status   (texto plano)
   *   - coverImageBase64       (nueva imagen en base64 → sube/reemplaza en Cloudinary)
   *   - removeCoverImage:true  (elimina la imagen actual de Cloudinary)
   */
  async updateBatch(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { name, notes, status, coverImageBase64, removeCoverImage } =
        req.body;

      const batch = await BatchService.updateBatch(id, userId, {
        name,
        notes,
        status,
        coverImageBase64,
        removeCoverImage: Boolean(removeCoverImage),
      });
      res.json({ batch });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * DELETE /tandas/:id/cancel
   * Cancela una tanda activa.
   */
  async cancelBatch(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const batch = await BatchService.cancelBatch(id, userId);
      res.json({ message: "Tanda cancelada exitosamente", batch });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * DELETE /tandas/:id/delete
   * Elimina una tanda.
   */
  async deleteBatch(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const batch = await BatchService.deleteBatch(id, userId);
      res.json({ message: "Tanda eliminada exitosamente", batch });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ── Participantes ─────────────────────────────────────────────────────────

  /**
   * POST /tandas/:id/participants
   * Agrega un participante a un lugar específico.
   * Body: { row, contactName, phone?, email?, assignedNumber?, notes? }
   */
  async addParticipant(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { row, contactName, phone, email, assignedNumber, notes } =
        req.body;

      if (!row || !contactName) {
        return res
          .status(400)
          .json({ error: "Los campos row y contactName son requeridos" });
      }

      if (!Number.isInteger(Number(row)) || Number(row) < 1) {
        return res
          .status(400)
          .json({ error: "El row debe ser un entero positivo" });
      }

      const detail = await BatchService.addParticipant(id, userId, {
        row: Number(row),
        contactName,
        phone,
        email,
        assignedNumber: assignedNumber ? Number(assignedNumber) : undefined,
        notes,
      });

      res.status(201).json({ detail });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * PATCH /tandas/:id/participants/:detailId
   * Actualiza datos de un participante (nombre, teléfono, email, notas).
   */
  async updateParticipant(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id, detailId } = req.params;
      const { contactName, phone, email, notes } = req.body;

      const detail = await BatchService.updateParticipant(
        detailId,
        id,
        userId,
        { contactName, phone, email, notes },
      );
      res.json({ detail });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * DELETE /tandas/:id/participants/:detailId
   * Elimina (libera) el lugar de un participante.
   */
  async removeParticipant(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id, detailId } = req.params;

      await BatchService.removeParticipant(detailId, id, userId);
      res.json({ message: "Participante eliminado exitosamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ── Entregas ──────────────────────────────────────────────────────────────

  /**
   * POST /tandas/:id/deliver/:detailId
   * Registra la entrega a un participante específico.
   */
  async registerDelivery(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id, detailId } = req.params;

      const result = await BatchService.registerDelivery(id, userId, detailId);
      res.json({
        message: "Entrega registrada exitosamente",
        ...result,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ── Aleatorio ─────────────────────────────────────────────────────────────

  /**
   * POST /tandas/:id/randomize
   * Reasigna aleatoriamente los números de los participantes pendientes.
   */
  async randomize(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const details = await BatchService.randomizeRemainingSlots(id, userId);
      res.json({
        message: "Números reasignados aleatoriamente",
        details,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ── Vista pública ─────────────────────────────────────────────────────────

  /**
   * GET /public/tanda/:publicToken
   * Acceso público a la información de la tanda (sin autenticación).
   * Este endpoint es el que se abre desde el link compartido.
   */
  async getPublicInfo(req: Request, res: Response) {
    try {
      const { publicToken } = req.params;
      if (!publicToken)
        return res.status(400).json({ error: "Token es requerido" });

      const info = await BatchService.getPublicBatchInfo(publicToken as string);
      res.json(info);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  },

  /**
   * GET /batchs/stats
   * Devuelve estadísticas rápidas de las tandas del usuario.
   * Usado por el home screen para el badge de "X activas".
   */
  async getBatchStats(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const activeBatchs = await BatchService.countActiveBatchs(userId);
      res.json({ activeBatchs });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
};
