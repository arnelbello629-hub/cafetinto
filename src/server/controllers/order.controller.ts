import { Request, Response } from "express";
import { dbAll, dbRun, dbTransaction } from "../lib/db.ts";
import { v4 as uuidv4 } from "uuid";

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
