import { Router } from "express";

const router = Router();

router.get("/member/status", (req, res) => {
  if (req.session.user) {
    res.json({
      authenticated: true,
      email: req.session.user.email,
      role: req.session.user.role,
    });
  } else {
    res.json({ authenticated: false });
  }
});

export default router;
