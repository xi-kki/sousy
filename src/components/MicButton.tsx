interface Props {
  state: 'idle' | 'listening' | 'thinking' | 'speaking'
  supported: boolean
  onDown: () => void
  onUp: () => void
}

const LABEL: Record<Props['state'], string> = {
  idle: 'HOLD TO TALK',
  listening: 'LISTENING…',
  thinking: 'THINKING…',
  speaking: 'SPEAKING…',
}

export default function MicButton({ state, supported, onDown, onUp }: Props) {
  const active = state === 'listening'
  return (
    <div className="flex flex-col items-center gap-5 select-none">
      <button
        disabled={!supported || state === 'thinking'}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onMouseLeave={() => active && onUp()}
        onTouchStart={(e) => {
          e.preventDefault()
          onDown()
        }}
        onTouchEnd={(e) => {
          e.preventDefault()
          onUp()
        }}
        className={`relative grid place-items-center h-44 w-44 rounded-full border-2 transition-all
          ${
            active
              ? 'listening border-electric-mint bg-electric-mint text-midnight-ink glow-mint scale-105'
              : 'border-electric-mint/60 bg-transparent text-electric-mint hover:bg-electric-mint/10'
          }
          ${state === 'thinking' ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
          disabled:cursor-not-allowed`}
        aria-label="Hold to talk to Sous"
      >
        {state === 'speaking' ? (
          <div className="flex items-end gap-1 h-12">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="eq-bar w-2 bg-electric-mint h-full"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        ) : (
          <MicIcon />
        )}
      </button>

      <div className="font-display text-2xl tracking-widest text-glow text-electric-mint">
        {supported ? LABEL[state] : 'MIC UNSUPPORTED'}
      </div>
      {!supported && (
        <p className="font-mono text-xs text-muted-ash max-w-xs text-center">
          Voice needs Chrome or Edge. You can still type below.
        </p>
      )}
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}
