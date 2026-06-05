import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { z } from "zod";

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

  res.status(201).json(message);
});

export default router;
