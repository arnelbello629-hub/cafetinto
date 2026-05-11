import { Router } from "express";
import { handleImageUpload, uploadMiddleware } from "../controllers/upload.controller.ts";

const router = Router();

router.post("/", uploadMiddleware.single("image"), handleImageUpload);

export default router;
