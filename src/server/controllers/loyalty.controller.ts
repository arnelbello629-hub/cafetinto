import { Request, Response } from "express";
import { dbAll, dbGet, dbRun } from "../lib/db.ts";

export const getLoyaltyInfo = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching loyalty info:", error);
    res.status(500).json({ error: "Failed to fetch loyalty info" });
  }
};

export const addLoyaltyPoints = async (req: Request, res: Response) => {
  try {
    const { userId, points } = req.body;
    const user = await dbGet<{ loyaltyPoints: number }>("SELECT loyaltyPoints FROM users WHERE id = ?", [userId]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const newPoints = (user.loyaltyPoints || 0) + points;
    await dbRun("UPDATE users SET loyaltyPoints = ? WHERE id = ?", [newPoints, userId]);

    res.json({ userId, loyaltyPoints: newPoints });
  } catch (error) {
    console.error("Error adding loyalty points:", error);
    res.status(500).json({ error: "Failed to add loyalty points" });
  }
};

export const syncUser = async (req: Request, res: Response) => {
  try {
    const { uid, email, displayName, photoURL, isAdmin } = req.body;
    if (!uid) return res.status(400).json({ error: "UID is required" });

    const user = await dbGet("SELECT * FROM users WHERE id = ?", [uid]);
    const isAdminVal = isAdmin ? 1 : 0;

    if (!user) {
      const createdAt = Date.now();
      await dbRun(
        `INSERT INTO users (id, email, displayName, photoURL, loyaltyPoints, isAdmin, createdAt, passwordHash)
        VALUES (?, ?, ?, ?, 0, ?, ?, NULL)`,
        [uid, email, displayName, photoURL, isAdminVal, createdAt]
      );

      return res.json({
        id: uid,
        email,
        displayName,
        photoURL,
        loyaltyPoints: 0,
        isAdmin: isAdminVal,
        isNew: true,
      });
    }

    await dbRun("UPDATE users SET displayName = ?, photoURL = ?, isAdmin = ? WHERE id = ?", [
      displayName,
      photoURL,
      isAdminVal,
      uid,
    ]);

    res.json({ ...(user as object), displayName, photoURL, isAdmin: isAdminVal });
  } catch (error) {
    console.error("Error syncing user:", error);
    res.status(500).json({ error: "Failed to sync user" });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbRun("DELETE FROM users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

export const getAllUsers = async (_req: Request, res: Response) => {
  try {
    const users = await dbAll("SELECT * FROM users");
    res.json(users);
  } catch (error) {
    console.error("Error fetching all users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};
