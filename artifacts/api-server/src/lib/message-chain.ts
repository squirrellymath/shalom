import { createHash, randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db, messagesTable } from "@workspace/db";
import { encryptText, decryptText } from "./crypto";

type TransactionHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  transaction?: TransactionHandle,
  maxRetries = 5,
): Promise<InsertedMessage> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const insert = async (tx: typeof db | TransactionHandle): Promise<InsertedMessage> => {
        const previousRows = await tx
          .select({ seq: messagesTable.seq, hash: messagesTable.hash })
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, conversationId))
          .orderBy(desc(messagesTable.seq))
          .limit(1);

        const [prev] = previousRows;
        const previousSeq = Number(prev?.seq);
        const seq = prev
          ? Number.isFinite(previousSeq)
            ? previousSeq + 1
            : previousRows.length
          : 0;
        const prevHash = prev?.hash ?? "";

        const createdAt = new Date();
        const hash = computeHash({ prevHash, conversationId, seq, sender, text, createdAt });

        const [msg] = await tx
          .insert(messagesTable)
          .values({
            id: randomUUID(),
            conversationId,
            sender,
            text: encryptText(text),
            seq,
            prevHash,
            hash,
            createdAt,
          })
          .returning();

        return { ...msg, text };
      };

      if (transaction) return await insert(transaction);
      return await db.transaction(insert);
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

    let plainText: string;
    try {
      plainText = decryptText(m.text);
    } catch {
      return { valid: false, brokenAtSeq: m.seq };
    }

    const expectedHash = computeHash({
      prevHash: m.prevHash,
      conversationId: m.conversationId,
      seq: m.seq,
      sender: m.sender,
      text: plainText,
      createdAt: m.createdAt,
    });
    if (m.hash !== expectedHash) {
      return { valid: false, brokenAtSeq: m.seq };
    }
  }

  return { valid: true };
}
