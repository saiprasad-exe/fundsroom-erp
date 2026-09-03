import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

/** Centralized error handler — the single place that formats error responses. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  const pgError = error as { code?: string; constraint?: string; detail?: string };
  if (pgError?.code === "23505") {
    res.status(409).json({ success: false, error: { code: "CONFLICT", message: "Conflict" } });
    return;
  }
  if (pgError?.code === "23503") {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Referenced record does not exist" },
    });
    return;
  }
  if (pgError?.code === "23514") {
    res.status(422).json({
      success: false,
      error: { code: "CONSTRAINT_VIOLATION", message: "Operation violates a database constraint" },
    });
    return;
  }

  console.error("Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
}
