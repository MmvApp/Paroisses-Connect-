import { Router, type IRouter } from "express";
import healthRouter from "./health";
import parishClaimsRouter from "./parish-claims";
import enrichRouter from "./enrich";
import storageRouter   from "./storage";
import importWebRouter from "./import-web";
import downloadsRouter from "./downloads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(parishClaimsRouter);
router.use(enrichRouter);
router.use(storageRouter);
router.use(importWebRouter);
router.use(downloadsRouter);

export default router;
