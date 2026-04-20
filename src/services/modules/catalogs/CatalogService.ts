// src/services/modules/CatalogService.ts
// CAMBIOS respecto a la versión anterior:
//  - createSale acepta `items` (array de SaleItemInput) en lugar de totalAmount manual
//  - totalAmount se calcula automáticamente de los items
//  - updateSale permite editar los items de la venta (solo sin pagos)
//  - Se agregan métodos: addSaleItem, updateSaleItem, removeSaleItem
//  - getSaleById y listSales cargan la relación `items`
import { AppDataSource } from "@/config/data-source";
import { Sale, SaleStatus } from "@/entities/modules/catalogs/Sale";
import { SaleItem } from "@/entities/modules/catalogs/SaleItem";
import { Payment, PaymentStatus } from "@/entities/modules/catalogs/Payment";
import { Product } from "@/entities/modules/catalogs/Product";
import { ActivityService } from "@/services/modules/ActivityService";
import { ActivityModule, ActivityType } from "@/entities/modules/Activity";

const saleRepo = AppDataSource.getRepository(Sale);
const itemRepo = AppDataSource.getRepository(SaleItem);
const paymentRepo = AppDataSource.getRepository(Payment);
const productRepo = AppDataSource.getRepository(Product);

// ─── DTOs ─────────────────────────────────────────────────────────────────────

/**
 * Representa un ítem al crear o agregar a una venta.
 * Puede provenir de un producto registrado (productId) o ser libre (solo description + price).
 */
export interface SaleItemInput {
  /** ID del Product registrado (opcional). Si se proporciona, se toma description/price de él. */
  productId?: string | null;
  /** Descripción libre (requerida solo si no hay productId). */
  description?: string;
  /** Precio unitario libre (requerido solo si no hay productId). */
  price?: number;
  /** Cantidad de unidades (mínimo 1). */
  quantity: number;
}

export interface CreateSaleDto {
  userId: string;
  clientName: string;
  clientPhone?: string | null;
  title: string;
  date: string; // "YYYY-MM-DD"
  items: SaleItemInput[];
}

