import type { InventoryItem } from '../types'
import { byExpiry, daysUntil } from '../lib/inventory'

/** The point of the product: surface what's about to be wasted, loudest. */
export default function WasteRail({ inventory }: { inventory: InventoryItem[] }) {
  const atRisk = byExpiry(inventory).filter((i) => {
    const d = daysUntil(i.expiresOn)
    return d != null && d <= 2
  })

  return (
    <section className="border border-electric-mint/40 bg-electric-mint/5 p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-2 w-2 rounded-full bg-electric-mint glow-mint" />
        <h2 className="font-display text-2xl tracking-widest text-electric-mint text-glow">USE&nbsp;IT&nbsp;OR&nbsp;LOSE&nbsp;IT</h2>
      </div>

      {atRisk.length === 0 ? (
        <p className="font-mono text-sm text-muted-ash">Nothing expiring in the next 48h. Tight ship. 🔪</p>
      ) : (
        <ul className="space-y-3">
          {atRisk.map((it) => {
            const d = daysUntil(it.expiresOn)!
            const urgent = d <= 0
            return (
              <li key={it.id} className="flex items-center justify-between gap-3">
                <span className="font-display text-xl tracking-wide truncate">{it.name.toUpperCase()}</span>
                <span
                  className={`font-mono text-xs px-3 py-1 rounded-full border whitespace-nowrap ${
                    urgent
                      ? 'border-danger text-danger'
                      : 'border-warn text-warn'
                  }`}
                >
                  {urgent ? 'EXPIRED — USE NOW' : d === 1 ? '1 DAY' : `${d} DAYS`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
