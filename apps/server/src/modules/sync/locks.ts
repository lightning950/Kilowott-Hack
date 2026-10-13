/** In-memory locks: one sync per product, one import at a time. Reset on restart. */
const held = new Set<string>();

export const productLockKey = (id: number) => `product:${id}`;
export const IMPORT_LOCK = "import";

export const isLocked = (key: string) => held.has(key);

/** Returns false if someone already holds the lock. */
export const tryLock = (key: string): boolean => {
  if (held.has(key)) return false;
  held.add(key);
  return true;
};

export const unlock = (key: string) => {
  held.delete(key);
};