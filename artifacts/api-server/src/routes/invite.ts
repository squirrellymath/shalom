import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

  req.session.pendingInvite = token;
  req.session.save(() => {
    res.redirect(SSO_INIT_URL);
  });
});

export default router;
