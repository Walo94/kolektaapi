import { AppDataSource } from "@/config/data-source";
import { Sale, SaleStatus } from "@/entities/modules/catalogs/Sale";
import { Payment, PaymentStatus } from "@/entities/modules/catalogs/Payment";
import { ActivityService } from "@/services/modules/ActivityService";
import { ActivityModule, ActivityType } from "@/entities/modules/Activity";

const saleRepo = AppDataSource.getRepository(Sale);
const paymentRepo = AppDataSource.getRepository(Payment);

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateSaleDto {
  userId: string;
  clientName: string;
  clientPhone?: string | null;
  title: string;
  description: string;
  totalAmount: number;
  date: string; // "YYYY-MM-DD"
}

export interface UpdateSaleDto {
  title?: string;
  description?: string;
  clientPhone?: string | null;
  totalAmount?: number;
}

export interface CreatePaymentDto {
  amount: number;
  date: Date;
}

export interface ListSalesFilter {
  status?: SaleStatus;
  limit?: number;
  offset?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value: number | string): number {
  return typeof value === "string" ? parseFloat(value) : value;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const CatalogService = {
  // ══════════════════════════════════════════════════════════════════════════
  // VENTAS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Crear venta ───────────────────────────────────────────────────────────

  async createSale(dto: CreateSaleDto): Promise<Sale> {
    if (dto.totalAmount <= 0) {
      throw new Error("El monto total debe ser mayor a 0");
    }

    // Calcular el siguiente orderNum para este usuario
    const lastSale = await saleRepo.findOne({
      where: { userId: dto.userId },
      order: { orderNum: "DESC" },
    });
    const orderNum = (lastSale?.orderNum ?? 0) + 1;

    const sale = saleRepo.create({
      userId: dto.userId,
      orderNum,
      clientName: dto.clientName,
      clientPhone: dto.clientPhone ?? null,
      title: dto.title,
      description: dto.description,
      totalAmount: dto.totalAmount,
      balance: dto.totalAmount, // balance inicia igual al total
      date: dto.date,
      status: SaleStatus.PENDING,
    });

    const saved = await saleRepo.save(sale);

    // ── Actividad ─────────────────────────────────────────────────────────
    await ActivityService.create({
      userId: dto.userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_SALE_CREATED,
      title: dto.title,
      description: `Venta #${orderNum} creada para ${dto.clientName} por $${dto.totalAmount.toFixed(2)}`,
      amount: dto.totalAmount,
      referenceId: saved.id,
      metadata: { orderNum, clientName: dto.clientName },
    });

    return saved;
  },

  // ── Listar ventas del usuario ─────────────────────────────────────────────

  async listSales(
    userId: string,
    filter: ListSalesFilter = {},
  ): Promise<{ sales: Sale[]; total: number }> {
    const { status, limit = 100, offset = 0 } = filter;

    const where: Record<string, any> = { userId };
    if (status) where.status = status;

    const [sales, total] = await saleRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
      relations: ["payments"],
    });

    return { sales, total };
  },

  // ── Obtener venta por ID ──────────────────────────────────────────────────

  async getSaleById(id: string, userId: string): Promise<Sale> {
    const sale = await saleRepo.findOne({
      where: { id, userId },
      relations: ["payments"],
    });
    if (!sale) throw new Error("Venta no encontrada");
    return sale;
  },

  // ── Editar venta ──────────────────────────────────────────────────────────

  /**
   * Solo se puede editar title, description, clientPhone y totalAmount
   * mientras NO existan pagos con status PAID.
   */
  async updateSale(
    id: string,
    userId: string,
    dto: UpdateSaleDto,
  ): Promise<Sale> {
    const sale = await saleRepo.findOne({
      where: { id, userId },
      relations: ["payments"],
    });
    if (!sale) throw new Error("Venta no encontrada");

    if (sale.status === SaleStatus.CANCELLED) {
      throw new Error("No se puede editar una venta cancelada");
    }
    if (sale.status === SaleStatus.PAID) {
      throw new Error("No se puede editar una venta ya pagada");
    }

    // Verificar que no haya pagos activos
    const hasPayments = sale.payments.some(
      (p) => p.status === PaymentStatus.PAID,
    );
    if (hasPayments) {
      throw new Error(
        "No se puede editar la venta porque ya tiene pagos registrados",
      );
    }

    if (dto.title !== undefined) sale.title = dto.title;
    if (dto.description !== undefined) sale.description = dto.description;
    if (dto.clientPhone !== undefined)
      sale.clientPhone = dto.clientPhone ?? null;

    if (dto.totalAmount !== undefined) {
      if (dto.totalAmount <= 0) {
        throw new Error("El monto total debe ser mayor a 0");
      }
      sale.totalAmount = dto.totalAmount;
      sale.balance = dto.totalAmount; // sin pagos, balance = total
    }

    const updated = await saleRepo.save(sale);

    // ── Actividad ─────────────────────────────────────────────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_SALE_UPDATED,
      title: sale.title,
      description: `Venta #${sale.orderNum} actualizada`,
      amount: null,
      referenceId: sale.id,
      metadata: { orderNum: sale.orderNum, clientName: sale.clientName },
    });

    return updated;
  },

  // ── Cancelar venta ────────────────────────────────────────────────────────

  async cancelSale(id: string, userId: string): Promise<Sale> {
    const sale = await saleRepo.findOne({
      where: { id, userId },
      relations: ["payments"],
    });
    if (!sale) throw new Error("Venta no encontrada");

    if (sale.status === SaleStatus.CANCELLED) {
      throw new Error("La venta ya está cancelada");
    }
    if (sale.status === SaleStatus.PAID) {
      throw new Error("No se puede cancelar una venta ya pagada");
    }

    // Cancelar todos los pagos activos
    const activePayments = sale.payments.filter(
      (p) => p.status === PaymentStatus.PAID,
    );
    for (const p of activePayments) {
      p.status = PaymentStatus.CANCELLED;
    }
    if (activePayments.length > 0) {
      await paymentRepo.save(activePayments);
    }

    sale.status = SaleStatus.CANCELLED;
    const cancelled = await saleRepo.save(sale);

    // ── Actividad ─────────────────────────────────────────────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_SALE_CANCELLED,
      title: sale.title,
      description: `Venta #${sale.orderNum} cancelada (${activePayments.length} pago(s) cancelado(s))`,
      amount: null,
      referenceId: sale.id,
      metadata: { orderNum: sale.orderNum, clientName: sale.clientName },
    });

    return cancelled;
  },

  // ── Eliminar venta ────────────────────────────────────────────────────────

  /**
   * Elimina la venta y en cascada sus pagos (la FK tiene onDelete CASCADE).
   */
  async deleteSale(id: string, userId: string): Promise<void> {
    const sale = await saleRepo.findOne({
      where: { id, userId },
      relations: ["payments"],
    });
    if (!sale) throw new Error("Venta no encontrada");

    const orderNum = sale.orderNum;
    const title = sale.title;
    const clientName = sale.clientName;

    await saleRepo.remove(sale); // CASCADE elimina los pagos

    // ── Actividad ─────────────────────────────────────────────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_SALE_DELETED,
      title,
      description: `Venta #${orderNum} de ${clientName} eliminada`,
      amount: null,
      referenceId: null, // ya no existe
      metadata: { orderNum, clientName },
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PAGOS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Registrar pago ────────────────────────────────────────────────────────

  /**
   * FIX FK: se usa una transacción explícita para garantizar que la sale
   * exista y esté confirmada en la BD antes de insertar el payment.
   * Esto evita el error "Cannot add or update a child row: a foreign key
   * constraint fails" que ocurre cuando TypeORM intenta insertar el pago
   * antes de que el motor haya flusheado la transacción implícita del save.
   */
  async createPayment(
    saleId: string,
    userId: string,
    dto: CreatePaymentDto,
  ): Promise<{ payment: Payment; sale: Sale }> {
    return AppDataSource.transaction(async (manager) => {
      const saleRepository = manager.getRepository(Sale);
      const paymentRepository = manager.getRepository(Payment);

      // Bloquear la fila de la venta para evitar race conditions
      const sale = await saleRepository.findOne({
        where: { id: saleId, userId },
        relations: ["payments"],
        lock: { mode: "pessimistic_write" },
      });
      if (!sale) throw new Error("Venta no encontrada");

      if (sale.status === SaleStatus.CANCELLED) {
        throw new Error("No se pueden registrar pagos en una venta cancelada");
      }
      if (sale.status === SaleStatus.PAID) {
        throw new Error("La venta ya está completamente pagada");
      }

      const currentBalance = toNumber(sale.balance);

      if (dto.amount <= 0) {
        throw new Error("El monto del pago debe ser mayor a 0");
      }
      if (dto.amount > currentBalance) {
        throw new Error(
          `El pago ($${dto.amount.toFixed(2)}) excede el saldo pendiente ($${currentBalance.toFixed(2)})`,
        );
      }

      // Actualizar balance ANTES de insertar el pago, así la venta ya
      // está commiteada en la misma transacción cuando se inserta el FK.
      const newBalance = Math.max(0, currentBalance - dto.amount);
      sale.balance = newBalance;
      if (newBalance === 0) {
        sale.status = SaleStatus.PAID;
      }
      const updatedSale = await saleRepository.save(sale);

      // Insertar el pago dentro de la misma transacción
      const payment = paymentRepository.create({
        saleId: updatedSale.id, // id garantizado como string UUID
        date: dto.date,
        amount: dto.amount,
        status: PaymentStatus.PAID,
      });
      const savedPayment = await paymentRepository.save(payment);

      // Actividad fuera de la transacción (no crítica)
      setImmediate(async () => {
        try {
          await ActivityService.create({
            userId,
            module: ActivityModule.CATALOG,
            type: ActivityType.CATALOG_PAYMENT_REGISTERED,
            title: sale.title,
            description: `Pago de $${dto.amount.toFixed(2)} registrado en venta #${sale.orderNum} de ${sale.clientName}`,
            amount: dto.amount,
            referenceId: sale.id,
            metadata: {
              paymentId: savedPayment.id,
              orderNum: sale.orderNum,
              clientName: sale.clientName,
              newBalance,
            },
          });

          if (newBalance === 0) {
            await ActivityService.create({
              userId,
              module: ActivityModule.CATALOG,
              type: ActivityType.CATALOG_SALE_PAID,
              title: sale.title,
              description: `Venta #${sale.orderNum} de ${sale.clientName} completamente pagada`,
              amount: toNumber(sale.totalAmount),
              referenceId: sale.id,
              metadata: {
                orderNum: sale.orderNum,
                clientName: sale.clientName,
              },
            });
          }
        } catch (_) {
          // La actividad no debe romper el flujo principal
        }
      });

      return { payment: savedPayment, sale: updatedSale };
    });
  },

  // ── Listar pagos de una venta ─────────────────────────────────────────────

  async listPayments(saleId: string, userId: string): Promise<Payment[]> {
    // Verificar que la venta pertenece al usuario
    const sale = await saleRepo.findOne({ where: { id: saleId, userId } });
    if (!sale) throw new Error("Venta no encontrada");

    return paymentRepo.find({
      where: { saleId },
      order: { createdAt: "DESC" },
    });
  },

  // ── Cancelar pago ─────────────────────────────────────────────────────────

  /**
   * Cancela un pago y devuelve su monto al balance de la venta.
   * Si la venta estaba en PAID, regresa a PENDING.
   */
  async cancelPayment(
    paymentId: string,
    userId: string,
  ): Promise<{ payment: Payment; sale: Sale }> {
    const payment = await paymentRepo.findOne({
      where: { id: paymentId },
      relations: ["sale"],
    });
    if (!payment) throw new Error("Pago no encontrado");

    // Verificar que la venta pertenece al usuario
    if (payment.sale.userId !== userId) {
      throw new Error("Pago no encontrado");
    }
    if (payment.status === PaymentStatus.CANCELLED) {
      throw new Error("El pago ya está cancelado");
    }

    const sale = payment.sale;
    const paymentAmount = toNumber(payment.amount);
    const currentBalance = toNumber(sale.balance);
    const totalAmount = toNumber(sale.totalAmount);

    // Devolver el monto al balance (sin exceder el total original)
    const newBalance = Math.min(currentBalance + paymentAmount, totalAmount);
    sale.balance = newBalance;

    // Si la venta estaba pagada, vuelve a pendiente
    if (sale.status === SaleStatus.PAID) {
      sale.status = SaleStatus.PENDING;
    }

    payment.status = PaymentStatus.CANCELLED;

    await paymentRepo.save(payment);
    const updatedSale = await saleRepo.save(sale);

    // ── Actividad ─────────────────────────────────────────────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_PAYMENT_CANCELLED,
      title: sale.title,
      description: `Pago de $${paymentAmount.toFixed(2)} cancelado en venta #${sale.orderNum} de ${sale.clientName}`,
      amount: paymentAmount,
      referenceId: sale.id,
      metadata: {
        paymentId: payment.id,
        orderNum: sale.orderNum,
        clientName: sale.clientName,
        newBalance,
      },
    });

    return { payment, sale: updatedSale };
  },

  // ── Eliminar pago ─────────────────────────────────────────────────────────

  /**
   * Elimina físicamente el pago y devuelve su monto al balance de la venta.
   */
  async deletePayment(
    paymentId: string,
    userId: string,
  ): Promise<{ sale: Sale }> {
    const payment = await paymentRepo.findOne({
      where: { id: paymentId },
      relations: ["sale"],
    });
    if (!payment) throw new Error("Pago no encontrado");

    if (payment.sale.userId !== userId) {
      throw new Error("Pago no encontrado");
    }

    const sale = payment.sale;
    const paymentAmount = toNumber(payment.amount);
    const currentBalance = toNumber(sale.balance);
    const totalAmount = toNumber(sale.totalAmount);

    // Solo restaurar balance si el pago estaba activo
    if (payment.status === PaymentStatus.PAID) {
      sale.balance = Math.min(currentBalance + paymentAmount, totalAmount);
      if (sale.status === SaleStatus.PAID) {
        sale.status = SaleStatus.PENDING;
      }
    }

    await paymentRepo.remove(payment);
    const updatedSale = await saleRepo.save(sale);

    // ── Actividad ─────────────────────────────────────────────────────────
    await ActivityService.create({
      userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_PAYMENT_CANCELLED,
      title: sale.title,
      description: `Pago de $${paymentAmount.toFixed(2)} eliminado de venta #${sale.orderNum} de ${sale.clientName}`,
      amount: paymentAmount,
      referenceId: sale.id,
      metadata: {
        orderNum: sale.orderNum,
        clientName: sale.clientName,
        newBalance: sale.balance,
      },
    });

    return { sale: updatedSale };
  },
};
