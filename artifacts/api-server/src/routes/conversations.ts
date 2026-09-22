import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, conversationsTable, messagesTable, invitesTable } from "@workspace/db";
import crypto from "node:crypto";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { insertMessage, verifyChain } from "../lib/message-chain";
import { decryptText } from "../lib/crypto";
import { canAccess, isGuestUser } from "../lib/access";
import {
  createConversationWithParticipants,
  getActiveConversationIds,
  hasActiveParticipant,
} from "../lib/participants";

const router: IRouter = Router();

const CreateConversationBody = z.object({
  partnerName: z.string().min(1),
  partnerEmail: z.string().optional(),
  topic: z.string().optional(),
  mode: z.enum(["witness", "mediated"]).default("witness"),
  clientRequestId: z.string().uuid().optional(),
});

const CreateMessageBody = z.object({
  text: z.string().min(1),
});

function requireAuth(req: any, res: any): string | null {
  const user = req.session?.user;
  const userId = user?.user_id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (isGuestUser(user)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return userId;
}

function validateUuidParam(req: Request, res: Response, next: NextFunction): void {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!z.string().uuid().safeParse(id).success) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}

router.get("/conversations", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const conversationIds = await getActiveConversationIds(userId);
  if (conversationIds.length === 0) {
    res.json([]);
    return;
  }

  const rows = await db
    .select()
    .from(conversationsTable)
    .where(inArray(conversationsTable.id, conversationIds))
    .orderBy(conversationsTable.updatedAt);

  res.json(rows.reverse());
});

router.post("/conversations", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const access = await canAccess(userId, req.session.user!.email, db, req.session.user!.role);
  if (!access) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { partnerName, partnerEmail, topic, mode, clientRequestId } = parsed.data;

  const result = await db.transaction(async (tx) => {
    if (clientRequestId) {
      const candidates = await tx
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.clientRequestId, clientRequestId));
      let existing = undefined;
      for (const candidate of candidates) {
        if (await hasActiveParticipant(candidate.id, userId, tx)) {
          existing = candidate;
          break;
        }
      }
      if (existing) {
        const messages = await tx
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, existing.id))
          .orderBy(messagesTable.seq);
        return { convo: existing, messages, existing: true };
      }
    }

    const convo = await createConversationWithParticipants(tx, {
        partnerName,
        partnerEmail,
        topic,
        mode,
        clientRequestId,
        id: crypto.randomUUID(),
      }, userId);

    const introText = `I'm Bridget. I'll stay with you and ${partnerName} here. Everything said is timestamped and kept — a record that belongs to both of you.`;
    const introMsg = await insertMessage(convo.id!, "bridget", introText, tx);
    return {
      convo: { ...convo, id: convo.id! },
      messages: [introMsg],
      existing: false,
    };
  });

  res.status(result.existing ? 200 : 201).json({ ...result.convo, messages: result.messages });
});

const UpdateTopicBody = z.object({
  topic: z.string().trim().max(200),
});

router.patch("/conversations/:id", validateUuidParam, async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const parsed = UpdateTopicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const topic = parsed.data.topic.length > 0 ? parsed.data.topic : null;

  const [convo] = await db
    .update(conversationsTable)
    .set({ topic })
    .where(eq(conversationsTable.id, id))
    .returning();

  if (!convo || !(await hasActiveParticipant(id, userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(convo);
});

router.get("/conversations/:id/messages", validateUuidParam, async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!(await hasActiveParticipant(id, userId))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, id));

  if (!convo) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id))
    .orderBy(messagesTable.seq);

  res.json(messages.map((m) => ({ ...m, text: decryptText(m.text) })));
});

router.get("/conversations/:id/messages/verify", validateUuidParam, async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!(await hasActiveParticipant(id, userId))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, id));

  if (!convo) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const result = await verifyChain(id);
  res.json(result);
});

router.post("/conversations/:id/messages", validateUuidParam, async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!(await hasActiveParticipant(id, userId))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, id));

  if (!convo) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const parsed = CreateMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sender = req.session.user!.email;
  const message = await insertMessage(id, sender, parsed.data.text);

  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, id));

  let bridgetMessage = undefined;
  let mediationFailed = false;

  if (convo.mode === "mediated") {
    try {
      const recent = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, id))
        .orderBy(messagesTable.seq);

      const transcript = recent
        .slice(-15)
        .map((m) => `${m.sender === "bridget" ? "Bridget" : m.sender}: ${decryptText(m.text)}`)
        .join("\n");

      const aiRes = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system:
          'You are Bridget, a calm, fair mediator facilitating a witnessed conversation between two people. The record is permanent and belongs to both. Do NOT respond to every message — stay silent unless your voice genuinely helps: when addressed, when things escalate, when someone is stuck, or to mark real progress. When you speak: brief (1-3 sentences), even-handed, never take sides. Respond ONLY with JSON, no markdown: {"speak": boolean, "text": string}. If speak is false, text is "".',
        messages: [
          {
            role: "user",
            content: `Here is the conversation transcript so far:\n\n${transcript}\n\nShould you speak now?`,
          },
        ],
      });

      const block = aiRes.content[0];
      if (block.type === "text") {
        const aiParsed = JSON.parse(block.text) as { speak: boolean; text: string };
        if (aiParsed.speak && aiParsed.text.trim()) {
          bridgetMessage = await insertMessage(id, "bridget", aiParsed.text.trim());
        }
      }
    } catch (err: any) {
      mediationFailed = true;
      req.log.error(
        {
          errorClass: err?.constructor?.name ?? "UnknownError",
          message: err?.message ?? String(err),
          conversationId: id,
        },
        "Mediation failed",
      );
    }
  }

  res.status(201).json({ message, bridgetMessage, mediationFailed });
});

router.post("/conversations/:id/invite", validateUuidParam, async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!(await hasActiveParticipant(id, userId))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, id));

  if (!convo) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(invitesTable)
      .set({ status: "expired" })
      .where(
        and(
          eq(invitesTable.conversationId, id),
          eq(invitesTable.status, "pending"),
        ),
      );
    await tx.insert(invitesTable).values({
      id: crypto.randomUUID(),
      token,
      conversationId: id,
      invitedEmail: convo.partnerEmail ?? undefined,
      status: "pending",
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
  });

  res.status(201).json({ inviteUrl: `https://shalom.fyi/invite/${token}` });
});

export default router;
