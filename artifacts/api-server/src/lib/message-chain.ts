import { createHash } from "node:crypto";
import { eq, max, desc } from "drizzle-orm";
import { db, messagesTable } from "@workspace/db";

function computeHash(fields: {
  prevHash: string;
  conversationId: string;
  seq: number;
  sender: string;
  text: string;
  createdAt: Date;
}): string {
  const input = [
    fields.prevHash,
    fields.conversationId,
    String(fields.seq),
    fields.sender,
    fields.text,
    fields.createdAt.toISOString(),
  ].join("\n");
  return createHash("sha256").update(input).digest("hex");
}

export type InsertedMessage = typeof messagesTable.$inferSelect;

export async function insertMessage(
  conversationId: string,
  sender: string,
  text: string,
  maxRetries = 5,
): Promise<InsertedMessage> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [agg] = await tx
          .select({ maxSeq: max(messagesTable.seq) })
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, conversationId));

        const seq = (agg?.maxSeq ?? -1) + 1;

        let prevHash = "";
        if (seq > 0) {
          const [prev] = await tx
            .select({ hash: messagesTable.hash })
            .from(messagesTable)
            .where(eq(messagesTable.conversationId, conversationId))
            .orderBy(desc(messagesTable.seq))
            .limit(1);
          prevHash = prev?.hash ?? "";
        }

        const createdAt = new Date();
        const hash = computeHash({ prevHash, conversationId, seq, sender, text, createdAt });

        const [msg] = await tx
          .insert(messagesTable)
          .values({ conversationId, sender, text, seq, prevHash, hash, createdAt })
          .returning();

        return msg;
      });
    } catch (err: any) {
      lastErr = err;
      const isConflict = err?.code === "23505";
      if (isConflict && attempt < maxRetries - 1) continue;
      throw err;
    }
  }
  throw lastErr;
}

export async function verifyChain(
  conversationId: string,
): Promise<{ valid: boolean; brokenAtSeq?: number }> {
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.seq);

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];

    const expectedPrevHash = i === 0 ? "" : messages[i - 1].hash;
    if (m.prevHash !== expectedPrevHash) {
      return { valid: false, brokenAtSeq: m.seq };
    }

    const expectedHash = computeHash({
      prevHash: m.prevHash,
      conversationId: m.conversationId,
      seq: m.seq,
      sender: m.sender,
      text: m.text,
      createdAt: m.createdAt,
    });
    if (m.hash !== expectedHash) {
      return { valid: false, brokenAtSeq: m.seq };
    }
  }

  return { valid: true };
}
