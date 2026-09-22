import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

process.env.MESSAGE_ENC_KEY = Buffer.alloc(32, 7).toString("base64");

vi.mock("@workspace/db", async () => import("./test-db"));

const { db, pool, conversationsTable, messagesTable } = await import("./test-db");
const { encryptText } = await import("./lib/crypto");
const { verifyChain } = await import("./lib/message-chain");

function hashMessage(fields: {
  prevHash: string;
  conversationId: string;
  seq: number;
  sender: string;
  text: string;
  createdAt: Date;
}): string {
  return crypto
    .createHash("sha256")
    .update([
      fields.prevHash,
      fields.conversationId,
      String(fields.seq),
      fields.sender,
      fields.text,
      fields.createdAt.toISOString(),
    ].join("\n"))
    .digest("hex");
}

describe("phase 1 verifyChain measurement", () => {
  it("measures 100, 1,000, and 10,000 message chains three times each", async () => {
    for (const size of [100, 1_000, 10_000]) {
      await pool.query("DELETE FROM messages");
      await pool.query("DELETE FROM conversations");

      const conversationId = crypto.randomUUID();
      await db.insert(conversationsTable).values({
        id: conversationId,
        ownerUserId: "measure-owner",
        partnerName: "Measurement",
      });

      const values = [];
      let prevHash = "";
      for (let seq = 0; seq < size; seq++) {
        const text = `measurement message ${seq}`;
        const createdAt = new Date(1_700_000_000_000 + seq);
        const hash = hashMessage({
          prevHash,
          conversationId,
          seq,
          sender: "measure-owner@example.com",
          text,
          createdAt,
        });
        values.push({
          id: crypto.randomUUID(),
          conversationId,
          seq,
          sender: "measure-owner@example.com",
          text: encryptText(text),
          prevHash,
          hash,
          createdAt,
        });
        prevHash = hash;
      }
      await db.insert(messagesTable).values(values);

      const timings: number[] = [];
      for (let run = 1; run <= 3; run++) {
        const started = performance.now();
        const result = await verifyChain(conversationId);
        const elapsed = performance.now() - started;
        expect(result).toEqual({ valid: true });
        timings.push(elapsed);
        console.log(`VERIFY_MEASURE size=${size} run=${run} ms=${elapsed.toFixed(3)} valid=${result.valid}`);
      }
      console.log(`VERIFY_MEASURE_SUMMARY size=${size} ms=${timings.map((ms) => ms.toFixed(3)).join(",")}`);
    }
  });
});