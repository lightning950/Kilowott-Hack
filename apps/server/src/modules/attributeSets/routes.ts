import { Router } from "express";
import { attributeSetCreateSchema, attributeSetUpdateSchema, idParamsSchema } from "@pim/shared";
import { handle, send } from "../../lib/http";
import { parseBody, parseParams } from "../../middleware/validate";
import { attributeSetService } from "./service";

export const attributeSetRoutes = Router();

attributeSetRoutes.get("/", handle((_req, res) => send(res, attributeSetService.list())));

attributeSetRoutes.post(
  "/",
  handle((req, res) => send(res, attributeSetService.create(parseBody(attributeSetCreateSchema, req)), 201)),
);

attributeSetRoutes.get(
  "/:id",
  handle((req, res) => send(res, attributeSetService.get(parseParams(idParamsSchema, req).id))),
);

attributeSetRoutes.patch(
  "/:id",
  handle((req, res) => {
    const { id } = parseParams(idParamsSchema, req);
    send(res, attributeSetService.update(id, parseBody(attributeSetUpdateSchema, req)));
  }),
);

attributeSetRoutes.delete(
  "/:id",
  handle((req, res) => send(res, attributeSetService.remove(parseParams(idParamsSchema, req).id))),
);
