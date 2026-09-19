import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";

export const invitesTable = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversationsTable.id),
  invitedEmail: text("invited_email"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [
  index("invites_conversation_id_idx").on(t.conversationId),
  check("invites_status_check", sql`${t.status} IN ('pending', 'accepted', 'expired')`),
]);

export type Invite = typeof invitesTable.$inferSelect;
