import { Router } from "express";
import inventoryRoutes from "./inventory.routes.ts";
import orderRoutes from "./order.routes.ts";
import loyaltyRoutes from "./loyalty.routes.ts";
import analyticsRoutes from "./analytics.routes.ts";
import uploadRoutes from "./upload.routes.ts";
import expenseRoutes from "./expense.routes.ts";
import authRoutes from "./auth.routes.ts";
import categoryRoutes from "./category.routes.ts";
import backupRoutes from "./backup.routes.ts";

const router = Router();

router.use("/auth", authRoutes);
router.use("/categories", categoryRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/orders", orderRoutes);
router.use("/loyalty", loyaltyRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/upload", uploadRoutes);
router.use("/expenses", expenseRoutes);
router.use("/backup", backupRoutes);

export default router;
