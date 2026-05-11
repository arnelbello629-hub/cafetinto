import { Request, Response } from "express";
import { dbAll, dbGet, dbRun } from "../lib/db.ts";
import { v4 as uuidv4 } from "uuid";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string };
  return e.code === "ER_DUP_ENTRY" || e.code === "SQLITE_CONSTRAINT_UNIQUE";
}

/** Distinct category names from `categories` and from products. */
export const listCategories = async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll<{ name: string }>(
      `SELECT DISTINCT name FROM (
          SELECT name FROM categories
          UNION
          SELECT category AS name FROM products
          WHERE category IS NOT NULL AND TRIM(category) != ''
        ) u ORDER BY LOWER(name)`
    );
    res.json(rows.map((r) => ({ name: r.name })));
  } catch (error) {
    console.error("listCategories:", error);
    res.status(500).json({ error: "Failed to list categories" });
  }
};

export const addCategory = async (req: Request, res: Response) => {
  try {
    const raw = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!raw) {
      return res.status(400).json({ error: "Name is required" });
    }
    if (raw.length > 120) {
      return res.status(400).json({ error: "Name is too long" });
    }

    const dup = await dbGet<{ x: number }>("SELECT 1 AS x FROM categories WHERE LOWER(name) = LOWER(?)", [raw]);
    if (dup) {
      return res.status(409).json({ error: "That category already exists" });
    }

    await dbRun("INSERT INTO categories (id, name, sortOrder, createdAt) VALUES (?, ?, ?, ?)", [
      uuidv4(),
      raw,
      999,
      Date.now(),
    ]);

    res.status(201).json({ name: raw });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "That category already exists" });
    }
    console.error("addCategory:", error);
    res.status(500).json({ error: "Failed to add category" });
  }
};
