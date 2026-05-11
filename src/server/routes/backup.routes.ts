import { Router } from "express";
import { exportPosInventoryCatalog } from "../controllers/backup.controller.ts";

const router = Router();

router.get("/catalog", exportPosInventoryCatalog);

export default router;
