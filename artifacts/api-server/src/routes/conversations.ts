import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const CreateConversationBody = z.object({
  partnerName: z.string().min(1),
  partnerEmail: z.string().optional(),
  topic: z.string().optional(),
  mode: z.enum(["witness", "mediated"]).default("witness"),
});

const CreateMessageBody = z.object({
  text: z.string().min(1),
});

function requireAuth(req: any, res: any): string | null {
  const userId = req.session?.user?.user_id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

router.get("/conversations", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rows = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.ownerUserId, userId))
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

  const { partnerName, partnerEmail, topic, mode } = parsed.data;

  const [convo] = await db
    .insert(conversationsTable)
    .values({ ownerUserId: userId, partnerName, partnerEmail, topic, mode })
    .returning();

  const introText = `I'm Bridget. I'll stay with you and ${partnerName} here. Everything said is timestamped and kept — a record that belongs to both of you.`;
  const [introMsg] = await db
    .insert(messagesTable)
    .values({ conversationId: convo.id, sender: "bridget", text: introText })
    .returning();

  res.status(201).json({ ...convo, messages: [introMsg] });
});

router.get("/conversations/:id/messages", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, id), eq(conversationsTable.ownerUserId, userId)));

  if (!convo) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id))
    .orderBy(messagesTable.createdAt);

  res.json(messages);
});

router.post("/conversations/:id/messages", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, id), eq(conversationsTable.ownerUserId, userId)));

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
  const [message] = await db
    .insert(messagesTable)
    .values({ conversationId: id, sender, text: parsed.data.text })
    .returning();

  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, id));

  let bridgetMessage = undefined;

  if (convo.mode === "mediated") {
    try {
      const recent = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, id))
        .orderBy(desc(messagesTable.createdAt))
        .limit(15);

      const transcript = recent
        .reverse()
        .map((m) => `${m.sender === "bridget" ? "Bridget" : m.sender}: ${m.text}`)
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
        const parsed = JSON.parse(block.text) as { speak: boolean; text: string };
        if (parsed.speak && parsed.text.trim()) {
          const [bMsg] = await db
            .insert(messagesTable)
            .values({ conversationId: id, sender: "bridget", text: parsed.text.trim() })
            .returning();
          bridgetMessage = bMsg;
        }
      }
    } catch {
      // Bridget failure never blocks the user's message
    }
  }

  res.status(201).json({ message, bridgetMessage });
});

export default router;
