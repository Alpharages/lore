import "server-only";
import { randomBytes } from "crypto";

const store = new Map<string, number>();

export const createSession = (): string => {
  const token = randomBytes(32).toString("hex");
  store.set(token, Date.now() + 7 * 24 * 60 * 60 * 1000);
  return token;
};

export const validateSession = (token: string): boolean => {
  const expiry = store.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    store.delete(token);
    return false;
  }
  return true;
};

export const deleteSession = (token: string): void => {
  store.delete(token);
};
