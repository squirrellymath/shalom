import { createHash, randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db, messagesTable } from "@workspace/db";
import { encryptText, decryptText } from "./crypto";

type TransactionHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const FULL_VERIFY_MESSAGE_LIMIT = 1_000;
export const TAIL_VERIFY_MESSAGE_COUNT = 100;

export type ChainVerification = {
  valid: boolean;
  partial?: boolean;
  brokenAtSeq?: number;
};

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

function verifyMessage(message: InsertedMessage, expectedPrevHash: string): boolean {
  try {
    if (message.prevHash !== expectedPrevHash) {
      return false;
    }

    const plainText = decryptText(message.text);
    const expectedHash = computeHash({
      prevHash: message.prevHash,
      conversationId: message.conversationId,
      seq: message.seq,
      sender: message.sender,
      text: plainText,
      createdAt: message.createdAt,
    });
    return message.hash === expectedHash;
  } catch {
    return false;
  }
}

export function verifyMessageRows(
  messages: InsertedMessage[],
  options: { partial?: boolean } = {},
): ChainVerification {
  if (messages.length === 0) {
    return options.partial ? { valid: true, partial: true } : { valid: true };
  }

  if (!options.partial) {
    for (let i = 0; i < messages.length; i++) {
      const expectedPrevHash = i === 0 ? "" : messages[i - 1].hash;
      if (!verifyMessage(messages[i], expectedPrevHash)) {
        return { valid: false, brokenAtSeq: messages[i].seq };
      }
    }
    return { valid: true };
  }

  if (!verifyMessage(messages[0], "")) {
    return { valid: false, partial: true, brokenAtSeq: messages[0].seq };
  }

  const tailStart = Math.max(1, messages.length - TAIL_VERIFY_MESSAGE_COUNT);
  let previousHash = messages[tailStart - 1].hash;
  for (let i = tailStart; i < messages.length; i++) {
    if (!verifyMessage(messages[i], previousHash)) {
      return { valid: false, partial: true, brokenAtSeq: messages[i].seq };
    }
    previousHash = messages[i].hash;
  }
  return { valid: true, partial: true };
}

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
): Promise<ChainVerification> {
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.seq);

  return verifyMessageRows(messages);
}
