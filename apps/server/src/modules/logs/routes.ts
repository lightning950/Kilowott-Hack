import { Router } from "express";
import { logListQuerySchema } from "@pim/shared";
import { handle, send } from "../../lib/http";
import { parseQuery } from "../../middleware/validate";
import { logRepo } from "./repo";

export const logRoutes = Router();

logRoutes.get("/", handle((req, res) => send(res, logRepo.list(parseQuery(logListQuerySchema, req)))));
