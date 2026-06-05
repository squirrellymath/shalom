import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
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
});

export type Invite = typeof invitesTable.$inferSelect;
