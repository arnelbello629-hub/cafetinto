import { Request, Response } from "express";
import { dbAll, dbGet, dbRun } from "../lib/db.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";

/** Staff list for sign-in screen (id + display fields only). */
export const listUsers = async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll<{
      id: string;
      email: string | null;
      displayName: string | null;
      photoURL: string | null;
      isAdmin: number;
    }>(
      "SELECT id, email, displayName, photoURL, isAdmin FROM users ORDER BY COALESCE(displayName, email, id)"
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.displayName,
        photoURL: r.photoURL,
        isAdmin: Boolean(r.isAdmin),
      }))
    );
  } catch (error) {
    console.error("listUsers:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const rawId =
      typeof req.body?.userId === "string"
        ? req.body.userId.trim()
        : typeof req.body?.username === "string"
          ? req.body.username.trim()
          : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!rawId) {
      return res.status(400).json({ error: "Username or staff ID is required" });
    }
    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    const row = await dbGet<{
      id: string;
      email: string | null;
      displayName: string | null;
      photoURL: string | null;
      isAdmin: number;
      passwordHash: string | null;
    }>(
      "SELECT id, email, displayName, photoURL, isAdmin, passwordHash FROM users WHERE id = ? OR LOWER(email) = LOWER(?)",
      [rawId, rawId]
    );
    if (!row) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const stored = row.passwordHash?.trim() || null;
    const bootstrap = process.env.STAFF_BOOTSTRAP_PASSWORD?.trim();

    if (stored) {
      if (!verifyPassword(password, stored)) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
    } else if (bootstrap && password === bootstrap) {
      const hashed = hashPassword(password);
      await dbRun("UPDATE users SET passwordHash = ? WHERE id = ?", [hashed, row.id]);
    } else {
      return res.status(401).json({
        error:
          "No password set for this account. Add STAFF_BOOTSTRAP_PASSWORD to .env matching the password you enter on first sign-in, then sign in once and remove it from .env.",
      });
    }

    res.json({
      uid: row.id,
      email: row.email,
      displayName: row.displayName,
      photoURL: row.photoURL,
      isAdmin: Boolean(row.isAdmin),
    });
  } catch (error) {
    console.error("login:", error);
    res.status(500).json({ error: "Login failed" });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId =
      typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    const currentPassword =
      typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!currentPassword) return res.status(400).json({ error: "Current password is required" });
    if (!newPassword || newPassword.length < 3) {
      return res.status(400).json({ error: "New password must be at least 3 characters" });
    }
    const row = await dbGet<{ id: string; passwordHash: string | null }>(
      "SELECT id, passwordHash FROM users WHERE id = ?",
      [userId]
    );
    if (!row) return res.status(404).json({ error: "User not found" });
    if (!row.passwordHash || !verifyPassword(currentPassword, row.passwordHash)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    await dbRun("UPDATE users SET passwordHash = ? WHERE id = ?", [
      hashPassword(newPassword),
      row.id,
    ]);
    res.json({ ok: true });
  } catch (error) {
    console.error("changePassword:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
};

export const getSession = async (req: Request, res: Response) => {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
    if (!userId) {
      return res.status(400).json({ error: "userId query is required" });
    }
    const row = await dbGet<{
      id: string;
      email: string | null;
      displayName: string | null;
      photoURL: string | null;
      isAdmin: number;
    }>("SELECT id, email, displayName, photoURL, isAdmin FROM users WHERE id = ?", [userId]);
    if (!row) {
      return res.status(401).json({ error: "Invalid session" });
    }
    res.json({
      uid: row.id,
      email: row.email,
      displayName: row.displayName,
      photoURL: row.photoURL,
      isAdmin: Boolean(row.isAdmin),
    });
  } catch (error) {
    console.error("getSession:", error);
    res.status(500).json({ error: "Session check failed" });
  }
};
