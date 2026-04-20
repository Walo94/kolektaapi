import { Response } from "express";
import { ProductService } from "@/services/modules/catalogs/ProductService";

export const ProductController = {
  /**
   * POST /catalog/products
   * Body: { description, price, imageBase64? }
   */
  async createProduct(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { description, price, imageBase64 } = req.body;

      if (!description || price === undefined) {
        return res
          .status(400)
          .json({ error: "Faltan campos requeridos: description, price" });
      }
      if (isNaN(Number(price)) || Number(price) <= 0) {
        return res
          .status(400)
          .json({ error: "price debe ser un número mayor a 0" });
      }

      const product = await ProductService.createProduct(userId, {
        description,
        price: Number(price),
        imageBase64,
      });

      res.status(201).json({ product });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * GET /catalog/products
   * Query: limit?, offset?, search?
   */
  async listProducts(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { limit, offset, search } = req.query;

      const result = await ProductService.listProducts(userId, {
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
        search: search as string | undefined,
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * GET /catalog/products/:id
   */
  async getProduct(req: any, res: Response) {
    try {
      const product = await ProductService.getProductById(
        req.params.id,
        req.user.id,
      );
      res.json({ product });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  },

  /**
   * PATCH /catalog/products/:id
   * Body: { description?, price?, imageBase64?, removeImage? }
   */
  async updateProduct(req: any, res: Response) {
    try {
      const { description, price, imageBase64, removeImage } = req.body;

      if (price !== undefined && (isNaN(Number(price)) || Number(price) <= 0)) {
        return res
          .status(400)
          .json({ error: "price debe ser un número mayor a 0" });
      }

      const product = await ProductService.updateProduct(
        req.params.id,
        req.user.id,
        {
          description,
          price: price !== undefined ? Number(price) : undefined,
          imageBase64,
          removeImage: Boolean(removeImage),
        },
      );

      res.json({ product });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * DELETE /catalog/products/:id
   */
  async deleteProduct(req: any, res: Response) {
    try {
      await ProductService.deleteProduct(req.params.id, req.user.id);
      res.json({ message: "Producto eliminado correctamente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
};
