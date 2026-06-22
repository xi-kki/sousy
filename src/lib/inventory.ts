import type { InventoryItem } from '../types';

const STORAGE_KEY = 'sousy.inventory.v1';

/**
 * Get today's date as an ISO date string (yyyy-mm-dd) at midnight UTC.
 * Used for consistent date comparisons regardless of local time.
 */
function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Compute an ISO date string `daysFromNow` from today.
 * @param daysFromNow — Can be negative for past dates
 */
function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/**
 * Seed inventory so the dashboard isn't empty on first visit.
 * All items use deterministic IDs for testability.
 */
export function seedInventory(): InventoryItem[] {
  return [
    { id: 's1', name: 'salmon fillet', quantity: 6, unit: 'each', category: 'protein', expiresOn: iso(1) },
    { id: 's2', name: 'tomato', quantity: 2, unit: 'crate', category: 'produce', expiresOn: iso(3) },
    { id: 's3', name: 'spinach', quantity: 4, unit: 'bag', category: 'produce', expiresOn: iso(0) },
    { id: 's4', name: 'double cream', quantity: 5, unit: 'litre', category: 'dairy', expiresOn: iso(4) },
    { id: 's5', name: 'basmati rice', quantity: 20, unit: 'kg', category: 'dry', expiresOn: null },
    { id: 's6', name: 'chicken thigh', quantity: 8, unit: 'kg', category: 'protein', expiresOn: iso(2) },
  ];
}

/**
 * Load inventory from localStorage.
 * Returns seed data if nothing is stored or if stored data is corrupt.
 */
export function loadInventory(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedInventory();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedInventory();

    return parsed as InventoryItem[];
  } catch {
    // Corrupt JSON — reset to seed
    return seedInventory();
  }
}

/**
 * Persist inventory to localStorage.
 * @throws {Error} If serialization fails (extremely rare for this data shape)
 */
export function saveInventory(inv: InventoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inv));
  } catch (err) {
    throw new Error(`Failed to save inventory: ${err instanceof Error ? err.message : 'Quota exceeded'}`);
  }
}

/**
 * Compute the number of calendar days until an ISO date string.
 * @returns Positive = days left, 0 = today, negative = overdue, null = not tracked
 */
export function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;

  const today = new Date(todayISO());
  const target = new Date(isoDate);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Sort inventory by soonest expiry first; non-perishables last.
 * Items with the same expiry are sorted alphabetically.
 */
export function byExpiry(inv: InventoryItem[]): InventoryItem[] {
  return [...inv].sort((a, b) => {
    const da = daysUntil(a.expiresOn);
    const db = daysUntil(b.expiresOn);

    if (da === null && db === null) return a.name.localeCompare(b.name);
    if (da === null) return 1;
    if (db === null) return -1;
    if (da !== db) return da - db;

    return a.name.localeCompare(b.name);
  });
}
