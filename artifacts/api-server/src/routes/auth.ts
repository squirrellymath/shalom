import { Router, type Request, type Response } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  db,
  invitesTable,
  conversationsTable,
  usedSsoTokensTable,
} from "@workspace/db";

const router = Router();

function saveSession(req: Request, res: Response, onSuccess: () => void) {
  req.session.save((err) => {
    if (err) {
      req.log.error({ err }, "Session save failed");
      res.redirect("/?auth_error=session_save_failed");
      return;
    }
    onSuccess();
  });
}

router.get("/auth/sso/callback", async (req, res) => {
  const token = typeof req.query.sso_token === "string" ? req.query.sso_token :
    typeof req.query.token === "string" ? req.query.token : null;
  if (!token) return res.redirect("/?auth_error=missing_token");
  try {
    const verifyUrl =
      `https://bridget.fyi/auth/sso/verify?token=${encodeURIComponent(token)}`;
    const response = await fetch(verifyUrl, {
      method: "GET",
      headers: { Origin: "https://shalom.fyi" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      req.log.warn({ statusCode: response.status }, "SSO verification rejected");
      res.redirect("/?auth_error=verify_failed");
      return;
    }

    const data = await response.json() as Record<string, unknown>;
    const stringFields = ["user_id", "email", "role"] as const;
    for (const field of stringFields) {
      if (typeof data[field] !== "string" || data[field].trim().length === 0) {
        req.log.warn({ reason: `missing_or_empty_${field}` }, "SSO response rejected");
        res.redirect("/?auth_error=verify_failed");
        return;
      }
    }
    if ("valid" in data && data.valid !== true) {
      req.log.warn({ reason: "valid_flag_false" }, "SSO response rejected");
      res.redirect("/?auth_error=verify_failed");
      return;
    }

    const user = {
      user_id: (data.user_id as string).trim(),
      email: (data.email as string).trim(),
      role: (data.role as string).trim(),
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
        res.redirect("/?auth_error=token_reused");
        return;
      }
      req.log.error({ err }, "SSO token persistence failed");
      res.redirect("/?auth_error=verify_failed");
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
    res.redirect("/?auth_error=verify_failed");
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
