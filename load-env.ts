import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** Load `.env` from the app root (next to `server.ts`), not only `process.cwd()`. */
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env") });
