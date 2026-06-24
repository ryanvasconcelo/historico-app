import cors from "cors";
import express from "express";
import helmet from "helmet";
import { historyRouter } from "./history/routes.js";
import { importBatchesRouter } from "./import-batches/routes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
      credentials: false
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/history", historyRouter);
  app.use("/api/import-batches", importBatchesRouter);

  app.use((_req, res) => {
    res.status(404).json({ message: "Rota nao encontrada." });
  });

  return app;
}
