import { Router } from "express";
import { idParamsSchema, variationUpdateSchema } from "@pim/shared";
import { handle, send } from "../../lib/http";
import { parseBody, parseParams } from "../../middleware/validate";
import { variationService } from "./service";

export const variationRoutes = Router();

variationRoutes.patch(
  "/:id",
  handle((req, res) => {
    const { id } = parseParams(idParamsSchema, req);
    send(res, variationService.update(id, parseBody(variationUpdateSchema, req)));
  }),
);