import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { env } from "../config/env";
import { authenticate, authorize, signToken, type AppRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { loginSchema, registerSchema } from "../lib/validators";
import { conflict, unauthorized } from "../lib/errors";

export const authRouter = Router();

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  password_hash: string;
  is_active: boolean;
}

/** ADMIN-only user provisioning — roles are never self-assigned by strangers. */
authRouter.post(
  "/register",
  authenticate,
  authorize("ADMIN"),
  validate(registerSchema),
  async (req, res, next) => {
    try {
      const { name, email, password, role } = req.body;
      const existing = await pool.query("SELECT 1 FROM users WHERE lower(email) = lower($1)", [
        email,
      ]);
      if (existing.rowCount) throw conflict("A user with this email already exists");

      const hash = await bcrypt.hash(password, env.bcryptRounds);
      const { rows } = await pool.query<UserRow>(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1,$2,$3,$4) RETURNING id, name, email, role`,
        [name, email.toLowerCase(), hash, role],
      );
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query<UserRow>(
      "SELECT id, name, email, role, password_hash, is_active FROM users WHERE lower(email) = lower($1)",
      [email],
    );
    const user = rows[0];
    // Same generic message for unknown email and wrong password (no user enumeration).
    if (!user || !user.is_active) throw unauthorized("Invalid email or password");
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw unauthorized("Invalid email or password");

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
      [req.user!.id],
    );
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});
