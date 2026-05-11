import "dotenv/config";
import fs from "fs";
import mysql from "mysql2/promise";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import Database from "better-sqlite3";
import path from "path";

const cwd = process.cwd();

/** MySQL when `MYSQL_HOST` + `MYSQL_DATABASE` are set; otherwise SQLite (`data/cafetinto.db` by default). */
export function useMysql(): boolean {
  return Boolean(process.env.MYSQL_HOST?.trim() && process.env.MYSQL_DATABASE?.trim());
}

let sqliteDb: Database.Database | null = null;
let mysqlPool: Pool | null = null;

function sqliteFilePath(): string {
  return process.env.SQLITE_DB_PATH
    ? path.isAbsolute(process.env.SQLITE_DB_PATH)
      ? process.env.SQLITE_DB_PATH
      : path.join(cwd, process.env.SQLITE_DB_PATH)
    : path.join(cwd, "data", "cafetinto.db");
}

const SQLITE_DDL = `
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL,
    imageUrl TEXT,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    displayName TEXT,
    photoURL TEXT,
    loyaltyPoints INTEGER DEFAULT 0,
    isAdmin INTEGER DEFAULT 0,
    createdAt INTEGER,
    passwordHash TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    userId TEXT,
    totalAmount REAL NOT NULL,
    status TEXT DEFAULT 'completed',
    createdAt INTEGER,
    isActive INTEGER DEFAULT 1,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId TEXT NOT NULL,
    productId TEXT NOT NULL,
    name TEXT,
    price REAL,
    quantity INTEGER,
    FOREIGN KEY(orderId) REFERENCES orders(id),
    FOREIGN KEY(productId) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    date INTEGER NOT NULL,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sortOrder INTEGER DEFAULT 0,
    createdAt INTEGER
  );
`;

/** MySQL DDL (aligned with SCHEMA.sql). */
const MYSQL_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    stock INT NOT NULL,
    imageUrl VARCHAR(500),
    createdAt BIGINT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255),
    displayName VARCHAR(255),
    photoURL VARCHAR(500),
    loyaltyPoints INT DEFAULT 0,
    isAdmin TINYINT(1) DEFAULT 0,
    createdAt BIGINT,
    passwordHash VARCHAR(500)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    userId VARCHAR(50),
    totalAmount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'completed',
    createdAt BIGINT,
    isActive TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (userId) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orderId VARCHAR(50) NOT NULL,
    productId VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    price DECIMAL(10,2),
    quantity INT,
    FOREIGN KEY (orderId) REFERENCES orders(id),
    FOREIGN KEY (productId) REFERENCES products(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    date BIGINT NOT NULL,
    createdAt BIGINT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    sortOrder INT DEFAULT 0,
    createdAt BIGINT,
    UNIQUE KEY uq_categories_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

function ensureSqlite(): Database.Database {
  if (sqliteDb) return sqliteDb;
  const fp = sqliteFilePath();
  const isDefaultSqlitePath = !process.env.SQLITE_DB_PATH?.trim();
  if (isDefaultSqlitePath && !fs.existsSync(fp)) {
    const legacyRoot = path.join(cwd, "cafetinto.db");
    if (fs.existsSync(legacyRoot)) {
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.copyFileSync(legacyRoot, fp);
      console.info(`[db] Migrated ${legacyRoot} -> ${fp}`);
    }
  }
  const dir = path.dirname(fp);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }
  sqliteDb = new Database(fp);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");
  sqliteDb.exec(SQLITE_DDL);
  console.info(`[db] SQLite file: ${fp}`);
  return sqliteDb;
}

async function ensureMysqlPool(): Promise<Pool> {
  if (mysqlPool) return mysqlPool;
  mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST!.trim(),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: (process.env.MYSQL_USER || "root").trim(),
    password: process.env.MYSQL_PASSWORD ?? "",
    database: process.env.MYSQL_DATABASE!.trim(),
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
  });
  for (const stmt of MYSQL_TABLES) {
    await mysqlPool.query(stmt);
  }
  console.info(`[db] MySQL: ${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT || 3306}/${process.env.MYSQL_DATABASE}`);
  return mysqlPool;
}

