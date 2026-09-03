/**
 * Maps Postgres / PostgREST errors raised by the database layer into the
 * HTTP-style contract documented in the README and the Express reference API.
 *
 * The database functions raise errors with a prefix + SQLSTATE, e.g.
 *   RAISE EXCEPTION 'INSUFFICIENT_STOCK: ...' USING ERRCODE = '23514';
 */
export interface ApiFailure {
  success: false;
  status: number;
  message: string;
  code?: string;
}

const PREFIX_STATUS: Record<string, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
};

export class ApiError extends Error {
  status: number;
  code?: string | undefined;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface RawError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  const raw = (error ?? {}) as RawError;
  let message = raw.message ?? "Unexpected error";
  let status = 500;

  const match = /^([A-Z_]+):\s*(.+)$/s.exec(message);
  if (match?.[1] && match[2] && match[1] in PREFIX_STATUS) {
    status = PREFIX_STATUS[match[1]] as number;
    message = match[2].trim();
  } else if (raw.code === "23505" || raw.code === "23505") {
    status = 409;
  } else if (raw.code === "23503") {
    status = 409;
    message = "This record is referenced by other records and cannot be changed.";
  } else if (raw.code === "42501" || raw.code === "PGRST301") {
    status = 403;
    message = "You do not have permission to perform this action.";
  } else if (raw.code === "PGRST116") {
    status = 404;
    message = "Record not found.";
  }

  // Unique-violation friendliness (e.g. duplicate SKU)
  if (raw.code === "23505" && /products_sku_key/.test(raw.details ?? raw.message ?? "")) {
    message = "A product with this SKU already exists.";
    status = 409;
  }

  return new ApiError(message, status, raw.code);
}

export function errorMessage(error: unknown): string {
  return toApiError(error).message;
}
