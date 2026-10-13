import { Router } from "express";
import { handle, send } from "../../lib/http";
import { importService } from "./service";

export const importRoutes = Router();
importRoutes.post("/", handle(async (_req, res) => send(res, await importService.run())));
