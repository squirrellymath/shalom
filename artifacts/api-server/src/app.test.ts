import request from "supertest";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGuestCondition } from "./lib/access";

const anthropicCreate = vi.hoisted(() => vi.fn());
const testSessions = vi.hoisted(() => new Map<string, any>());

vi.mock("@workspace/db", async () => import("./test-db"));
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create: anthropicCreate } },
}));
vi.mock("connect-pg-simple", async () => {
  const session = await import("express-session");
  class TestStore extends session.Store {
    get(sid: string, callback: (err: any, session?: any) => void) {
      callback(null, testSessions.get(sid));
    }
    set(sid: string, value: unknown, callback: (err?: any) => void) {
      testSessions.set(sid, value);
      callback();
    }
    destroy(sid: string, callback: (err?: any) => void) {
      testSessions.delete(sid);
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

function mockSsoError(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(body), {
          status,
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
  testSessions.clear();
  await pool.query("DELETE FROM used_sso_tokens");
  await pool.query("DELETE FROM invites");
  await pool.query("DELETE FROM messages");
  await pool.query("DELETE FROM conversations");
  anthropicCreate.mockReset();
  vi.unstubAllGlobals();
});

describe("SSO callback", () => {
  it("classifies guest identities without exposing their email", () => {
    expect(getGuestCondition({ email: "", role: "guest", is_guest: true }))
      .toBe("is_guest");
    expect(getGuestCondition({ email: "", role: "guest" }))
      .toBe("role_guest");
    expect(getGuestCondition({ email: "__guest__x", role: "free" }))
      .toBe("email_prefix");
    expect(getGuestCondition({ email: "User@Example.COM", role: "member" }))
      .toBe("none");
  });

  it("retains the exact production GET Bridget callback request", async () => {
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
      "https://bridget.fyi/auth/sso/verify?token=contract-token",
      {
        method: "GET",
        headers: { Origin: "https://shalom.fyi" },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("logs in when valid is absent and required fields are present", async () => {
    const agent = request.agent(app);
    mockSso({ user_id: "owner-1", email: "owner@example.com", role: "member" });
    await agent
      .get("/auth/sso/callback?token=no-valid-field")
      .expect(302)
      .expect("Location", "/");
    await agent.get("/member/status").expect(200).expect((res) => {
      expect(res.body.authenticated).toBe(true);
    });
  });

  it("logs in when valid is true and required fields are present", async () => {
    const agent = request.agent(app);
    mockSso({ valid: true, user_id: "owner-1", email: "owner@example.com", role: "member" });
    await agent
      .get("/auth/sso/callback?token=valid-true")
      .expect(302)
      .expect("Location", "/");
    await agent.get("/member/status").expect(200).expect((res) => {
      expect(res.body.authenticated).toBe(true);
    });
  });

  it("rejects a Bridget guest without creating a session", async () => {
    const agent = request.agent(app);
    mockSso({ user_id: "guest-1", email: "", role: "guest", is_guest: true });
    await agent
      .get("/auth/sso/callback?token=guest-no-invite")
      .expect(302)
      .expect(
        "Location",
        "https://bridget.fyi/auth/sso/logout?next=https%3A%2F%2Fshalom.fyi%2F%3Fauth_error%3Dguest_not_supported%26reason%3Dis_guest",
      );
    await agent.get("/member/status").expect(200).expect((res) => {
      expect(res.body).toEqual({ authenticated: false, canAccess: false });
    });
    expect(await db.select().from(usedSsoTokensTable)).toHaveLength(1);

    mockSso({ user_id: "real-1", email: "real@example.com", role: "member" });
    await agent
      .get("/auth/sso/callback?token=real-after-guest")
      .expect(302)
      .expect("Location", "/");
    await agent.get("/member/status").expect(200).expect((res) => {
      expect(res.body.authenticated).toBe(true);
    });
  });

  it("rejects a Bridget guest with a pending invite without consuming it", async () => {
    const owner = await signedIn();
    const convo = await owner.post("/conversations").send({ partnerName: "Partner" }).expect(201);
    const invite = await owner.post(`/conversations/${convo.body.id}/invite`).expect(201);
    const token = invite.body.inviteUrl.split("/").pop();
    const guest = request.agent(app);

    await guest.get(`/invite/${token}`).expect(302);
    mockSso({ user_id: "guest-2", email: "", role: "guest", is_guest: true });
    await guest
      .get("/auth/sso/callback?token=guest-pending-invite")
      .expect(302)
      .expect(
        "Location",
        "https://bridget.fyi/auth/sso/logout?next=https%3A%2F%2Fshalom.fyi%2F%3Fauth_error%3Dguest_not_supported%26reason%3Dis_guest",
      );

    const [inviteRow] = await db.select().from(invitesTable);
    const [conversationRow] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, convo.body.id));
    expect(inviteRow.status).toBe("pending");
    expect(conversationRow.partnerUserId).toBeNull();

    mockSso({ user_id: "real-2", email: "real@example.com", role: "member" });
    await guest
      .get("/auth/sso/callback?token=real-after-invite-guest")
      .expect(302)
      .expect("Location", `/?joined=${convo.body.id}`);
    const [acceptedInvite] = await db.select().from(invitesTable);
    const [joinedConversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, convo.body.id));
    expect(acceptedInvite.status).toBe("accepted");
    expect(joinedConversation.partnerUserId).toBe("real-2");
  });

  it("rejects role guest even without is_guest", async () => {
    mockSso({ user_id: "guest-3", email: "", role: "guest" });
    await request(app)
      .get("/auth/sso/callback?token=role-guest")
      .expect(302)
      .expect(
        "Location",
        "https://bridget.fyi/auth/sso/logout?next=https%3A%2F%2Fshalom.fyi%2F%3Fauth_error%3Dguest_not_supported%26reason%3Drole_guest",
      );
  });

  it("rejects legacy __guest__ email even without is_guest", async () => {
    mockSso({ user_id: "guest-4", email: "__guest__x", role: "free" });
    await request(app)
      .get("/auth/sso/callback?token=legacy-guest")
      .expect(302)
      .expect(
        "Location",
        "https://bridget.fyi/auth/sso/logout?next=https%3A%2F%2Fshalom.fyi%2F%3Fauth_error%3Dguest_not_supported%26reason%3Demail_prefix",
      );
  });

  it("blocks an existing guest session at the access check", async () => {
    const agent = await signedIn();
    for (const session of testSessions.values()) {
      session.user.email = "__guest__existing";
      session.user.role = "free";
    }
    await agent.get("/member/status").expect(200).expect((res) => {
      expect(res.body.authenticated).toBe(true);
      expect(res.body.canAccess).toBe(false);
    });
    await agent
      .post("/conversations")
      .send({ partnerName: "Blocked partner" })
      .expect(403)
      .expect({ error: "Forbidden" });
  });

  it("rejects valid false", async () => {
    mockSso({ valid: false, user_id: "owner-1", email: "owner@example.com", role: "member" });
    await request(app)
      .get("/auth/sso/callback?token=bad-response")
      .expect(302)
      .expect("Location", "/?auth_error=verify_failed&reason=bridget_200");
  });

  it("reports Bridget 401 status and the verification detail", async () => {
    mockSsoError(401, { detail: "Invalid or missing SSO shared secret." });
    await request(app)
      .get("/auth/sso/callback?token=bridget-error")
      .expect(302)
      .expect(
        "Location",
        "/?auth_error=verify_failed&reason=bridget_401&detail=Invalid+or+missing+SSO+shared+secret.",
      );
  });

  it("reports Bridget 500 status without a detail when the response has no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 500 }),
      ),
    );
    await request(app)
      .get("/auth/sso/callback?token=bridget-server-error")
      .expect(302)
      .expect("Location", "/?auth_error=verify_failed&reason=bridget_500");
  });

  it("rejects a missing email", async () => {
    mockSso({ valid: true, user_id: "owner-1", role: "member" });
    await request(app)
      .get("/auth/sso/callback?token=missing-email")
      .expect(302)
      .expect("Location", "/?auth_error=verify_failed&reason=missing_or_empty_email");
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
      .expect("Location", "/?auth_error=token_reused&reason=token_reused");
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