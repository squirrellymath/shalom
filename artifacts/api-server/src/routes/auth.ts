import { Router } from "express";

const router = Router();

router.get("/auth/sso/callback", async (req, res) => {
  const { sso_token } = req.query;

  if (!sso_token || typeof sso_token !== "string") {
    res.status(400).send("Missing sso_token");
    return;
  }

  try {
    const verifyUrl = `https://bridget.fyi/auth/sso/verify?token=${encodeURIComponent(sso_token)}`;
    const response = await fetch(verifyUrl, {
      headers: {
        Authorization: `Bearer ${process.env["SSO_SECRET"] ?? ""}`,
      },
    });

    if (!response.ok) {
      req.log.warn({ status: response.status }, "SSO verification rejected");
      res.status(401).send("SSO verification failed");
      return;
    }

    const user = (await response.json()) as {
      email: string;
      role: string;
      [key: string]: unknown;
    };

    req.session.user = user;
    res.redirect("/");
  } catch (err) {
    req.log.error({ err }, "SSO callback error");
    res.status(500).send("SSO verification error");
  }
});

export default router;
