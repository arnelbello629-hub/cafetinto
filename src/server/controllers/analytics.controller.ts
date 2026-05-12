import { Request, Response } from "express";
import { dbAll, dbGet } from "../lib/db.ts";

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const { period = "today" } = req.query;

    let startTime = 0;
    const now = new Date();

    if (period === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      startTime = today.getTime();
    } else if (period === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      startTime = weekAgo.getTime();
    } else if (period === "month") {
      const monthAgo = new Date();
      monthAgo.setMonth(now.getMonth() - 1);
      startTime = monthAgo.getTime();
    }

    const revenueResult = startTime > 0
      ? await dbGet<{ total: number | null }>(
          "SELECT SUM(totalAmount) as total FROM orders WHERE createdAt >= ? AND COALESCE(isActive, 1) = 1 AND COALESCE(status, 'completed') != 'cancelled'",
          [startTime]
        )
      : await dbGet<{ total: number | null }>(
          "SELECT SUM(totalAmount) as total FROM orders WHERE COALESCE(isActive, 1) = 1 AND COALESCE(status, 'completed') != 'cancelled'"
        );
    const totalRevenue = Number(revenueResult?.total) || 0;

    const countResult = startTime > 0
      ? await dbGet<{ count: number }>(
          "SELECT COUNT(*) as count FROM orders WHERE createdAt >= ? AND COALESCE(isActive, 1) = 1 AND COALESCE(status, 'completed') != 'cancelled'",
          [startTime]
        )
      : await dbGet<{ count: number }>(
          "SELECT COUNT(*) as count FROM orders WHERE COALESCE(isActive, 1) = 1 AND COALESCE(status, 'completed') != 'cancelled'"
        );
    const totalOrders = Number(countResult?.count) || 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const topProducts =
      startTime > 0
        ? await dbAll(
            `SELECT p.name, SUM(oi.quantity) as totalSold, p.category
          FROM order_items oi
          JOIN orders o ON oi.orderId = o.id
          JOIN products p ON oi.productId = p.id
          WHERE o.createdAt >= ? AND COALESCE(o.isActive, 1) = 1 AND COALESCE(o.status, 'completed') != 'cancelled'
            AND COALESCE(oi.cancelled, 0) = 0
          GROUP BY oi.productId, p.name, p.category
          ORDER BY SUM(oi.quantity) DESC
          LIMIT 5`,
            [startTime]
          )
        : await dbAll(
            `SELECT p.name, SUM(oi.quantity) as totalSold, p.category
          FROM order_items oi
          JOIN orders o ON oi.orderId = o.id
          JOIN products p ON oi.productId = p.id
          WHERE COALESCE(o.isActive, 1) = 1 AND COALESCE(o.status, 'completed') != 'cancelled'
            AND COALESCE(oi.cancelled, 0) = 0
          GROUP BY oi.productId, p.name, p.category
          ORDER BY SUM(oi.quantity) DESC
          LIMIT 5`
          );

    const categoryDistribution =
      startTime > 0
        ? await dbAll(
            `SELECT p.category as name, SUM(oi.price * oi.quantity) as value
          FROM order_items oi
          JOIN orders o ON oi.orderId = o.id
          JOIN products p ON oi.productId = p.id
          WHERE o.createdAt >= ? AND COALESCE(o.isActive, 1) = 1 AND COALESCE(o.status, 'completed') != 'cancelled'
            AND COALESCE(oi.cancelled, 0) = 0
          GROUP BY p.category`,
            [startTime]
          )
        : await dbAll(
            `SELECT p.category as name, SUM(oi.price * oi.quantity) as value
          FROM order_items oi
          JOIN orders o ON oi.orderId = o.id
          JOIN products p ON oi.productId = p.id
          WHERE COALESCE(o.isActive, 1) = 1 AND COALESCE(o.status, 'completed') != 'cancelled'
            AND COALESCE(oi.cancelled, 0) = 0
          GROUP BY p.category`
          );

    const lowStockResult = await dbGet<{ count: number }>(
      "SELECT COUNT(*) as count FROM products WHERE stock < 15"
    );
    const lowStockCount = Number(lowStockResult?.count) || 0;

    const expensesResult = startTime > 0
      ? await dbGet<{ total: number | null }>("SELECT SUM(amount) as total FROM expenses WHERE date >= ?", [
          startTime,
        ])
      : await dbGet<{ total: number | null }>("SELECT SUM(amount) as total FROM expenses");
    const totalExpenses = Number(expensesResult?.total) || 0;

    const recentOrders = await dbAll<{
      id: string;
      userId: string | null;
      totalAmount: number;
      status: string;
      createdAt: number;
      displayName: string | null;
    }>(
      `SELECT o.*, u.displayName
      FROM orders o
      LEFT JOIN users u ON o.userId = u.id
      WHERE COALESCE(o.isActive, 1) = 1 AND COALESCE(o.status, 'completed') != 'cancelled'
      ORDER BY o.createdAt DESC
      LIMIT 10`
    );

    const activity = await Promise.all(
      recentOrders.map(async (order) => {
        const items = await dbAll<{ name: string }>(
          "SELECT name FROM order_items WHERE orderId = ? AND COALESCE(cancelled, 0) = 0",
          [order.id]
        );
        const label =
          (order.displayName && String(order.displayName).trim()) ||
          (order.userId && String(order.userId).trim()) ||
          "—";
        return {
          id: order.id,
          user: label,
          amount: order.totalAmount,
          time: order.createdAt,
          items: items.map((i) => i.name).join(", "),
        };
      })
    );

    res.json({
      totalRevenue,
      totalOrders,
      avgOrderValue,
      topProducts,
      categoryDistribution,
      lowStockCount,
      totalExpenses,
      activity,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
};
