import { Router } from "express";
import {
  createOrder,
  getOrderHistory,
  deleteOrder,
  updateOrderStatus,
  cancelOrderLineItem,
} from "../controllers/order.controller.ts";

const router = Router();

router.post("/", createOrder);
router.get("/history/:userId", getOrderHistory);
router.patch("/:orderId/items/:itemId/cancel", cancelOrderLineItem);
router.delete("/:id", deleteOrder);
router.patch("/:id/status", updateOrderStatus);

export default router;
