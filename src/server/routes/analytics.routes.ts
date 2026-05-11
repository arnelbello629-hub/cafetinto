import { Router } from "express";
import { getDashboardStats } from "../controllers/analytics.controller.ts";

const router = Router();

router.get("/stats", getDashboardStats);

export default router;
