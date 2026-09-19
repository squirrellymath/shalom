import { and, eq, or } from "drizzle-orm";
import { db, conversationsTable } from "@workspace/db";

export const SHALOM_BYPASS = new Set([
  "justin.malkin@outlook.com",
  "rechavambenshlomo@outlook.com",
  "rechavambenshlomo@gmail.com",
  "adam.kokesh@gmail.com",
]);

type DatabaseLike = typeof db;

export async function canAccess(
  userId: string,
  email: string,
  database: DatabaseLike = db,
): Promise<boolean> {
  if (SHALOM_BYPASS.has(email.trim().toLowerCase())) return true;

  const [conversation] = await database
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      or(
        eq(conversationsTable.ownerUserId, userId),
        eq(conversationsTable.partnerUserId, userId),
      ),
    )
    .limit(1);

  return Boolean(conversation);
}