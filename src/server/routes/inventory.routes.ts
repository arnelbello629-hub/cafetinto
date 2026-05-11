import { Router } from "express";
import { getInventory, updateStock, addProduct, updateProduct, deleteProduct, bulkAddProducts } from "../controllers/inventory.controller.ts";

const router = Router();

router.get("/", getInventory);
router.post("/", addProduct);
router.post("/bulk", bulkAddProducts);
router.put("/:id", updateProduct);
router.delete("/:id", deleteProduct);
router.patch("/stock", updateStock);

export default router;
