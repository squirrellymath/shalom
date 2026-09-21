import { Router, type Request, type Response as ExpressResponse } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  db,
  invitesTable,
  conversationsTable,
  usedSsoTokensTable,
} from "@workspace/db";
import { getGuestCondition } from "../lib/access";

const router = Router();

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at >= 0 && at < email.length - 1 ? email.slice(at + 1).toLowerCase() : null;
}

function truncateDetail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const detail = value.trim();
  return detail ? detail.slice(0, 80) : undefined;
}

async function readBridgetErrorDetail(response: globalThis.Response): Promise<string | undefined> {
  try {
    const body = await response.json() as unknown as Record<string, unknown>;
    return truncateDetail(body.detail);
  } catch {
    return undefined;
  }
}

function errorPath(
  authError: string,
  reason: string,
  detail?: string,
): string {
  const params = new URLSearchParams({ auth_error: authError, reason });
  if (detail) params.set("detail", detail);
  return `/?${params.toString()}`;
}

function saveSession(req: Request, res: ExpressResponse, onSuccess: () => void) {
  req.session.save((err) => {
    if (err) {
      req.log.error({ err }, "Session save failed");
      res.redirect(errorPath("session_save_failed", "session_save_failed"));
      return;
    }
    onSuccess();
  });
}

router.get("/auth/sso/callback", async (req, res) => {
  const token = typeof req.query.sso_token === "string" ? req.query.sso_token :
    typeof req.query.token === "string" ? req.query.token : null;
  if (!token) return res.redirect(errorPath("missing_token", "missing_token"));
  try {
    const verifyUrl =
      `https://bridget.fyi/auth/sso/verify?token=${encodeURIComponent(token)}`;
    const response = await fetch(verifyUrl, {
      method: "GET",
      headers: { Origin: "https://shalom.fyi" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await readBridgetErrorDetail(response);
      req.log.warn({ statusCode: response.status }, "SSO verification rejected");
      res.redirect(errorPath("verify_failed", `bridget_${response.status}`, detail));
      return;
    }

    const data = await response.json() as Record<string, unknown>;
    const identity = {
      user_id: typeof data.user_id === "string" ? data.user_id.trim() : "",
      email: typeof data.email === "string" ? data.email.trim() : "",
      role: typeof data.role === "string" ? data.role.trim() : "",
      is_guest: data.is_guest,
    };
    const guestCondition = getGuestCondition(identity);
    const guest = guestCondition !== "none";

    req.log.info({
      guest_condition: guestCondition,
      user_id: identity.user_id,
      role: identity.role,
      email_empty: identity.email.length === 0,
      email_domain: emailDomain(identity.email),
    }, "SSO identity received");

    if ("valid" in data && data.valid !== true) {
      req.log.warn({ reason: "valid_flag_false" }, "SSO response rejected");
      res.redirect(errorPath(
        "verify_failed",
        `bridget_${response.status}`,
        truncateDetail(data.detail),
      ));
      return;
    }

    const stringFields = guest
      ? (["user_id", "role"] as const)
      : (["user_id", "email", "role"] as const);
    for (const field of stringFields) {
      if (identity[field].length === 0) {
        req.log.warn({ reason: `missing_or_empty_${field}` }, "SSO response rejected");
        res.redirect(errorPath("verify_failed", `missing_or_empty_${field}`));
        return;
      }
    }

    const user = {
      user_id: identity.user_id,
      email: identity.email,
      role: identity.role,
    };

    try {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await db.transaction(async (tx) => {
        await tx
          .delete(usedSsoTokensTable)
          .where(sql`${usedSsoTokensTable.usedAt} < now() - interval '24 hours'`);
        await tx.execute(
          sql`INSERT INTO used_sso_tokens (token_hash) VALUES (${tokenHash})`,
        );
      });
    } catch (err: any) {
      const persistenceErrorText = [
        err?.code,
        err?.message,
        err?.cause?.code,
        err?.cause?.message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (persistenceErrorText.includes("23505") || persistenceErrorText.includes("duplicate key")) {
        req.log.warn({ reason: "token_reused" }, "SSO token rejected");
        res.redirect(errorPath("token_reused", "token_reused"));
        return;
      }
      req.log.error({ err }, "SSO token persistence failed");
      res.redirect(errorPath("verify_failed", "token_persistence_failed"));
      return;
    }

    if (guest) {
      req.log.info({ userId: user.user_id }, "Guest SSO login rejected");
      res.redirect(errorPath("guest_not_supported", guestCondition));
      return;
    }

    req.session.user = user;

    const pendingToken = req.session.pendingInvite;
    req.session.pendingInvite = undefined;

    if (pendingToken) {
      try {
        const joinResult = await db.transaction(async (tx) => {
          const [invite] = await tx
            .select()
            .from(invitesTable)
            .where(eq(invitesTable.token, pendingToken))
            .for("update");

          if (!invite || invite.status !== "pending") {
            return "/?invite_error=invalid";
          }
          if (invite.expiresAt && invite.expiresAt <= new Date()) {
            await tx
              .update(invitesTable)
              .set({ status: "expired" })
              .where(eq(invitesTable.id, invite.id));
            return "/?invite_error=expired";
          }
          if (
            invite.invitedEmail &&
            invite.invitedEmail.trim().toLowerCase() !== user.email.toLowerCase()
          ) {
            return "/?invite_error=wrong_account";
          }

          const [convo] = await tx
            .select()
            .from(conversationsTable)
            .where(eq(conversationsTable.id, invite.conversationId));

          if (convo?.ownerUserId === user.user_id) {
            return "/?invite_error=own_invite";
          }

          if (convo?.partnerUserId && convo.partnerUserId !== user.user_id) {
            await tx
              .update(invitesTable)
              .set({ status: "expired" })
              .where(eq(invitesTable.id, invite.id));
            return "/?invite_error=already_joined";
          }

          if (convo?.partnerUserId === user.user_id) {
            return `/?joined=${invite.conversationId}`;
          }

          const [updated] = await tx
            .update(conversationsTable)
            .set({ partnerUserId: user.user_id })
            .where(
              and(
                eq(conversationsTable.id, invite.conversationId),
                isNull(conversationsTable.partnerUserId),
              ),
            )
            .returning();

          if (!updated) {
            await tx
              .update(invitesTable)
              .set({ status: "expired" })
              .where(eq(invitesTable.id, invite.id));
            return "/?invite_error=already_joined";
          }

          await tx
            .update(invitesTable)
            .set({ status: "accepted", acceptedAt: new Date() })
            .where(eq(invitesTable.id, invite.id));

          return `/?joined=${invite.conversationId}`;
        });

        saveSession(req, res, () => res.redirect(joinResult));
        return;
      } catch (err) {
        req.log.error({ err }, "Invite acceptance failed");
      }
    }

    saveSession(req, res, () => res.redirect("/"));
  } catch (err) {
    req.log.error({ err }, "SSO callback failed");
    res.redirect(errorPath("verify_failed", "callback_failed"));
  }
});

router.get("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      req.log.error({ err }, "Session destroy failed");
      res.redirect("/?auth_error=session_destroy_failed");
      return;
    }
    res.clearCookie("connect.sid");
    res.redirect("https://bridget.fyi/auth/sso/logout?next=https://shalom.fyi/");
  });
});

export default router;
