import { env } from "./config/env";
import { runMigrations } from "./db/migrate";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { woo } from "./lib/woo";
import { productRepo } from "./modules/products/repo";

const { from, to } = runMigrations();
if (from !== to) logger.info(`Database migrated ${from} → ${to}`);

const interrupted = productRepo.resetInterruptedSyncs();
if (interrupted) logger.warn(`${interrupted} interrupted sync(s) marked as failed`);

createApp()
  .listen(env.PORT, () => {
    logger.info(`PIM server on http://localhost:${env.PORT} (store: ${woo.mode} → ${woo.storeUrl})`);
  })
  .on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") logger.fatal(`Port ${env.PORT} is already in use. Stop the other process or change PORT in .env.`);
    else logger.fatal(err);
    process.exit(1);
  });
  