import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";

export const participantsTable = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("principal"),
  status: text("status").notNull().default("active"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("participants_conversation_user_uniq").on(t.conversationId, t.userId),
  index("participants_user_id_idx").on(t.userId),
  check("participants_role_check", sql`${t.role} IN ('principal', 'neutral')`),
  check("participants_status_check", sql`${t.status} IN ('active', 'removed')`),
]);

export type Participant = typeof participantsTable.$inferSelect;