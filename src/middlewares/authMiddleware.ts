import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JWTPayload {
  id: string;
  email: string;
  userAccount?: string;
}

/**
 * Middleware de autenticación JWT mejorado
 * Verifica que el usuario tenga un token válido en el header Authorization
 */
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "No autorizado",
        message: "No se proporcionó un token de autenticación",
      });
    }

    // Validar formato del header (debe ser "Bearer TOKEN")
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({
        error: "No autorizado",
        message: "Formato de token inválido. Use: Bearer <token>",
      });
    }

    const token = parts[1];

    if (!token) {
      return res.status(401).json({
        error: "No autorizado",
        message: "Token no proporcionado",
      });
    }

    // Verificar el token
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({
        error: "Error de configuración del servidor",
      });
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // Adjuntar los datos del usuario al request
    (req as any).user = decoded;
    next();
  } catch (error) {
    console.error("Error en authMiddleware:", error.message);

    // Manejar diferentes tipos de errores de JWT
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "No autorizado",
        message: "Token inválido",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "No autorizado",
        message: "Token expirado. Por favor inicia sesión nuevamente",
      });
    }

    // Error genérico
    return res.status(401).json({
      error: "No autorizado",
      message: "Error al verificar el token",
    });
  }
};
