import crypto from "node:crypto";
import { newDb } from "pg-mem";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../../lib/db/src/schema";

const memory = newDb({ autoCreateForeignKeyIndices: true });
memory.public.registerFunction({
  name: "gen_random_uuid",
  returns: "uuid" as any,
  implementation: () => crypto.randomUUID(),
});

const pg = memory.adapters.createPg();
class TestPool extends pg.Pool {
  adaptResults(query: any, result: any): any {
    const fieldNames = result.fields?.map((field: { name: string }) => field.name) ?? [];
    const adapted = super.adaptResults({ ...query, rowMode: undefined }, result);
    if (query?.rowMode === "array") {
      adapted.rows = adapted.rows.map((row: Record<string, unknown>) =>
        fieldNames.map((fieldName: string) => row[fieldName]),
      );
    }
    return adapted;
  }

  query(query: any, valuesOrCallback?: any, callback?: any): any {
    if (query && typeof query === "object" && query.types) {
      query = { ...query, types: undefined };
    }
    return super.query(query, valuesOrCallback, callback);
  }
}

export const pool = new TestPool();
export const db = drizzle(pool as any, { schema });
export * from "../../../lib/db/src/schema";

await pool.query(`
  CREATE TABLE conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id text NOT NULL,
    partner_user_id text,
    partner_name text NOT NULL,
    partner_email text,
    topic text,
    mode text NOT NULL DEFAULT 'witness',
    client_request_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX conversations_owner_client_request_uniq
    ON conversations(owner_user_id, client_request_id);
  CREATE TABLE messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    seq bigint NOT NULL,
    sender text NOT NULL,
    text text NOT NULL,
    prev_hash text NOT NULL,
    hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(conversation_id, seq)
  );
  CREATE TABLE invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE,
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    invited_email text,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    expires_at timestamptz
  );
  CREATE TABLE used_sso_tokens (
    token_hash text PRIMARY KEY,
    used_at timestamptz NOT NULL DEFAULT now()
  );
`);