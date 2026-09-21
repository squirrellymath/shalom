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

it("prints the current 401 redirect", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Invalid or missing SSO shared secret." }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

  const response = await request(app).get("/auth/sso/callback?token=repro-401");
  console.log(`current redirect: ${response.headers.location}`);
  expect(response.status).toBe(302);
});