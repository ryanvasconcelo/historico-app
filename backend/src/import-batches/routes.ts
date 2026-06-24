import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", async (_req, res) => {
  const batches = await prisma.importBatch.findMany({
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }]
  });

  return res.json({ batches });
});

router.get("/:id/rejected-lines", async (req, res) => {
  const batch = await prisma.importBatch.findUnique({
    where: { id: req.params.id }
  });

  if (!batch) {
    return res.status(404).json({ message: "Lote nao encontrado." });
  }

  const rejectedLines = await prisma.importRejectedLine.findMany({
    where: { batchId: batch.id },
    orderBy: [{ lineNumber: "asc" }, { createdAt: "asc" }]
  });

  return res.json({ batch, rejectedLines });
});

export const importBatchesRouter = router;
