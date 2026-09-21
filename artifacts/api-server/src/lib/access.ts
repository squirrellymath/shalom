import { and, eq, or } from "drizzle-orm";
import { db, conversationsTable } from "@workspace/db";

export const SHALOM_BYPASS = new Set([
  "justin.malkin@outlook.com",
  "rechavambenshlomo@outlook.com",
  "rechavambenshlomo@gmail.com",
  "adam.kokesh@gmail.com",
]);

type DatabaseLike = typeof db;

export function isGuestUser(user: {
  email?: unknown;
  role?: unknown;
  is_guest?: unknown;
}): boolean {
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const role = typeof user.role === "string" ? user.role.trim().toLowerCase() : "";
  return user.is_guest === true || role === "guest" || email.startsWith("__guest__");
}

export async function canAccess(
  userId: string,
  email: string,
  database: DatabaseLike = db,
  role?: string,
): Promise<boolean> {
  if (isGuestUser({ email, role })) return false;
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