BEGIN;

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
DECLARE
  violating_count bigint;
BEGIN
  SELECT count(*) INTO violating_count
  FROM "conversations"
  WHERE "mode" IS NULL OR "mode" NOT IN ('witness', 'mediated');
  IF violating_count > 0 THEN
    RAISE EXCEPTION 'conversations_mode_check guard found % violating rows', violating_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_mode_check'
  ) THEN
    ALTER TABLE "conversations"
      ADD CONSTRAINT "conversations_mode_check"
      CHECK ("mode" IN ('witness', 'mediated'));
  END IF;
END $$;

DO $$
DECLARE
  violating_count bigint;
BEGIN
  SELECT count(*) INTO violating_count
  FROM "invites"
  WHERE "status" IS NULL OR "status" NOT IN ('pending', 'accepted', 'expired');
  IF violating_count > 0 THEN
    RAISE EXCEPTION 'invites_status_check guard found % violating rows', violating_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invites_status_check'
  ) THEN
    ALTER TABLE "invites"
      ADD CONSTRAINT "invites_status_check"
      CHECK ("status" IN ('pending', 'accepted', 'expired'));
  END IF;
END $$;

DO $$
DECLARE
  violating_count bigint;
BEGIN
  SELECT count(*) INTO violating_count
  FROM (
    SELECT "owner_user_id", "client_request_id"
    FROM "conversations"
    WHERE "client_request_id" IS NOT NULL
    GROUP BY "owner_user_id", "client_request_id"
    HAVING count(*) > 1
  ) duplicates;
  IF violating_count > 0 THEN
    RAISE EXCEPTION 'conversations_owner_client_request_uniq guard found % violating groups', violating_count;
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

CREATE TABLE IF NOT EXISTS "participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'principal' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "participants_role_check" CHECK ("role" IN ('principal', 'neutral')),
  CONSTRAINT "participants_status_check" CHECK ("status" IN ('active', 'removed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "participants_conversation_user_uniq"
  ON "participants" ("conversation_id", "user_id");
CREATE INDEX IF NOT EXISTS "participants_user_id_idx"
  ON "participants" ("user_id");

INSERT INTO "participants" ("conversation_id", "user_id", "role", "status", "joined_at")
SELECT "id", "owner_user_id", 'principal', 'active', "created_at"
FROM "conversations"
WHERE "owner_user_id" IS NOT NULL
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;

INSERT INTO "participants" ("conversation_id", "user_id", "role", "status", "joined_at")
SELECT "id", "partner_user_id", 'principal', 'active', "created_at" + interval '1 millisecond'
FROM "conversations"
WHERE "partner_user_id" IS NOT NULL
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;

INSERT INTO "participants" ("conversation_id", "user_id", "role", "status", "joined_at")
SELECT "id", 'bridget', 'neutral', 'active', "created_at"
FROM "conversations"
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;

COMMIT;