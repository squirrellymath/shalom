import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, conversationsTable, participantsTable, type InsertConversation } from "@workspace/db";

export const BRIDGET_PARTICIPANT_ID = "bridget";
export const ACTIVE_PARTICIPANT_STATUS = "active";

type TransactionHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ParticipantWriter = typeof db | TransactionHandle;
type ParticipantDatabase = typeof db | TransactionHandle;

export type ParticipantRole = "principal" | "neutral";

export class ParticipantLimitError extends Error {
  constructor() {
    super("A conversation can have at most two principal participants.");
    this.name = "ParticipantLimitError";
  }
}

export async function hasActiveParticipant(
  conversationId: string,
  userId: string,
  database: ParticipantDatabase = db,
): Promise<boolean> {
  const [participant] = await database
    .select({ id: participantsTable.id })
    .from(participantsTable)
    .where(and(
      eq(participantsTable.conversationId, conversationId),
      eq(participantsTable.userId, userId),
      eq(participantsTable.status, ACTIVE_PARTICIPANT_STATUS),
    ))
    .limit(1);
  return Boolean(participant);
}

export async function getActiveConversationIds(
  userId: string,
  database: ParticipantDatabase = db,
): Promise<string[]> {
  const rows = await database
    .select({ conversationId: participantsTable.conversationId })
    .from(participantsTable)
    .where(and(
      eq(participantsTable.userId, userId),
      eq(participantsTable.status, ACTIVE_PARTICIPANT_STATUS),
    ));
  return rows.map((row) => row.conversationId);
}

export async function writeParticipant(
  writer: ParticipantWriter,
  input: {
    conversationId: string;
    userId: string;
    role: ParticipantRole;
    joinedAt?: Date;
  },
) {
  const [conversation] = await writer
    .select({
      id: conversationsTable.id,
      ownerUserId: conversationsTable.ownerUserId,
      partnerUserId: conversationsTable.partnerUserId,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, input.conversationId))
    .for("update");

  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const [existing] = await writer
    .select()
    .from(participantsTable)
    .where(and(
      eq(participantsTable.conversationId, input.conversationId),
      eq(participantsTable.userId, input.userId),
    ))
    .limit(1);

  if (existing?.status === ACTIVE_PARTICIPANT_STATUS) {
    return existing;
  }

  if (input.role === "principal") {
    const principals = await writer
      .select({ userId: participantsTable.userId })
      .from(participantsTable)
      .where(and(
        eq(participantsTable.conversationId, input.conversationId),
        eq(participantsTable.role, "principal"),
        eq(participantsTable.status, ACTIVE_PARTICIPANT_STATUS),
      ));

    if (!existing && principals.length >= 2) {
      throw new ParticipantLimitError();
    }
    if (
      !existing &&
      conversation.ownerUserId !== input.userId &&
      conversation.partnerUserId &&
      conversation.partnerUserId !== input.userId
    ) {
      throw new ParticipantLimitError();
    }
  }

  const [participant] = existing
    ? await writer
        .update(participantsTable)
        .set({ role: input.role, status: ACTIVE_PARTICIPANT_STATUS, joinedAt: input.joinedAt ?? new Date() })
        .where(eq(participantsTable.id, existing.id))
        .returning()
    : await writer
        .insert(participantsTable)
        .values({
          id: randomUUID(),
          conversationId: input.conversationId,
          userId: input.userId,
          role: input.role,
          status: ACTIVE_PARTICIPANT_STATUS,
          joinedAt: input.joinedAt,
        })
        .returning();

  if (input.role === "principal" && conversation.ownerUserId !== input.userId) {
    if (!conversation.partnerUserId) {
      await writer
        .update(conversationsTable)
        .set({ partnerUserId: input.userId })
        .where(eq(conversationsTable.id, input.conversationId));
    } else if (conversation.partnerUserId !== input.userId) {
      throw new ParticipantLimitError();
    }
  }

  return participant;
}

export async function createConversationWithParticipants(
  writer: TransactionHandle,
  values: Omit<InsertConversation, "ownerUserId"> & { id?: string },
  ownerUserId: string,
) {
  const [conversation] = await writer
    .insert(conversationsTable)
    .values({ ...values, ownerUserId })
    .returning();

  const conversationId = conversation.id;
  if (!conversationId) {
    throw new Error("Conversation creation did not return an id.");
  }

  await writeParticipant(writer, {
    conversationId,
    userId: ownerUserId,
    role: "principal",
    joinedAt: conversation.createdAt,
  });
  await writeParticipant(writer, {
    conversationId,
    userId: BRIDGET_PARTICIPANT_ID,
    role: "neutral",
    joinedAt: conversation.createdAt,
  });

  return conversation;
}

export async function getPrincipalParticipants(
  conversationId: string,
  database: ParticipantDatabase = db,
) {
  return database
    .select()
    .from(participantsTable)
    .where(and(
      eq(participantsTable.conversationId, conversationId),
      eq(participantsTable.role, "principal"),
      eq(participantsTable.status, ACTIVE_PARTICIPANT_STATUS),
    ))
    .orderBy(participantsTable.joinedAt, participantsTable.id);
}