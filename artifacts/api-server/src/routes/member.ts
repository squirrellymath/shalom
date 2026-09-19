import { Router } from "express";
import { canAccess } from "../lib/access";

const router = Router();

router.get("/member/status", async (req, res): Promise<void> => {
  if (req.session.user) {
    const access = await canAccess(
      req.session.user.user_id,
      req.session.user.email,
    );
    res.json({
      authenticated: true,
      canAccess: access,
      email: req.session.user.email,
      role: req.session.user.role,
    });
  } else {
    res.json({ authenticated: false, canAccess: false });
  }
});

export default router;
