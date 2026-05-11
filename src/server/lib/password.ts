import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PREFIX = "v1";
const SEP = ".";

/** scrypt-derived password record: v1.<salt_b64>.<hash_b64> */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 32, { N: 16384, r: 8, p: 1 });
  return `${PREFIX}${SEP}${salt.toString("base64")}${SEP}${hash.toString("base64")}`;
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored || !plain) return false;
  const parts = stored.split(SEP);
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], "base64");
    expected = Buffer.from(parts[2], "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const hash = scryptSync(plain, salt, expected.length, { N: 16384, r: 8, p: 1 });
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}
