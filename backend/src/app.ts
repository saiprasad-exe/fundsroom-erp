import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.routes";
import { customersRouter } from "./routes/customers.routes";
import { productsRouter } from "./routes/products.routes";
import { challansRouter } from "./routes/challans.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { errorHandler, notFoundHandler } from "./middleware/error";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",") }));
  app.use(express.json({ limit: "1mb" }));
  if (!env.isTest) app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/api/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", uptime: process.uptime() } });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/challans", challansRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
