import { Router } from "express";
import { addCategory, listCategories } from "../controllers/category.controller.ts";

const router = Router();

router.get("/", listCategories);
router.post("/", addCategory);

export default router;
