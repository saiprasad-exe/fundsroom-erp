import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { forbidden, unauthorized } from "../lib/errors";

export type AppRole = "ADMIN" | "SALES" | "WAREHOUSE" | "ACCOUNTS";

export interface AuthUser {
  id: string;
  email: string;
  role: AppRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

/** Verifies the `Authorization: Bearer <jwt>` header and attaches req.user. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return next(unauthorized("Missing bearer token"));

  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    req.user = {
      id: String(payload.sub),
      email: String(payload.email),
      role: payload.role as AppRole,
    };
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}

/** Role-based authorization. ADMIN always passes. */
export function authorize(...roles: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === "ADMIN" || roles.includes(req.user.role)) return next();
    next(forbidden(`Requires one of: ${["ADMIN", ...roles].join(", ")}`));
  };
}
