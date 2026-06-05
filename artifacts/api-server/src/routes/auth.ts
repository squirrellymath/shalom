import { Router } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, invitesTable, conversationsTable } from "@workspace/db";

const router = Router();

router.get("/auth/sso/callback", async (req, res) => {
  const token = typeof req.query.sso_token === "string" ? req.query.sso_token :
    typeof req.query.token === "string" ? req.query.token : null;
  if (!token) return res.redirect("/?auth_error=missing_token");
  try {
    const response = await fetch(
      `https://bridget.fyi/auth/sso/verify?token=${encodeURIComponent(token)}`,
      {
        method: "GET",
        headers: { Origin: "https://shalom.fyi" },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) return res.redirect("/?auth_error=verify_failed");
    const data = await response.json() as { user_id: string; email: string; role: string };
    req.session.user = { user_id: data.user_id, email: data.email, role: data.role };

    const pendingToken = req.session.pendingInvite;
    req.session.pendingInvite = undefined;

    if (pendingToken) {
      try {
        const [invite] = await db
          .select()
          .from(invitesTable)
          .where(eq(invitesTable.token, pendingToken));

        if (invite && invite.status === "pending") {
          const [updated] = await db
            .update(conversationsTable)
            .set({ partnerUserId: data.user_id })
            .where(
              and(
                eq(conversationsTable.id, invite.conversationId),
                isNull(conversationsTable.partnerUserId)
              )
            )
            .returning();

          if (updated) {
            await db
              .update(invitesTable)
              .set({ status: "accepted", acceptedAt: new Date() })
              .where(eq(invitesTable.id, invite.id));

            req.session.save(() => res.redirect(`/?joined=${invite.conversationId}`));
            return;
          }
        }
      } catch {
        // join failure never breaks normal login
      }
    }

    req.session.save(() => res.redirect("/"));
  } catch (err) {
    res.redirect("/?auth_error=verify_failed");
  }
});

router.get("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("https://bridget.fyi/auth/sso/logout?next=https://shalom.fyi/");
  });
});

export default router;
