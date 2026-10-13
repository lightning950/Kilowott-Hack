import { variationService } from "../variations/service";
import { Router } from "express";
import {
  idParamsSchema,
  productCreateSchema,
  productDeleteQuerySchema,
  productListQuerySchema,
  productUpdateQuerySchema,
  productUpdateSchema,
} from "@pim/shared";
import { handle, send } from "../../lib/http";
import { parseBody, parseParams, parseQuery } from "../../middleware/validate";
import { productService } from "./service";

export const productRoutes = Router();

productRoutes.get("/", handle((req, res) => send(res, productService.list(parseQuery(productListQuerySchema, req)))));

productRoutes.post("/", handle((req, res) => send(res, productService.create(parseBody(productCreateSchema, req)), 201)));

productRoutes.get("/:id", handle((req, res) => send(res, productService.getDetail(parseParams(idParamsSchema, req).id))));

productRoutes.patch(
  "/:id",
  handle((req, res) => {
    const { id } = parseParams(idParamsSchema, req);
    const body = parseBody(productUpdateSchema, req);
    const opts = parseQuery(productUpdateQuerySchema, req);
    send(res, productService.update(id, body, opts));
  }),
);

productRoutes.delete(
  "/:id",
  handle(async (req, res) => {
    const { id } = parseParams(idParamsSchema, req);
    const { scope } = parseQuery(productDeleteQuerySchema, req);
    send(res, await productService.remove(id, scope));
  }),
);
productRoutes.post(
  "/:id/variations/generate",
  handle((req, res) => send(res, variationService.generate(parseParams(idParamsSchema, req).id))),
);