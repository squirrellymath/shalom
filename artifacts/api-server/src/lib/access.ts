import { and, eq } from "drizzle-orm";
import { db, participantsTable } from "@workspace/db";

export const SHALOM_BYPASS = new Set([
  "justin.malkin@outlook.com",
  "rechavambenshlomo@outlook.com",
  "rechavambenshlomo@gmail.com",
  "adam.kokesh@gmail.com",
]);

type DatabaseLike = typeof db;

export type GuestCondition = "is_guest" | "role_guest" | "email_prefix" | "none";

export function getGuestCondition(user: {
  email?: unknown;
  role?: unknown;
  is_guest?: unknown;
}): GuestCondition {
  if (user.is_guest === true) return "is_guest";

  const role = typeof user.role === "string" ? user.role.trim().toLowerCase() : "";
  if (role === "guest") return "role_guest";

  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (email.startsWith("__guest__")) return "email_prefix";

  return "none";
}

export function isGuestUser(user: {
  email?: unknown;
  role?: unknown;
  is_guest?: unknown;
}): boolean {
  return getGuestCondition(user) !== "none";
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
    .select({ conversationId: participantsTable.conversationId })
    .from(participantsTable)
    .where(and(
      eq(participantsTable.userId, userId),
      eq(participantsTable.status, "active"),
    ))
    .limit(1);

  return Boolean(conversation);
}