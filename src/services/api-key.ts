import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

const BCRYPT_COST = 12;

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// Rejection threshold removes modulo bias: only accept bytes < 248 (256 - 256%62).
const REJECTION_THRESHOLD = 256 - (256 % CHARS.length);

export function generateApiKey(slug: string): string {
  let suffix = "";
  while (suffix.length < 24) {
    for (const byte of randomBytes(32)) {
      if (byte < REJECTION_THRESHOLD && suffix.length < 24) {
        suffix += CHARS[byte % CHARS.length];
      }
    }
  }
  return `lore_${slug}_${suffix}`;
}

export function hashApiKey(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function compareApiKey(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
