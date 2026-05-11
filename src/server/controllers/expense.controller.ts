import { Request, Response } from "express";
import { dbAll, dbRun } from "../lib/db.ts";
import { v4 as uuidv4 } from "uuid";

export const getExpenses = async (_req: Request, res: Response) => {
  try {
    const expenses = await dbAll("SELECT * FROM expenses ORDER BY date DESC");
    res.json(expenses);
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
};

export const addExpense = async (req: Request, res: Response) => {
  try {
    const { description, amount, category, date } = req.body;
    const id = uuidv4();
    const createdAt = Date.now();

    await dbRun(
      `INSERT INTO expenses (id, description, amount, category, date, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [id, description, amount, category, date || Date.now(), createdAt]
    );

    res.status(201).json({ id, description, amount, category, date, createdAt });
  } catch (error) {
    console.error("Error adding expense:", error);
    res.status(500).json({ error: "Failed to add expense" });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbRun("DELETE FROM expenses WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
};
