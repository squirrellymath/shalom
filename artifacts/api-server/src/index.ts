import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { migrationPath, runStartupMigration } from "./startup-migration";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  await runStartupMigration();
  logger.info({ migrationPath }, "Startup migration completed");
} catch (err) {
  logger.error({ err, migrationPath }, "Startup migration failed");
  await pool.end();
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
