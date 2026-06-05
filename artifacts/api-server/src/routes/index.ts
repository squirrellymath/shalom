import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import memberRouter from "./member";
import conversationsRouter from "./conversations";
import inviteRouter from "./invite";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(memberRouter);
router.use(conversationsRouter);
router.use(inviteRouter);

export default router;

