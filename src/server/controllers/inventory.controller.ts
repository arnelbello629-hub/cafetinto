import { Request, Response } from "express";
import { dbAll, dbGet, dbRun, dbTransaction } from "../lib/db.ts";
import { v4 as uuidv4 } from "uuid";

export const getInventory = async (_req: Request, res: Response) => {
  try {
    const products = await dbAll("SELECT * FROM products");
    res.json(products);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
};

export const updateStock = async (req: Request, res: Response) => {
  try {
    const { productId, amount } = req.body;
    if (!productId || amount === undefined) {
      return res.status(400).json({ error: "Product ID and amount are required" });
    }

    const product = await dbGet<{ stock: number }>("SELECT stock FROM products WHERE id = ?", [productId]);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const newStock = (Number(product.stock) || 0) + Number(amount);
    await dbRun("UPDATE products SET stock = ? WHERE id = ?", [newStock, productId]);

    res.json({ id: productId, stock: newStock });
  } catch (error) {
    console.error("Error updating stock:", error);
    res.status(500).json({ error: "Failed to update stock" });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, price, category, stock, imageUrl } = req.body;

    await dbRun(
      `UPDATE products
      SET name = ?, price = ?, category = ?, stock = ?, imageUrl = ?
      WHERE id = ?`,
      [name, price, category, stock, imageUrl ?? null, id]
    );

    res.json({ id, name, price, category, stock, imageUrl });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbRun("DELETE FROM products WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
};

export const addProduct = async (req: Request, res: Response) => {
  try {
    const { name, price, category, stock, imageUrl } = req.body;
    const id = uuidv4();
    const createdAt = Date.now();

    await dbRun(
      `INSERT INTO products (id, name, price, category, stock, imageUrl, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, price, category, stock, imageUrl ?? null, createdAt]
    );

    res.status(201).json({ id, name, price, category, stock, imageUrl });
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({ error: "Failed to add product" });
  }
};

export const bulkAddProducts = async (req: Request, res: Response) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: "Invalid data format. Expected an array." });
    }

    await dbTransaction(async (tx) => {
      for (const item of products) {
        await tx.run(
          `INSERT INTO products (id, name, price, category, stock, imageUrl, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), item.name, item.price, item.category, item.stock, item.imageUrl || null, Date.now()]
        );
      }
    });

    res.status(201).json({ success: true, count: products.length });
  } catch (error) {
    console.error("Error bulk adding products:", error);
    res.status(500).json({ error: "Failed to bulk add products" });
  }
};
