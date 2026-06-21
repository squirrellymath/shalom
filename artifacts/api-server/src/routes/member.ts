import { Router } from "express";

const SHALOM_BYPASS = [
  "justin.malkin@outlook.com",
  "rechavambenshlomo@outlook.com",
  "rechavambenshlomo@gmail.com",
  "adam.kokesh@gmail.com",
];

const router = Router();

router.get("/member/status", (req, res) => {
  if (req.session.user) {
    const canAccess = SHALOM_BYPASS.includes(req.session.user.email.toLowerCase());
    res.json({
      authenticated: true,
      canAccess,
      email: req.session.user.email,
      role: req.session.user.role,
    });
  } else {
    res.json({ authenticated: false, canAccess: false });
  }
});

export default router;
