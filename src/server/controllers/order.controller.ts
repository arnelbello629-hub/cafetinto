import { Request, Response } from "express";
import { dbAll, dbRun, dbTransaction } from "../lib/db.ts";
import type { SqlTx } from "../lib/db.ts";
import { v4 as uuidv4 } from "uuid";

class CancelItemError extends Error {
  constructor(
    readonly code: "ORDER_NOT_FOUND" | "ITEM_NOT_FOUND" | "ORDER_CANCELLED"
  ) {
    super(code);
    this.name = "CancelItemError";
  }
}

async function fetchOrderPayload(tx: SqlTx, orderId: string) {
  const orderRow = await tx.get<Record<string, unknown>>("SELECT * FROM orders WHERE id = ?", [orderId]);
  const items = await tx.all("SELECT * FROM order_items WHERE orderId = ? ORDER BY id ASC", [orderId]);
  return { ...orderRow, items };
}

/** Works on SQLite and MySQL. */
const DECREMENT_STOCK_SQL = `UPDATE products SET stock = CASE WHEN stock - ? < 0 THEN 0 ELSE stock - ? END WHERE id = ?`;

export const createOrder = async (req: Request, res: Response) => {
  const { userId, totalAmount, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required" });
  }
  const orderId = uuidv4();
  const createdAt = Date.now();

  try {
    await dbTransaction(async (tx) => {
      await tx.run(
        `INSERT INTO orders (id, userId, totalAmount, status, createdAt, isActive)
        VALUES (?, ?, ?, 'completed', ?, 1)`,
        [orderId, userId || null, totalAmount, createdAt]
      );

      for (const item of items) {
        await tx.run(
          `INSERT INTO order_items (orderId, productId, name, price, quantity)
          VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.productId, item.name, item.price, item.quantity]
        );

        await tx.run(DECREMENT_STOCK_SQL, [item.quantity, item.quantity, item.productId]);
      }

      if (userId) {
        const user = await tx.get<{ loyaltyPoints: number }>("SELECT loyaltyPoints FROM users WHERE id = ?", [userId]);
        if (user) {
          const earnedPoints = Math.floor(Number(totalAmount));
          const newPoints = (Number(user.loyaltyPoints) || 0) + earnedPoints;
          await tx.run("UPDATE users SET loyaltyPoints = ? WHERE id = ?", [newPoints, userId]);
        }
      }
    });

    res.status(201).json({ id: orderId, userId, totalAmount, items });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
};

export const getOrderHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    let orders: Record<string, unknown>[];

    if (userId !== "all") {
      orders = await dbAll(
        `SELECT * FROM orders
        WHERE userId = ? AND COALESCE(isActive, 1) = 1
        ORDER BY createdAt DESC
        LIMIT 50`,
        [userId]
      );
    } else {
      orders = await dbAll(
        `SELECT * FROM orders WHERE COALESCE(isActive, 1) = 1 ORDER BY createdAt DESC LIMIT 50`
      );
    }

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await dbAll("SELECT * FROM order_items WHERE orderId = ?", [order.id as string]);
        return { ...order, items };
      })
    );

    res.json(ordersWithItems);
  } catch (error) {
    console.error("Error fetching order history:", error);
    res.status(500).json({ error: "Failed to fetch order history" });
  }
};

export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbRun("UPDATE orders SET isActive = 0 WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ error: "Failed to delete order" });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await dbRun(
      "UPDATE orders SET status = ? WHERE id = ? AND COALESCE(isActive, 1) = 1",
      [status, id]
    );
    res.json({ success: true, status });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Failed to update order status" });
  }
};

/** Cancel one line item: restore stock, recalc order totalAmount (excludes cancelled lines). */
export const cancelOrderLineItem = async (req: Request, res: Response) => {
  const { orderId, itemId } = req.params;
  const idNum = parseInt(String(itemId), 10);
  if (!Number.isFinite(idNum)) {
    return res.status(400).json({ error: "Invalid item id" });
  }

  try {
    const payload = await dbTransaction(async (tx) => {
      const orderMeta = await tx.get<{ status: string }>(
        `SELECT status FROM orders WHERE id = ? AND COALESCE(isActive, 1) = 1`,
        [orderId]
      );
      if (!orderMeta) throw new CancelItemError("ORDER_NOT_FOUND");
      if (orderMeta.status === "cancelled") throw new CancelItemError("ORDER_CANCELLED");

      const line = await tx.get<{
        id: number;
        productId: string;
        quantity: number;
        cancelled: number | null;
      }>(`SELECT id, productId, quantity, cancelled FROM order_items WHERE id = ? AND orderId = ?`, [
        idNum,
        orderId,
      ]);
      if (!line) throw new CancelItemError("ITEM_NOT_FOUND");

      if (Number(line.cancelled) !== 1) {
        const qty = Number(line.quantity) || 0;
        await tx.run(`UPDATE order_items SET cancelled = 1 WHERE id = ?`, [idNum]);
        if (qty > 0) {
          await tx.run(`UPDATE products SET stock = stock + ? WHERE id = ?`, [qty, line.productId]);
        }
      }

      const sumRow = await tx.get<{ s: number | null }>(
        `SELECT SUM(price * quantity) as s FROM order_items WHERE orderId = ? AND COALESCE(cancelled, 0) = 0`,
        [orderId]
      );
      const newTotal = Number(sumRow?.s) || 0;

      const activeLines = await tx.get<{ c: number }>(
        `SELECT COUNT(*) as c FROM order_items WHERE orderId = ? AND COALESCE(cancelled, 0) = 0`,
        [orderId]
      );
      const totalLines = await tx.get<{ c: number }>(
        `SELECT COUNT(*) as c FROM order_items WHERE orderId = ?`,
        [orderId]
      );

      let newStatus = orderMeta.status;
      if (Number(totalLines?.c) > 0 && Number(activeLines?.c) === 0) {
        newStatus = "cancelled";
      }

      await tx.run(`UPDATE orders SET totalAmount = ?, status = ? WHERE id = ?`, [
        newTotal,
        newStatus,
        orderId,
      ]);

      return fetchOrderPayload(tx, orderId);
    });

    res.json(payload);
  } catch (error) {
    if (error instanceof CancelItemError) {
      if (error.code === "ORDER_NOT_FOUND") return res.status(404).json({ error: "Order not found" });
      if (error.code === "ITEM_NOT_FOUND") return res.status(404).json({ error: "Line item not found" });
      if (error.code === "ORDER_CANCELLED") {
        return res.status(400).json({ error: "Order is already cancelled" });
      }
    }
    console.error("Error cancelling line item:", error);
    res.status(500).json({ error: "Failed to cancel line item" });
  }
};