async function ensureUsersPasswordHashColumn(): Promise<void> {
  if (useMysql()) {
    const pool = await ensureMysqlPool();
    const dbName = process.env.MYSQL_DATABASE!.trim();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'passwordHash'`,
      [dbName]
    );
    const cnt = Number(rows[0]?.cnt ?? 0);
    if (cnt === 0) {
      await pool.execute("ALTER TABLE users ADD COLUMN passwordHash VARCHAR(500) NULL");
      console.info("[db] Added users.passwordHash (MySQL)");
    }
    return;
  }
  const d = ensureSqlite();
  const cols = d.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "passwordHash")) {
    d.exec("ALTER TABLE users ADD COLUMN passwordHash TEXT");
    console.info("[db] Added users.passwordHash (SQLite)");
  }
}

async function ensureOrdersIsActiveColumn(): Promise<void> {
  if (useMysql()) {
    const pool = await ensureMysqlPool();
    const dbName = process.env.MYSQL_DATABASE!.trim();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'isActive'`,
      [dbName]
    );
    if (Number(rows[0]?.cnt ?? 0) === 0) {
      await pool.execute(
        "ALTER TABLE orders ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 1"
      );
      console.info("[db] Added orders.isActive (MySQL)");
    }
    await pool.execute("UPDATE orders SET isActive = 1 WHERE isActive IS NULL");
    return;
  }
  const d = ensureSqlite();
  const cols = d.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "isActive")) {
    d.exec("ALTER TABLE orders ADD COLUMN isActive INTEGER DEFAULT 1");
    console.info("[db] Added orders.isActive (SQLite)");
  }
  d.exec("UPDATE orders SET isActive = 1 WHERE isActive IS NULL");
}

/** Open DB pool / file and ensure tables exist. */
export async function initDatabase(): Promise<void> {
  if (useMysql()) {
    await ensureMysqlPool();
  } else {
    ensureSqlite();
  }
  await ensureUsersPasswordHashColumn();
  await ensureOrdersIsActiveColumn();
}

export type SqlTx = {
  all<T = RowDataPacket>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = RowDataPacket>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<void>;
};

/** mysql2 execute() bind types */
type MysqlBind = string | number | bigint | boolean | Date | Buffer | null;

function bindParams(params: unknown[]): MysqlBind[] {
  return params.map((v) => (v === undefined ? null : (v as MysqlBind)));
}

export async function dbAll<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const p = bindParams(params);
  if (useMysql()) {
    const pool = await ensureMysqlPool();
    const [rows] = await pool.execute(sql, p);
    return rows as T[];
  }
  const d = ensureSqlite();
  return d.prepare(sql).all(...p) as T[];
}

export async function dbGet<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const p = bindParams(params);
  if (useMysql()) {
    const pool = await ensureMysqlPool();
    const [rows] = await pool.execute(sql, p);
    const arr = rows as RowDataPacket[];
    return (arr[0] as T | undefined) ?? undefined;
  }
  const d = ensureSqlite();
  return d.prepare(sql).get(...p) as T | undefined;
}

export async function dbRun(sql: string, params: unknown[] = []): Promise<void> {
  const p = bindParams(params);
  if (useMysql()) {
    const pool = await ensureMysqlPool();
    await pool.execute(sql, p);
    return;
  }
  ensureSqlite().prepare(sql).run(...p);
}

function makeMysqlTx(conn: PoolConnection): SqlTx {
  return {
    all: async <T = RowDataPacket>(sql: string, params: unknown[] = []) => {
      const p = bindParams(params);
      const [rows] = await conn.execute(sql, p);
      return rows as T[];
    },
    get: async <T = RowDataPacket>(sql: string, params: unknown[] = []) => {
      const p = bindParams(params);
      const [rows] = await conn.execute<RowDataPacket[]>(sql, p);
      const arr = rows as RowDataPacket[];
      return (arr[0] as T | undefined) ?? undefined;
    },
    run: async (sql: string, params: unknown[] = []) => {
      const p = bindParams(params);
      await conn.execute(sql, p);
    },
  };
}

export async function dbTransaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
  if (useMysql()) {
    const pool = await ensureMysqlPool();
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    const tx = makeMysqlTx(conn);
    try {
      const out = await fn(tx);
      await conn.commit();
      return out;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  const d = ensureSqlite();
  d.exec("BEGIN IMMEDIATE");
  const tx: SqlTx = {
    all: async <R = RowDataPacket>(sql: string, params: unknown[] = []) => {
      const p = bindParams(params);
      return d.prepare(sql).all(...p) as R[];
    },
    get: async <R = RowDataPacket>(sql: string, params: unknown[] = []) => {
      const p = bindParams(params);
      return d.prepare(sql).get(...p) as R | undefined;
    },
    run: async (sql: string, params: unknown[] = []) => {
      const p = bindParams(params);
      d.prepare(sql).run(...p);
    },
  };
  try {
    const out = await fn(tx);
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
