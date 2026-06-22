import type { InventoryItem } from '../types';
import { byExpiry, daysUntil } from '../lib/inventory';

interface InventoryGridProps {
  inventory: InventoryItem[];
}

/**
 * Returns a Tailwind text colour class based on how close to expiry an item is.
 */
function statusColor(days: number | null): string {
  if (days === null) return 'text-muted-ash';
  if (days <= 0) return 'text-danger';
  if (days <= 2) return 'text-warn';
  return 'text-electric-mint';
}

/**
 * Returns a human-readable label for how close an item is to expiry.
 */
function statusLabel(days: number | null): string {
  if (days === null) return 'stable';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'use today';
  return `${days}d left`;
}

/**
 * Displays all inventory items in a grid, sorted by expiry (soonest first).
 * Each card shows the name, quantity, unit, category, and expiry status.
 */
export default function InventoryGrid({ inventory }: InventoryGridProps) {
  const items = byExpiry(inventory);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-3xl tracking-wide">INVENTORY</h2>
        <span className="font-mono text-xs text-muted-ash tracking-widest">
          {items.length} SKU{items.length === 1 ? '' : 'S'}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="font-mono text-sm text-muted-ash border border-graphite p-6">
          Empty. Hold the mic and say something like &ldquo;add three crates of onions, expires in five days&rdquo;.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-graphite border border-graphite">
          {items.map((it) => {
            const days = daysUntil(it.expiresOn);
            return (
              <div key={it.id} className="bg-midnight-ink p-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-xl tracking-wide truncate">{it.name.toUpperCase()}</div>
                  <div className="font-mono text-xs text-muted-ash">
                    {it.quantity} {it.unit} &middot; {it.category}
                  </div>
                </div>
                <div className={`font-mono text-xs whitespace-nowrap ${statusColor(days)}`}>
                  &bull; {statusLabel(days)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