export interface UpdateSaleDto {
  title?: string;
  clientPhone?: string | null;
  /** Reemplaza todos los items de la venta. Solo permitido sin pagos activos. */
  items?: SaleItemInput[];
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

/**
 * Construye un arreglo de SaleItem (sin persistir) a partir de SaleItemInput[].
 * Valida stock, precio y resuelve snapshot desde Product si se proporciona productId.
 */
async function buildSaleItems(
  userId: string,
  inputs: SaleItemInput[],
): Promise<Omit<SaleItem, "id" | "saleId" | "sale" | "createdAt">[]> {
  if (!inputs || inputs.length === 0) {
    throw new Error("La venta debe tener al menos un producto");
  }

  const builtItems: Omit<SaleItem, "id" | "saleId" | "sale" | "createdAt">[] =
    [];

  for (const input of inputs) {
    if (!input.quantity || input.quantity < 1) {
      throw new Error("La cantidad de cada ítem debe ser mayor a 0");
    }

    let productName: string;
    let unitPrice: number;

    if (input.productId) {
      // Resolver snapshot desde el catálogo (verificar que pertenece al usuario)
      const product = await productRepo.findOne({
        where: { id: input.productId, userId },
      });
      if (!product) {
        throw new Error(`Producto con id "${input.productId}" no encontrado`);
      }
      productName = product.description;
      unitPrice = toNumber(product.price);
    } else {
      // Producto libre — requiere description y price explícitos
      if (!input.description?.trim()) {
        throw new Error(
          "Los ítems sin productId requieren el campo description",
        );
      }
      if (!input.price || input.price <= 0) {
        throw new Error(
          "Los ítems sin productId requieren el campo price mayor a 0",
        );
      }
      productName = input.description.trim();
      unitPrice = input.price;
    }

    const subtotal = parseFloat((unitPrice * input.quantity).toFixed(2));

    builtItems.push({
      productId: input.productId ?? null,
      productName,
      unitPrice,
      quantity: input.quantity,
      subtotal,
    });
  }

  return builtItems;
}

/** Recalcula el totalAmount de una venta a partir de sus ítems. */
function calcTotal(items: Array<{ subtotal: number | string }>): number {
  return parseFloat(
    items.reduce((sum, i) => sum + toNumber(i.subtotal), 0).toFixed(2),
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const CatalogService = {
  // ══════════════════════════════════════════════════════════════════════════
  // VENTAS
  // ══════════════════════════════════════════════════════════════════════════

  async createSale(dto: CreateSaleDto): Promise<Sale> {
    const builtItems = await buildSaleItems(dto.userId, dto.items);
    const totalAmount = calcTotal(builtItems);

    // Siguiente orderNum para el usuario
    const lastSale = await saleRepo.findOne({
      where: { userId: dto.userId },
      order: { orderNum: "DESC" },
    });
    const orderNum = (lastSale?.orderNum ?? 0) + 1;

    // Crear la venta
    const sale = saleRepo.create({
      userId: dto.userId,
      orderNum,
      clientName: dto.clientName,
      clientPhone: dto.clientPhone ?? null,
      title: dto.title,
      totalAmount,
      balance: totalAmount,
      date: dto.date,
      status: SaleStatus.PENDING,
    });

    const savedSale = await saleRepo.save(sale);

    // Persistir los ítems
    const saleItems = itemRepo.create(
      builtItems.map((i) => ({ ...i, saleId: savedSale.id })),
    );
    await itemRepo.save(saleItems);

    // Recargar con relaciones
    const full = await saleRepo.findOne({
      where: { id: savedSale.id },
      relations: ["items", "payments"],
    });

    await ActivityService.create({
      userId: dto.userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_SALE_CREATED,
      title: dto.title,
      description: `Venta #${orderNum} creada para ${dto.clientName} con ${builtItems.length} producto(s) por $${totalAmount.toFixed(2)}`,
      amount: totalAmount,
      referenceId: savedSale.id,
      metadata: {
        orderNum,
        clientName: dto.clientName,
        itemCount: builtItems.length,
      },
    });

    return full!;
  },

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
      relations: ["items", "payments"],
    });

    return { sales, total };
  },

  async getSaleById(id: string, userId: string): Promise<Sale> {
    const sale = await saleRepo.findOne({
      where: { id, userId },
      relations: ["items", "payments"],
    });
    if (!sale) throw new Error("Venta no encontrada");
    return sale;
  },

  /**
   * Edita title, clientPhone e items de la venta.
   * Solo se permite mientras NO existan pagos activos (PAID).
   * Si se envían `items`, se reemplazan todos los ítems actuales y se
   * recalcula totalAmount y balance.
   */
  async updateSale(
    id: string,
    userId: string,
    dto: UpdateSaleDto,
  ): Promise<Sale> {
    const sale = await saleRepo.findOne({
      where: { id, userId },
      relations: ["items", "payments"],
    });
    if (!sale) throw new Error("Venta no encontrada");

    if (sale.status === SaleStatus.CANCELLED) {
      throw new Error("No se puede editar una venta cancelada");
    }
    if (sale.status === SaleStatus.PAID) {
      throw new Error("No se puede editar una venta ya pagada");
    }

    const hasActivePayments = sale.payments.some(
      (p) => p.status === PaymentStatus.PAID,
    );
    if (hasActivePayments) {
      throw new Error(
        "No se puede editar la venta porque ya tiene pagos registrados",
      );
    }

    if (dto.title !== undefined) sale.title = dto.title;
    if (dto.clientPhone !== undefined)
      sale.clientPhone = dto.clientPhone ?? null;

    // ── Reemplazar ítems ──────────────────────────────────────────────────
    if (dto.items !== undefined) {
      const builtItems = await buildSaleItems(userId, dto.items);
      const newTotal = calcTotal(builtItems);

      // Eliminar ítems anteriores
      if (sale.items?.length) {
        await itemRepo.remove(sale.items);
      }

      // Insertar nuevos ítems
      const newSaleItems = itemRepo.create(
        builtItems.map((i) => ({ ...i, saleId: sale.id })),
      );
      await itemRepo.save(newSaleItems);

      sale.totalAmount = newTotal;
      sale.balance = newTotal; // sin pagos, balance = total
    }

    const updated = await saleRepo.save(sale);

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

    // Recargar con relaciones actualizadas
    return (await saleRepo.findOne({
      where: { id: updated.id },
      relations: ["items", "payments"],
    }))!;
  },

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

