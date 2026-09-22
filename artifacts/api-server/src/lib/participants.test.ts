import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.MESSAGE_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
vi.mock("@workspace/db", async () => import("../test-db"));

const {
  db,
  pool,
  conversationsTable,
  participantsTable,
} = await import("../test-db");
const {
  BRIDGET_PARTICIPANT_ID,
  ParticipantLimitError,
  createConversationWithParticipants,
  getPrincipalParticipants,
  writeParticipant,
} = await import("./participants");

async function createConversation(ownerUserId = "owner-1", partnerUserId?: string) {
  const [conversation] = await db
    .insert(conversationsTable)
    .values({
      id: crypto.randomUUID(),
      ownerUserId,
      partnerUserId,
      partnerName: "Partner",
    })
    .returning();
  return conversation;
}

beforeEach(async () => {
  await pool.query("DELETE FROM participants");
  await pool.query("DELETE FROM conversations");
});

describe("participants", () => {
  it("backfills owner and partner principals, plus the neutral Bridget seat", async () => {
    const withPartner = await createConversation("owner-with-partner", "partner-1");
    const withoutPartner = await createConversation("owner-without-partner");

    const legacyRows = await db
      .select()
      .from(conversationsTable);
    for (const legacy of legacyRows) {
      await pool.query(
        `INSERT INTO participants (id, conversation_id, user_id, role, status, joined_at)
         VALUES ($1, $2, $3, 'principal', 'active', $4)
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [crypto.randomUUID(), legacy.id, legacy.ownerUserId, legacy.createdAt],
      );
      if (legacy.partnerUserId) {
        await pool.query(
          `INSERT INTO participants (id, conversation_id, user_id, role, status, joined_at)
           VALUES ($1, $2, $3, 'principal', 'active', $4)
           ON CONFLICT (conversation_id, user_id) DO NOTHING`,
          [crypto.randomUUID(), legacy.id, legacy.partnerUserId, legacy.createdAt],
        );
      }
      await pool.query(
        `INSERT INTO participants (id, conversation_id, user_id, role, status, joined_at)
         VALUES ($1, $2, 'bridget', 'neutral', 'active', $3)
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [crypto.randomUUID(), legacy.id, legacy.createdAt],
      );
    }

    const rows = await db
      .select()
      .from(participantsTable)
      .orderBy(participantsTable.userId);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conversationId: withPartner.id,
        userId: "owner-with-partner",
        role: "principal",
      }),
      expect.objectContaining({
        conversationId: withPartner.id,
        userId: "partner-1",
        role: "principal",
      }),
      expect.objectContaining({
        conversationId: withoutPartner.id,
        userId: "owner-without-partner",
        role: "principal",
      }),
      expect.objectContaining({
        conversationId: withoutPartner.id,
        userId: BRIDGET_PARTICIPANT_ID,
        role: "neutral",
      }),
    ]));
    expect(rows).toHaveLength(5);
  });

  it("writes the second principal and legacy partner column together", async () => {
    const conversation = await createConversation();

    await db.transaction(async (tx) => {
      await writeParticipant(tx, {
        conversationId: conversation.id,
        userId: "partner-1",
        role: "principal",
      });
    });

    const [updatedConversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversation.id));
    const [participant] = await db
      .select()
      .from(participantsTable)
      .where(and(
        eq(participantsTable.conversationId, conversation.id),
        eq(participantsTable.userId, "partner-1"),
      ));

    expect(updatedConversation.partnerUserId).toBe("partner-1");
    expect(participant.role).toBe("principal");
    expect(participant.status).toBe("active");
  });

  it("creates the owner and neutral seat through the shared writer", async () => {
    const conversation = await db.transaction((tx) =>
      createConversationWithParticipants(tx, {
        id: crypto.randomUUID(),
        partnerName: "Partner",
      }, "owner-1"));

    const principals = await getPrincipalParticipants(conversation.id);
    const seats = await db
      .select()
      .from(participantsTable)
      .where(eq(participantsTable.conversationId, conversation.id));

    expect(principals.map((participant) => participant.userId)).toEqual(["owner-1"]);
    expect(seats).toHaveLength(2);
    expect(seats).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: BRIDGET_PARTICIPANT_ID, role: "neutral" }),
    ]));
  });

  it("refuses a third principal", async () => {
    const conversation = await createConversation();
    await db.transaction(async (tx) => {
      await writeParticipant(tx, {
        conversationId: conversation.id,
        userId: "partner-1",
        role: "principal",
      });
    });

    await expect(db.transaction((tx) => writeParticipant(tx, {
      conversationId: conversation.id,
      userId: "third-user",
      role: "principal",
    }))).rejects.toBeInstanceOf(ParticipantLimitError);
  });
});