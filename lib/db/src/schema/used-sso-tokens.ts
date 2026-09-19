import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const usedSsoTokensTable = pgTable("used_sso_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("used_sso_tokens_used_at_idx").on(t.usedAt),
]);

export type UsedSsoToken = typeof usedSsoTokensTable.$inferSelect;