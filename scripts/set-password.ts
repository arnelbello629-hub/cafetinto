import "dotenv/config";
import { initDatabase, dbAll, dbRun, useMysql } from "../src/server/lib/db.ts";
import { hashPassword } from "../src/server/lib/password.ts";

/**
 * Usage:
 *   tsx scripts/set-password.ts <userId> <password> [<userId> <password> ...]
 *
 * Example:
 *   tsx scripts/set-password.ts admin 123 staff 123
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.length % 2 !== 0) {
    console.error("Usage: tsx scripts/set-password.ts <userId> <password> [<userId> <password> ...]");
    process.exit(1);
  }

  await initDatabase();
  console.info(`[set-password] Using ${useMysql() ? "MySQL" : "SQLite"}`);

  for (let i = 0; i < args.length; i += 2) {
    const userId = args[i];
    const password = args[i + 1];
    const existing = await dbAll<{ id: string }>("SELECT id FROM users WHERE id = ?", [userId]);
    const hash = hashPassword(password);
    if (existing.length === 0) {
      const createdAt = Date.now();
      const isAdmin = userId.toLowerCase() === "admin" ? 1 : 0;
      const displayName = userId.charAt(0).toUpperCase() + userId.slice(1);
      await dbRun(
        `INSERT INTO users (id, email, displayName, photoURL, loyaltyPoints, isAdmin, createdAt, passwordHash)
         VALUES (?, NULL, ?, NULL, 0, ?, ?, ?)`,
        [userId, displayName, isAdmin, createdAt, hash]
      );
      console.info(`[set-password] Created '${userId}' (isAdmin=${isAdmin}) with password set.`);
    } else {
      await dbRun("UPDATE users SET passwordHash = ? WHERE id = ?", [hash, userId]);
      console.info(`[set-password] Updated password for '${userId}'.`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[set-password] Failed:", err);
  process.exit(1);
});