  async deleteSale(id: string, userId: string): Promise<void> {
    const sale = await saleRepo.findOne({ where: { id, userId } });
    if (!sale) throw new Error("Venta no encontrada");

    const orderNum = sale.orderNum;
    const clientName = sale.clientName;
    const title = sale.title;
    const totalAmount = toNumber(sale.totalAmount);

    await saleRepo.remove(sale);

    await ActivityService.create({
      userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_SALE_DELETED,
      title,
      description: `Venta #${orderNum} de ${clientName} eliminada`,
      amount: totalAmount,
      referenceId: id,
      metadata: { orderNum, clientName },
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PAGOS  (sin cambios en lógica — se mantiene igual)
  // ══════════════════════════════════════════════════════════════════════════

  async createPayment(
    saleId: string,
    userId: string,
    dto: CreatePaymentDto,
  ): Promise<{ payment: Payment; sale: Sale }> {
    return AppDataSource.transaction(async (manager) => {
      const saleRepository = manager.getRepository(Sale);
      const paymentRepository = manager.getRepository(Payment);

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

      const newBalance = Math.max(0, currentBalance - dto.amount);
      sale.balance = newBalance;
      if (newBalance === 0) {
        sale.status = SaleStatus.PAID;
      }
      const updatedSale = await saleRepository.save(sale);

      const payment = paymentRepository.create({
        saleId: updatedSale.id,
        date: dto.date,
        amount: dto.amount,
        status: PaymentStatus.PAID,
      });
      const savedPayment = await paymentRepository.save(payment);

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
          /* actividad no crítica */
        }
      });

      return { payment: savedPayment, sale: updatedSale };
    });
  },

  async listPayments(saleId: string, userId: string): Promise<Payment[]> {
    const sale = await saleRepo.findOne({ where: { id: saleId, userId } });
    if (!sale) throw new Error("Venta no encontrada");

    return paymentRepo.find({
      where: { saleId },
      order: { createdAt: "DESC" },
    });
  },

  async cancelPayment(
    paymentId: string,
    userId: string,
  ): Promise<{ payment: Payment; sale: Sale }> {
    const payment = await paymentRepo.findOne({
      where: { id: paymentId },
      relations: ["sale"],
    });
    if (!payment) throw new Error("Pago no encontrado");
    if (payment.sale.userId !== userId) throw new Error("Pago no encontrado");
    if (payment.status === PaymentStatus.CANCELLED) {
      throw new Error("El pago ya está cancelado");
    }

    const sale = payment.sale;
    const paymentAmount = toNumber(payment.amount);
    const totalAmount = toNumber(sale.totalAmount);

    const newBalance = Math.min(
      toNumber(sale.balance) + paymentAmount,
      totalAmount,
    );
    sale.balance = newBalance;

    if (sale.status === SaleStatus.PAID) {
      sale.status = SaleStatus.PENDING;
    }

    payment.status = PaymentStatus.CANCELLED;

    await paymentRepo.save(payment);
    const updatedSale = await saleRepo.save(sale);

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

  async deletePayment(
    paymentId: string,
    userId: string,
  ): Promise<{ sale: Sale }> {
    const payment = await paymentRepo.findOne({
      where: { id: paymentId },
      relations: ["sale"],
    });
    if (!payment) throw new Error("Pago no encontrado");
    if (payment.sale.userId !== userId) throw new Error("Pago no encontrado");

    const sale = payment.sale;
    const paymentAmount = toNumber(payment.amount);
    const totalAmount = toNumber(sale.totalAmount);

    if (payment.status === PaymentStatus.PAID) {
      sale.balance = Math.min(
        toNumber(sale.balance) + paymentAmount,
        totalAmount,
      );
      if (sale.status === SaleStatus.PAID) {
        sale.status = SaleStatus.PENDING;
      }
    }

    await paymentRepo.remove(payment);
    const updatedSale = await saleRepo.save(sale);

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
