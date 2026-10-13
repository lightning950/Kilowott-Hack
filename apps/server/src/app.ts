import { variationRoutes } from "./modules/variations/routes";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { attributeSetRoutes } from "./modules/attributeSets/routes";
import { logRoutes } from "./modules/logs/routes";
import { productRoutes } from "./modules/products/routes";
import { systemRoutes } from "./modules/system/routes";
import { syncRoutes } from "./modules/sync/routes";
import { importRoutes } from "./modules/import/routes";
import { mockStore } from "./lib/woo";
import { mockStoreApiRoutes, mockStorePageRoutes } from "./modules/system/mockStoreRoutes";

export const createApp = () => {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", systemRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/attribute-sets", attributeSetRoutes);
  app.use("/api/logs", logRoutes);
  app.use("/api/variations", variationRoutes);
  app.use("/api/sync", syncRoutes);
  app.use("/api/import", importRoutes);
  if (mockStore) {
    app.use("/mock-store", mockStorePageRoutes);
    app.use("/api/mock-store", mockStoreApiRoutes);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
