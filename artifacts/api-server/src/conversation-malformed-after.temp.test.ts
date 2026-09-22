import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const testSessions = vi.hoisted(() => new Map<string, any>());

vi.mock("@workspace/db", async () => import("./test-db"));
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
const { pool } = await import("./test-db");

beforeEach(async () => {
  testSessions.clear();
  await pool.query("DELETE FROM used_sso_tokens");
  vi.unstubAllGlobals();
});

it("prints the fixed malformed conversation verify response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        user_id: "owner-after-repro",
        email: "owner@example.com",
        role: "member",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

  const agent = request.agent(app);
  await agent.get("/auth/sso/callback?token=malformed-conversation-after").expect(302);
  const response = await agent.get("/conversations/not-a-uuid/messages/verify");
  console.log(`fixed malformed conversation verify: ${response.status} ${JSON.stringify(response.body)}`);
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: "Not found" });
});