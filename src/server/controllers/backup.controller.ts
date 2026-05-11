import { Request, Response } from "express";
import { dbAll, useMysql } from "../lib/db.ts";

/** Downloadable JSON: products + categories (stock lives on products). */
export const exportPosInventoryCatalog = async (_req: Request, res: Response) => {
  try {
    const [products, categories] = await Promise.all([
      dbAll("SELECT * FROM products ORDER BY name"),
      dbAll("SELECT * FROM categories ORDER BY sortOrder, name"),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      database: useMysql ? "mysql" : "sqlite",
      products,
      categories,
    };

    const filename = `cafetinto-pos-inventory-${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error("exportPosInventoryCatalog:", error);
    res.status(500).json({ error: "Export failed" });
  }
};
