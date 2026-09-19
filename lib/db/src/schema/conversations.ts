import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversationsTable = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull(),
  partnerUserId: text("partner_user_id"),
  partnerName: text("partner_name").notNull(),
  partnerEmail: text("partner_email"),
  topic: text("topic"),
  mode: text("mode").notNull().default("witness"),
  clientRequestId: uuid("client_request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("conversations_owner_client_request_uniq").on(t.ownerUserId, t.clientRequestId),
  index("conversations_owner_user_id_idx").on(t.ownerUserId),
  index("conversations_partner_user_id_idx").on(t.partnerUserId),
  index("conversations_updated_at_idx").on(t.updatedAt),
  check("conversations_mode_check", sql`${t.mode} IN ('witness', 'mediated')`),
]);

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
