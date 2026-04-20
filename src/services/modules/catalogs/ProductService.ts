import { AppDataSource } from "@/config/data-source";
import { Product } from "@/entities/modules/catalogs/Product";
import { ActivityService } from "@/services/modules/ActivityService";
import { ActivityModule, ActivityType } from "@/entities/modules/Activity";
import cloudinary from "@/config/cloudinary.config";

const productRepo = AppDataSource.getRepository(Product);

// ─── Helpers Cloudinary ───────────────────────────────────────────────────────

async function uploadProductImage(
  base64Image: string,
  tempId: string,
): Promise<{ url: string; publicId: string }> {
  const dataUri = base64Image.startsWith("data:")
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "kolekta/products",
    public_id: tempId,
    overwrite: true,
    transformation: [
      { width: 600, height: 600, crop: "fill", quality: "auto:good" },
    ],
  });

  return { url: result.secure_url, publicId: result.public_id };
}

async function deleteProductImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (_) {
    // silencioso: no bloqueamos la operación principal
  }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateProductDto {
  description: string;
  price: number;
  /** Imagen en base64 opcional. Ej: "data:image/jpeg;base64,..." */
  imageBase64?: string;
}

export interface UpdateProductDto {
  description?: string;
  price?: number;
  /** Nueva imagen en base64. Reemplaza la anterior en Cloudinary. */
  imageBase64?: string;
  /** Si true, elimina la imagen actual sin subir una nueva. */
  removeImage?: boolean;
}

export interface ListProductsFilter {
  limit?: number;
  offset?: number;
  search?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const ProductService = {
  // ── Crear producto ────────────────────────────────────────────────────────

  async createProduct(userId: string, dto: CreateProductDto): Promise<Product> {
    if (!dto.description?.trim()) {
      throw new Error("La descripción del producto es requerida");
    }
    if (isNaN(dto.price) || dto.price <= 0) {
      throw new Error("El precio debe ser mayor a 0");
    }

    let imageUrl: string | null = null;
    let imagePublicId: string | null = null;

    if (dto.imageBase64) {
      const tempId = `product_${userId}_${Date.now()}`;
      const uploaded = await uploadProductImage(dto.imageBase64, tempId);
      imageUrl = uploaded.url;
      imagePublicId = uploaded.publicId;
    }

    const product = productRepo.create({
      userId,
      description: dto.description.trim(),
      price: dto.price,
      imageUrl,
      imagePublicId,
    });

    const saved = await productRepo.save(product);

    await ActivityService.create({
      userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_PRODUCT_CREATED,
      title: saved.description,
      description: `Producto "${saved.description}" creado con precio $${Number(saved.price).toFixed(2)}`,
      amount: saved.price,
      referenceId: saved.id,
      metadata: { productId: saved.id },
    });

    return saved;
  },

  // ── Listar productos del usuario ──────────────────────────────────────────

  async listProducts(
    userId: string,
    filter: ListProductsFilter = {},
  ): Promise<{ products: Product[]; total: number }> {
    const { limit = 100, offset = 0, search } = filter;

    const qb = productRepo
      .createQueryBuilder("p")
      .where("p.userId = :userId", { userId });

    if (search?.trim()) {
      qb.andWhere("p.description LIKE :search", {
        search: `%${search.trim()}%`,
      });
    }

    const [products, total] = await qb
      .orderBy("p.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { products, total };
  },

  // ── Obtener producto por ID ───────────────────────────────────────────────

  async getProductById(id: string, userId: string): Promise<Product> {
    const product = await productRepo.findOne({ where: { id, userId } });
    if (!product) throw new Error("Producto no encontrado");
    return product;
  },

  // ── Editar producto ───────────────────────────────────────────────────────
  //
  // IMPORTANTE: Editar description/price aquí NO afecta las ventas existentes
  // porque éstas almacenan su propio snapshot (SaleItem.productName / unitPrice).

  async updateProduct(
    id: string,
    userId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await productRepo.findOne({ where: { id, userId } });
    if (!product) throw new Error("Producto no encontrado");

    if (dto.description !== undefined) {
      if (!dto.description.trim()) {
        throw new Error("La descripción no puede estar vacía");
      }
      product.description = dto.description.trim();
    }

    if (dto.price !== undefined) {
      if (isNaN(dto.price) || dto.price <= 0) {
        throw new Error("El precio debe ser mayor a 0");
      }
      product.price = dto.price;
    }

    // ── Manejo de imagen ──────────────────────────────────────────────────
    if (dto.removeImage && product.imagePublicId) {
      await deleteProductImage(product.imagePublicId);
      product.imageUrl = null;
      product.imagePublicId = null;
    } else if (dto.imageBase64) {
      // Si ya tenía imagen, la eliminamos primero
      if (product.imagePublicId) {
        await deleteProductImage(product.imagePublicId);
      }
      const tempId = `product_${userId}_${Date.now()}`;
      const uploaded = await uploadProductImage(dto.imageBase64, tempId);
      product.imageUrl = uploaded.url;
      product.imagePublicId = uploaded.publicId;
    }

    const updated = await productRepo.save(product);

    await ActivityService.create({
      userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_PRODUCT_UPDATED,
      title: updated.description,
      description: `Producto "${updated.description}" actualizado`,
      amount: null,
      referenceId: updated.id,
      metadata: { productId: updated.id },
    });

    return updated;
  },

  // ── Eliminar producto ─────────────────────────────────────────────────────
  //
  // Elimina el registro de BD y su imagen en Cloudinary (si tiene).
  // Los SaleItems existentes conservan su snapshot; no se ven afectados.

  async deleteProduct(id: string, userId: string): Promise<void> {
    const product = await productRepo.findOne({ where: { id, userId } });
    if (!product) throw new Error("Producto no encontrado");

    const { description, price, imagePublicId } = product;

    await productRepo.remove(product);

    // Eliminar imagen de Cloudinary después del remove para no dejar huérfanos
    if (imagePublicId) {
      await deleteProductImage(imagePublicId);
    }

    await ActivityService.create({
      userId,
      module: ActivityModule.CATALOG,
      type: ActivityType.CATALOG_PRODUCT_DELETED,
      title: description,
      description: `Producto "${description}" eliminado`,
      amount: price,
      referenceId: id,
      metadata: { productId: id },
    });
  },
};
