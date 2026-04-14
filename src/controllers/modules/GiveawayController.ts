// src/controllers/modules/GiveawayController.ts

import { Request, Response } from "express";
import { GiveawayService } from "@/services/modules/GiveawayService";
import { GiveawayStatus } from "@/entities/modules/giveaways/Giveaway";

export const GiveawayController = {
  // ══════════════════════════════════════════════════════════════════════════
  // CRUD RIFA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /giveaways
   * Body: { title, description?, drawDate, autoDrawAt?, ticketPrice, totalTickets,
   *         prizeCount?, coverImageBase64?, prizes?: [{prizePlace, description, imageBase64?}] }
   */
  async createGiveaway(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const {
        title,
        description,
        drawDate,
        autoDrawAt,
        ticketPrice,
        totalTickets,
        prizeCount,
        coverImageBase64,
        prizes,
      } = req.body;

      if (!title || !drawDate || !ticketPrice || !totalTickets) {
        return res.status(400).json({
          error:
            "Faltan campos requeridos: title, drawDate, ticketPrice, totalTickets",
        });
      }
      if (isNaN(Number(ticketPrice)) || Number(ticketPrice) <= 0) {
        return res
          .status(400)
          .json({ error: "ticketPrice debe ser un número mayor a 0" });
      }
      if (!Number.isInteger(Number(totalTickets)) || Number(totalTickets) < 2) {
        return res
          .status(400)
          .json({ error: "totalTickets debe ser un entero mayor o igual a 2" });
      }
      if (
        prizeCount !== undefined &&
        (!Number.isInteger(Number(prizeCount)) || Number(prizeCount) < 1)
      ) {
        return res
          .status(400)
          .json({ error: "prizeCount debe ser un entero mayor o igual a 1" });
      }
      if (prizes !== undefined && !Array.isArray(prizes)) {
        return res.status(400).json({ error: "prizes debe ser un arreglo" });
      }

      const giveaway = await GiveawayService.createGiveaway(userId, {
        title,
        description,
        drawDate,
        autoDrawAt: autoDrawAt ?? null,
        ticketPrice: Number(ticketPrice),
        totalTickets: Number(totalTickets),
        prizeCount: prizeCount ? Number(prizeCount) : 1,
        coverImageBase64,
        prizes: prizes ?? [],
      });

      res.status(201).json({ giveaway });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * GET /giveaways
   */
  async listGiveaways(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { status, limit, offset } = req.query;

      const validStatuses = Object.values(GiveawayStatus);
      if (status && !validStatuses.includes(status as GiveawayStatus)) {
        return res.status(400).json({
          error: `status debe ser uno de: ${validStatuses.join(", ")}`,
        });
      }

      const result = await GiveawayService.listGiveaways(userId, {
        status: status as GiveawayStatus | undefined,
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * GET /giveaways/:id
   */
  async getGiveaway(req: any, res: Response) {
    try {
      const giveaway = await GiveawayService.getGiveawayById(
        req.params.id,
        req.user.id,
      );
      res.json({ giveaway });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  },

  /**
   * PATCH /giveaways/:id
   * Body: { title?, description?, drawDate?, autoDrawAt?, ticketPrice?,
   *         prizeCount?, coverImageBase64?, removeCoverImage?,
   *         prizes?: [{prizePlace, description, imageBase64?}] }
   */
  async updateGiveaway(req: any, res: Response) {
    try {
      const {
        title,
        description,
        drawDate,
        autoDrawAt,
        ticketPrice,
        prizeCount,
        coverImageBase64,
        removeCoverImage,
        prizes,
      } = req.body;

      if (
        ticketPrice !== undefined &&
        (isNaN(Number(ticketPrice)) || Number(ticketPrice) <= 0)
      ) {
        return res
          .status(400)
          .json({ error: "ticketPrice debe ser un número mayor a 0" });
      }
      if (
        prizeCount !== undefined &&
        (!Number.isInteger(Number(prizeCount)) || Number(prizeCount) < 1)
      ) {
        return res
          .status(400)
          .json({ error: "prizeCount debe ser un entero mayor o igual a 1" });
      }
      if (prizes !== undefined && !Array.isArray(prizes)) {
        return res.status(400).json({ error: "prizes debe ser un arreglo" });
      }

      const giveaway = await GiveawayService.updateGiveaway(
        req.params.id,
        req.user.id,
        {
          title,
          description,
          drawDate,
          // Solo pasamos autoDrawAt si la clave existe en el body
          ...("autoDrawAt" in req.body
            ? { autoDrawAt: autoDrawAt ?? null }
            : {}),
          ticketPrice:
            ticketPrice !== undefined ? Number(ticketPrice) : undefined,
          prizeCount: prizeCount !== undefined ? Number(prizeCount) : undefined,
          coverImageBase64,
          removeCoverImage: Boolean(removeCoverImage),
          prizes: prizes ?? undefined,
        },
      );

      res.json({ giveaway });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * PATCH /giveaways/:id/cancel
   */
  async cancelGiveaway(req: any, res: Response) {
    try {
      const giveaway = await GiveawayService.cancelGiveaway(
        req.params.id,
        req.user.id,
      );
      res.json({ giveaway, message: "Rifa cancelada correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * DELETE /giveaways/:id
   */
  async deleteGiveaway(req: any, res: Response) {
    try {
      await GiveawayService.deleteGiveaway(req.params.id, req.user.id);
      res.json({ message: "Rifa eliminada correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * GET /giveaways/stats
   */
  async getGiveawayStats(req: any, res: Response) {
    try {
      const openGiveaways = await GiveawayService.countOpenGiveaways(
        req.user.id,
      );
      res.json({ openGiveaways });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BOLETOS
  // ══════════════════════════════════════════════════════════════════════════

  async assignTicket(req: any, res: Response) {
    try {
      const { ticketNumber, clientName, clientPhone, paid } = req.body;

      if (!ticketNumber || !clientName) {
        return res.status(400).json({
          error: "Faltan campos requeridos: ticketNumber, clientName",
        });
      }
      if (!Number.isInteger(Number(ticketNumber)) || Number(ticketNumber) < 1) {
        return res
          .status(400)
          .json({ error: "ticketNumber debe ser un entero positivo" });
      }

      const detail = await GiveawayService.assignTicket(
        req.params.id,
        req.user.id,
        {
          ticketNumber: Number(ticketNumber),
          clientName,
          clientPhone,
          paid: Boolean(paid),
        },
      );

      res.status(201).json({ detail });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async updateTicket(req: any, res: Response) {
    try {
      const { clientName, clientPhone, paid } = req.body;

      const detail = await GiveawayService.updateTicket(
        req.params.id,
        req.params.ticketId,
        req.user.id,
        {
          clientName,
          clientPhone,
          paid: paid !== undefined ? Boolean(paid) : undefined,
        },
      );

      res.json({ detail });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async cancelTicket(req: any, res: Response) {
    try {
      const detail = await GiveawayService.cancelTicket(
        req.params.id,
        req.params.ticketId,
        req.user.id,
      );
      res.json({ detail, message: "Boleto liberado correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SORTEO
  // ══════════════════════════════════════════════════════════════════════════

  async drawRandom(req: any, res: Response) {
    try {
      const winners = await GiveawayService.drawWinnersRandom(
        req.params.id,
        req.user.id,
      );
      res.json({ winners, message: "Sorteo aleatorio realizado exitosamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async drawManual(req: any, res: Response) {
    try {
      const { winnerTicketNumbers } = req.body;

      if (
        !Array.isArray(winnerTicketNumbers) ||
        winnerTicketNumbers.length === 0
      ) {
        return res.status(400).json({
          error:
            "winnerTicketNumbers debe ser un arreglo con al menos un número",
        });
      }
      if (
        !winnerTicketNumbers.every(
          (n: any) => Number.isInteger(Number(n)) && Number(n) > 0,
        )
      ) {
        return res.status(400).json({
          error: "Todos los números ganadores deben ser enteros positivos",
        });
      }

      const winners = await GiveawayService.drawWinnersManual(
        req.params.id,
        req.user.id,
        { winnerTicketNumbers: winnerTicketNumbers.map(Number) },
      );

      res.json({ winners, message: "Sorteo manual registrado exitosamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VISTA PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  async getPublicInfo(req: Request, res: Response) {
    try {
      const { publicToken } = req.params;
      if (!publicToken)
        return res.status(400).json({ error: "Token es requerido" });

      const info = await GiveawayService.getPublicGiveawayInfo(
        publicToken as string,
      );
      res.json(info);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  },

  async reserveTicketPublic(req: Request, res: Response) {
    try {
      const { publicToken } = req.params;
      const { ticketNumber, clientName, clientPhone } = req.body;

      if (!ticketNumber || !clientName) {
        return res.status(400).json({
          error: "Faltan campos requeridos: ticketNumber, clientName",
        });
      }
      if (!Number.isInteger(Number(ticketNumber)) || Number(ticketNumber) < 1) {
        return res
          .status(400)
          .json({ error: "ticketNumber debe ser un entero positivo" });
      }

      const detail = await GiveawayService.reserveTicketPublic(
        publicToken as string,
        Number(ticketNumber),
        clientName,
        clientPhone,
      );

      res.status(201).json({
        detail,
        message:
          "Boleto apartado correctamente. El organizador confirmará tu pago.",
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
};
