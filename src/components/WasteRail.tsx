import type { InventoryItem } from '../types';
import { byExpiry, daysUntil } from '../lib/inventory';

interface WasteRailProps {
  inventory: InventoryItem[];
}

/**
 * "Use It or Lose It" rail — prominently surfaces items expiring within 2 days.
 * This is the core food-waste-reduction feature of the app.
 */
export default function WasteRail({ inventory }: WasteRailProps) {
  const atRisk = byExpiry(inventory).filter((i) => {
    const days = daysUntil(i.expiresOn);
    return days !== null && days <= 2;
  });

  return (
    <section className="border border-electric-mint/40 bg-electric-mint/5 p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-2 w-2 rounded-full bg-electric-mint glow-mint" />
        <h2 className="font-display text-2xl tracking-widest text-electric-mint text-glow">USE&nbsp;IT&nbsp;OR&nbsp;LOSE&nbsp;IT</h2>
      </div>

      {atRisk.length === 0 ? (
        <p className="font-mono text-sm text-muted-ash">Nothing expiring in the next 48h. Tight ship. &#x1F52A;</p>
      ) : (
        <ul className="space-y-3">
          {atRisk.map((it) => {
            const days = daysUntil(it.expiresOn)!;
            const isUrgent = days <= 0;
            return (
              <li key={it.id} className="flex items-center justify-between gap-3">
                <span className="font-display text-xl tracking-wide truncate">{it.name.toUpperCase()}</span>
                <span
                  className={`font-mono text-xs px-3 py-1 rounded-full border whitespace-nowrap ${
                    isUrgent
                      ? 'border-danger text-danger'
                      : 'border-warn text-warn'
                  }`}
                >
                  {isUrgent ? 'EXPIRED &mdash; USE NOW' : days === 1 ? '1 DAY' : `${days} DAYS`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
