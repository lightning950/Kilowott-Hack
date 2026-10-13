import { Router } from "express";
import type { HealthReport, Stats } from "@pim/shared";
import { handle, send } from "../../lib/http";
import { checkWooConnection } from "../../lib/woo";
import { logRepo } from "../logs/repo";
import { productRepo } from "../products/repo";
import { variationRepo } from "../variations/repo";

export const systemRoutes = Router();

systemRoutes.get(
  "/health",
  handle(async (_req, res) => {
    const woo = await checkWooConnection();
    const report: HealthReport = {
      status: woo.state === "connected" ? "ok" : "degraded",
      version: "1.0.0",
      database: "ok",
      woo,
    };
    send(res, report);
  }),
);

systemRoutes.get(
  "/stats",
  handle((_req, res) => {
    const byStatus = productRepo.countsByStatus();
    const byType = productRepo.countsByType();
    const stats: Stats = {
      total: byType.simple + byType.variable,
      byStatus,
      byType,
      variations: variationRepo.count(),
      pending: byStatus.draft + byStatus.out_of_sync + byStatus.failed,
      lastSyncAt: logRepo.lastSuccessAt(),
      last24h: logRepo.countsSince(new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    };
    send(res, stats);
  }),
);