import "dotenv/config";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import mysql from "mysql2/promise";

function mysqlSslFromEnv(host: string): { rejectUnauthorized: boolean } | undefined {
  const raw = (process.env.DB_SSL ?? process.env.MYSQL_SSL)?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return undefined;
  }
  const explicitOn = raw === "1" || raw === "true" || raw === "yes";
  const aivenHost = host.includes(".aivencloud.com");
  if (!explicitOn && !aivenHost) {
    return undefined;
  }
  const strict = (process.env.DB_SSL_STRICT ?? process.env.MYSQL_SSL_STRICT)?.trim().toLowerCase();
  const rejectUnauthorized = strict === "1" || strict === "true" || strict === "yes";
  return { rejectUnauthorized };
}

function reqMysqlHost(): string {
  const h = process.env.DB_HOST?.trim() || process.env.MYSQL_HOST?.trim();
  if (!h) throw new Error("Missing DB_HOST or MYSQL_HOST");
  return h;
}

function reqMysqlDatabase(): string {
  const d = process.env.DB_NAME?.trim() || process.env.MYSQL_DATABASE?.trim();
  if (!d) throw new Error("Missing DB_NAME or MYSQL_DATABASE");
  return d;
}

function resolveSqlitePath(): string {
  const cwd = process.cwd();
  const envPath = process.env.SQLITE_DB_PATH?.trim();
  if (envPath) return path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);

  const candidates = [
    path.join(cwd, "data", "cafetinto.db"),
    path.join(cwd, "cafetinto.db"),
    path.join(cwd, "Tinto.db"),
  ];
  const existing = candidates.find((p) => fs.existsSync(p));
  if (!existing) {
    throw new Error(
      `No SQLite db found. Looked for: ${candidates.join(", ")} (or set SQLITE_DB_PATH)`
    );
  }
  return existing;
}

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
    cancelled TINYINT(1) NOT NULL DEFAULT 0,
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

type TableName = "categories" | "products" | "users" | "orders" | "order_items" | "expenses";

type MysqlBind = string | number | bigint | boolean | Date | Buffer | null;

const TABLES_IN_INSERT_ORDER: TableName[] = [
  "categories",
  "products",
  "users",
  "orders",
  "order_items",
  "expenses",
];

const TABLES_IN_WIPE_ORDER: TableName[] = [
  "order_items",
  "orders",
  "expenses",
  "products",
  "users",
  "categories",
];

function getSqliteRows(db: Database.Database, table: TableName): Record<string, unknown>[] {
  return db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
}

function buildInsert(table: TableName, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
  const values = cols.map((c) => {
    const v = row[c];
    return (v === undefined ? null : v) as MysqlBind;
  });
  return { sql, values };
}

async function main() {
  const sqlitePath = resolveSqlitePath();

  const host = reqMysqlHost();
  const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
  const user = (process.env.DB_USER || process.env.MYSQL_USER || "root").trim();
  const password = (process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? "")
    .replace(/\r/g, "")
    .trim();
  const database = reqMysqlDatabase();

  const archiveSqlite = process.argv.includes("--archive-sqlite");

  console.info(`[migrate] SQLite: ${sqlitePath}`);
  console.info(`[migrate] MySQL: ${host}:${port}/${database}`);

  const sqlite = new Database(sqlitePath, { readonly: true });
  sqlite.pragma("foreign_keys = ON");

  const ssl = mysqlSslFromEnv(host);

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    decimalNumbers: true,
    ...(ssl ? { ssl } : {}),
  });

  for (const stmt of MYSQL_TABLES) await pool.query(stmt);

  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of TABLES_IN_WIPE_ORDER) {
    await pool.query(`TRUNCATE TABLE ${t}`);
  }

  for (const t of TABLES_IN_INSERT_ORDER) {
    const rows = getSqliteRows(sqlite, t);
    console.info(`[migrate] ${t}: ${rows.length} rows`);
    for (const row of rows) {
      const { sql, values } = buildInsert(t, row);
      await pool.execute(sql, values);
    }
  }
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");

  sqlite.close();
  await pool.end();

  console.info("[migrate] Done.");

  if (archiveSqlite) {
    const ts = new Date()
      .toISOString()
      .replaceAll(":", "")
      .replaceAll("-", "")
      .replace("T", "_")
      .slice(0, 15);
    const bak = `${sqlitePath}.bak-${ts}`;
    fs.renameSync(sqlitePath, bak);
    console.info(`[migrate] Archived SQLite -> ${bak}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

