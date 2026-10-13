import { bulkSyncBodySchema, idSchema } from "@pim/shared";
import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import { handle, send } from "../../lib/http";
import { parseBody, parseParams } from "../../middleware/validate";
import { syncService } from "./service";

export const syncRoutes = Router();

syncRoutes.post("/bulk", handle(async (req, res) => send(res, await syncService.syncBulk(parseBody(bulkSyncBodySchema, req).productIds))));

syncRoutes.post(
  "/:productId",
  handle(async (req, res) => {
    const { productId } = parseParams(z.object({ productId: idSchema }), req);
    const result = await syncService.syncProduct(productId);
    if (result.status === "failed") {
      const code = result.errorCode ?? "WOO_REJECTED";
      throw new AppError(code, code === "WOO_TIMEOUT" ? 504 : 502, result.message);
    }
    send(res, result);
  }),
);
