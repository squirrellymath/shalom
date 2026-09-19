ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "client_request_id" uuid;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "partner_user_id" text;

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
  "seq" bigint NOT NULL,
  "sender" text NOT NULL,
  "text" text NOT NULL,
  "prev_hash" text NOT NULL,
  "hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "messages_conversation_seq_uniq" UNIQUE("conversation_id", "seq")
);

CREATE TABLE IF NOT EXISTS "invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL UNIQUE,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
  "invited_email" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "accepted_at" timestamp with time zone,
  "expires_at" timestamp with time zone
);
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "used_sso_tokens" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "used_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_mode_check'
  ) THEN
    ALTER TABLE "conversations"
      ADD CONSTRAINT "conversations_mode_check"
      CHECK ("mode" IN ('witness', 'mediated'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invites_status_check'
  ) THEN
    ALTER TABLE "invites"
      ADD CONSTRAINT "invites_status_check"
      CHECK ("status" IN ('pending', 'accepted', 'expired'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_owner_client_request_uniq"
  ON "conversations" ("owner_user_id", "client_request_id");
CREATE INDEX IF NOT EXISTS "conversations_owner_user_id_idx"
  ON "conversations" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "conversations_partner_user_id_idx"
  ON "conversations" ("partner_user_id");
CREATE INDEX IF NOT EXISTS "conversations_updated_at_idx"
  ON "conversations" ("updated_at");
CREATE INDEX IF NOT EXISTS "invites_conversation_id_idx"
  ON "invites" ("conversation_id");
CREATE INDEX IF NOT EXISTS "used_sso_tokens_used_at_idx"
  ON "used_sso_tokens" ("used_at");