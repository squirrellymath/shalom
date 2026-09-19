import { Router, type IRouter } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, invitesTable } from "@workspace/db";

const router: IRouter = Router();

const SSO_INIT_URL = "https://bridget.fyi/auth/sso/init?return_to=" +
  encodeURIComponent("https://shalom.fyi/auth/sso/callback");

router.get("/invite/:token", async (req, res): Promise<void> => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;

  const [invite] = await db
    .select()
    .from(invitesTable)
    .where(eq(invitesTable.token, token));

  if (!invite || invite.status !== "pending") {
    res.redirect("/?invite_error=invalid");
    return;
  }
  if (invite.expiresAt && invite.expiresAt <= new Date()) {
    await db
      .update(invitesTable)
      .set({ status: "expired" })
      .where(eq(invitesTable.id, invite.id));
    res.redirect("/?invite_error=expired");
    return;
  }

  req.session.pendingInvite = token;
  req.session.save((err) => {
    if (err) {
      req.log.error({ err }, "Invite session save failed");
      res.redirect("/?invite_error=session_save_failed");
      return;
    }
    res.redirect(SSO_INIT_URL);
  });
});

export default router;
