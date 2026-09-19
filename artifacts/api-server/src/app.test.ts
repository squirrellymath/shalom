import request from "supertest";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const anthropicCreate = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", async () => import("./test-db"));
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create: anthropicCreate } },
}));
vi.mock("connect-pg-simple", async () => {
  const session = await import("express-session");
  const sessions = new Map<string, unknown>();
  class TestStore extends session.Store {
    get(sid: string, callback: (err: any, session?: any) => void) {
      callback(null, sessions.get(sid));
    }
    set(sid: string, value: unknown, callback: (err?: any) => void) {
      sessions.set(sid, value);
      callback();
    }
    destroy(sid: string, callback: (err?: any) => void) {
      sessions.delete(sid);
      callback();
    }
  }
  return { default: () => TestStore };
});

process.env.DATABASE_URL = "postgres://test";
process.env.SESSION_SECRET = "test-session-secret";
process.env.NODE_ENV = "test";

const { default: app } = await import("./app");
const { db, pool, conversationsTable, invitesTable, messagesTable, usedSsoTokensTable } =
  await import("./test-db");

const validSsoResponse = {
  valid: true,
  user_id: "owner-1",
  email: "justin.malkin@outlook.com",
  role: "member",
};

function mockSso(response: unknown = validSsoResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

async function signedIn(response = validSsoResponse) {
  mockSso(response);
  const agent = request.agent(app);
  await agent.get(`/auth/sso/callback?token=${crypto.randomUUID()}`).expect(302);
  return agent;
}

beforeEach(async () => {
  await pool.query("DELETE FROM used_sso_tokens");
  await pool.query("DELETE FROM invites");
  await pool.query("DELETE FROM messages");
  await pool.query("DELETE FROM conversations");
  anthropicCreate.mockReset();
  vi.unstubAllGlobals();
});

describe("SSO callback", () => {
  it("retains the GET Bridget callback contract when /validate is not an auth rejection", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(validSsoResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await request(app).get("/auth/sso/callback?token=contract-token").expect(302);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://bridget.fyi/auth/sso/verify?token=contract-token",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects malformed response fields and false valid flags", async () => {
    mockSso({ valid: false, user_id: "owner-1", email: "owner@example.com", role: "member" });
    await request(app)
      .get("/auth/sso/callback?token=bad-response")
      .expect(302)
      .expect("Location", "/?auth_error=verify_failed");
  });

  it("rejects a replayed token before creating a second session", async () => {
    mockSso();
    await request(app)
      .get("/auth/sso/callback?token=replay-token")
      .expect(302)
      .expect("Location", "/");
    await request(app)
      .get("/auth/sso/callback?token=replay-token")
      .expect(302)
      .expect("Location", "/?auth_error=token_reused");
  });
});

describe("access gate and conversation creation", () => {
  it("blocks unallowlisted users and allows conversation participants", async () => {
    const agent = await signedIn({
      ...validSsoResponse,
      user_id: "unlisted-user",
      email: "unlisted@example.com",
    });
    await agent.get("/member/status").expect(200).expect((res) => {
      expect(res.body.canAccess).toBe(false);
    });
    await agent
      .post("/conversations")
      .send({ partnerName: "Partner", clientRequestId: crypto.randomUUID() })
      .expect(403);

    await db.insert(conversationsTable).values({
      ownerUserId: "unlisted-user",
      partnerName: "Existing partner",
    });
    await agent.get("/member/status").expect(200).expect((res) => {
      expect(res.body.canAccess).toBe(true);
    });
  });

  it("creates the intro message atomically and returns the existing row idempotently", async () => {
    const agent = await signedIn();
    const clientRequestId = crypto.randomUUID();
    const body = { partnerName: "Partner", mode: "witness", clientRequestId };
    const first = await agent.post("/conversations").send(body).expect(201);
    const second = await agent.post("/conversations").send(body).expect(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.messages).toHaveLength(1);
    await agent.get(`/conversations/${first.body.id}/messages/verify`).expect(200).expect((res) => {
      expect(res.body.valid).toBe(true);
    });
    const rows = await db.select().from(messagesTable);
    expect(rows).toHaveLength(1);
  });
});

describe("invites", () => {
  it("allows only the conversation owner to mint an invite", async () => {
    const owner = await signedIn();
    const convo = await owner.post("/conversations").send({ partnerName: "Partner" }).expect(201);
    const partner = await signedIn({
      ...validSsoResponse,
      user_id: "partner-user",
      email: "partner@example.com",
    });

    await partner.post(`/conversations/${convo.body.id}/invite`).expect(404);
    await owner.post(`/conversations/${convo.body.id}/invite`).expect(201);
  });

  it("expires older pending invites when creating a replacement", async () => {
    const agent = await signedIn();
    const convo = await agent.post("/conversations").send({ partnerName: "Partner" }).expect(201);
    await agent.post(`/conversations/${convo.body.id}/invite`).expect(201);
    await agent.post(`/conversations/${convo.body.id}/invite`).expect(201);
    const invites = await db.select().from(invitesTable);
    expect(invites.filter((invite) => invite.status === "pending")).toHaveLength(1);
    expect(invites.filter((invite) => invite.status === "expired")).toHaveLength(1);
  });

  it("rejects a mismatched invited email without consuming the invite", async () => {
    const owner = await signedIn();
    const convo = await owner.post("/conversations").send({ partnerName: "Partner", partnerEmail: "partner@example.com" }).expect(201);
    const invite = await owner.post(`/conversations/${convo.body.id}/invite`).expect(201);
    const token = invite.body.inviteUrl.split("/").pop();
    const partner = await signedIn({
      ...validSsoResponse,
      user_id: "wrong-user",
      email: "wrong@example.com",
    });
    await partner.get(`/invite/${token}`).expect(302);
    await partner.get("/auth/sso/callback?token=wrong-account-token")
      .expect(302)
      .expect("Location", "/?invite_error=wrong_account");
    const [row] = await db.select().from(invitesTable);
    expect(row.status).toBe("pending");
  });

  it("expires an expired invite but preserves legacy null-expiry invites", async () => {
    const owner = await signedIn();
    const convo = await owner.post("/conversations").send({ partnerName: "Partner" }).expect(201);
    const expiredToken = "expired-invite-token";
    const legacyToken = "legacy-invite-token";
    await db.insert(invitesTable).values([
      {
        id: crypto.randomUUID(),
        token: expiredToken,
        conversationId: convo.body.id,
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
      },
      {
        id: crypto.randomUUID(),
        token: legacyToken,
        conversationId: convo.body.id,
        status: "pending",
        expiresAt: null,
      },
    ]);

    await request(app)
      .get(`/invite/${expiredToken}`)
      .expect(302)
      .expect("Location", "/?invite_error=expired");
    await request(app).get(`/invite/${legacyToken}`).expect(302);

    const [expired] = await db.select().from(invitesTable).where(eq(invitesTable.token, expiredToken));
    expect(expired.status).toBe("expired");
  });
});

describe("mediation and participant routes", () => {
  it("keeps the user message and reports mediation failure", async () => {
    anthropicCreate.mockRejectedValue(new Error("provider unavailable"));
    const agent = await signedIn();
    const convo = await agent.post("/conversations").send({ partnerName: "Partner", mode: "mediated" }).expect(201);
    const response = await agent.post(`/conversations/${convo.body.id}/messages`).send({ text: "Hello" }).expect(201);
    expect(response.body.message.text).toBe("Hello");
    expect(response.body.mediationFailed).toBe(true);
    const messages = await agent.get(`/conversations/${convo.body.id}/messages`).expect(200);
    expect(messages.body.some((message: { text: string }) => message.text === "Hello")).toBe(true);
  });

  it("keeps conversation-scoped participant checks on message routes", async () => {
    const owner = await signedIn();
    const convo = await owner.post("/conversations").send({ partnerName: "Partner" }).expect(201);
    const other = await signedIn({
      ...validSsoResponse,
      user_id: "other-user",
      email: "other@example.com",
    });
    await other.get(`/conversations/${convo.body.id}/messages`).expect(404);
    await other.patch(`/conversations/${convo.body.id}`).send({ topic: "nope" }).expect(404);
  });
});