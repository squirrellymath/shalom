import { pgTable, text, uuid, timestamp, bigint, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conversationsTable } from "./conversations";

export const messagesTable = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  seq: bigint("seq", { mode: "number" }).notNull(),
  sender: text("sender").notNull(),
  text: text("text").notNull(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("messages_conversation_seq_uniq").on(t.conversationId, t.seq),
]);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true, createdAt: true, seq: true, prevHash: true, hash: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
