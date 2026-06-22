import type { InventoryItem } from '../types'

const KEY = 'sous.inventory.v1'

export function loadInventory(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return seed()
}

export function saveInventory(inv: InventoryItem[]) {
  localStorage.setItem(KEY, JSON.stringify(inv))
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const today = new Date(new Date().toISOString().slice(0, 10))
  return Math.round((new Date(iso).getTime() - today.getTime()) / 86400000)
}

/** Sorted by soonest expiry first; non-perishables last. */
export function byExpiry(inv: InventoryItem[]): InventoryItem[] {
  return [...inv].sort((a, b) => {
    const da = daysUntil(a.expiresOn)
    const db = daysUntil(b.expiresOn)
    if (da == null && db == null) return a.name.localeCompare(b.name)
    if (da == null) return 1
    if (db == null) return -1
    return da - db
  })
}

function iso(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

/** A small starting pantry so the dashboard isn't empty on first run. */
function seed(): InventoryItem[] {
  return [
    { id: 's1', name: 'salmon fillet', quantity: 6, unit: 'each', category: 'protein', expiresOn: iso(1) },
    { id: 's2', name: 'tomato', quantity: 2, unit: 'crate', category: 'produce', expiresOn: iso(3) },
    { id: 's3', name: 'spinach', quantity: 4, unit: 'bag', category: 'produce', expiresOn: iso(0) },
    { id: 's4', name: 'double cream', quantity: 5, unit: 'litre', category: 'dairy', expiresOn: iso(4) },
    { id: 's5', name: 'basmati rice', quantity: 20, unit: 'kg', category: 'dry', expiresOn: null },
    { id: 's6', name: 'chicken thigh', quantity: 8, unit: 'kg', category: 'protein', expiresOn: iso(2) },
  ]
}
