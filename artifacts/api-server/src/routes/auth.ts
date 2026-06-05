import { Router } from "express";

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
    req.session.save(() => res.redirect("/"));
  } catch (err) {
    res.redirect("/?auth_error=verify_failed");
  }
});

router.get("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

export default router;
