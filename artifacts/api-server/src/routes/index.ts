import { Router, type IRouter } from "express";
import feedRouter from "./feed";
import trackRouter from "./track";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => { res.json({ status: "ok" }); });
router.use(feedRouter);
router.use(trackRouter);

export default router;
