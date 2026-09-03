import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { badRequest } from "../lib/errors";

/** Validates and replaces req.body with the parsed, typed value. */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        badRequest(
          "Request validation failed",
          result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
        ),
      );
    }
    req.body = result.data;
    next();
  };
}
