import type { ChatTurn } from '../types'

export default function Transcript({ turns, partial }: { turns: ChatTurn[]; partial: string }) {
  return (
    <section className="flex flex-col">
      <h2 className="font-display text-2xl tracking-wide mb-4 text-muted-ash">TRANSCRIPT</h2>
      <div className="flex-1 space-y-4 overflow-y-auto max-h-[420px] pr-2">
        {turns.length === 0 && !partial && (
          <p className="font-mono text-sm text-muted-ash">
            Try: “We just got six crates of tomatoes, they expire Friday.” · “What should I cook first?” ·
            “Used two kilos of chicken thigh.”
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'text-canvas-white' : 'text-electric-mint'}>
            <span className="font-mono text-[10px] tracking-widest text-muted-ash block mb-1">
              {t.role === 'user' ? 'COOK' : 'SOUS'}
            </span>
            <p className="font-mono text-sm leading-relaxed">{t.text}</p>
          </div>
        ))}
        {partial && (
          <div className="text-canvas-white/60">
            <span className="font-mono text-[10px] tracking-widest text-muted-ash block mb-1">COOK</span>
            <p className="font-mono text-sm leading-relaxed italic">{partial}…</p>
          </div>
        )}
      </div>
    </section>
  )
}
