import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";

const ADVISORY_LOCK_KEY = 2147483647;
const MIGRATION_FILE = "0000_messy_puck.sql";

export const migrationPath =
  process.env.MIGRATION_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/app/lib/db/drizzle/0000_messy_puck.sql"
    : path.resolve(process.cwd(), "../../lib/db/drizzle/0000_messy_puck.sql"));

export async function runStartupMigration(): Promise<void> {
  const migrationSql = await readFile(migrationPath, "utf8");
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    await client.query(migrationSql);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The original migration error is the actionable failure.
    }
    throw error;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}

export { MIGRATION_FILE };