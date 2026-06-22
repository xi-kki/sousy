import { useEffect, useRef, useState } from 'react'
import type { AgentState, ChatTurn, InventoryItem } from './types'
import { loadInventory, saveInventory } from './lib/inventory'
import { createRecognizer, speak, speechSupported, stopSpeaking } from './lib/speech'
import { sendToAgent } from './lib/api'
import MicButton from './components/MicButton'
import InventoryGrid from './components/InventoryGrid'
import WasteRail from './components/WasteRail'
import Transcript from './components/Transcript'

export default function App() {
  const [inventory, setInventory] = useState<InventoryItem[]>(loadInventory)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [partial, setPartial] = useState('')
  const [state, setState] = useState<AgentState>('idle')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  const supported = speechSupported()
  const recognizerRef = useRef<ReturnType<typeof createRecognizer>>(null)

  // Persist inventory to localStorage whenever it changes
  useEffect(() => {
    try {
      saveInventory(inventory);
    } catch {
      // localStorage quota exceeded — non-critical, degrade gracefully
    }
  }, [inventory])

  // prime voices (Chrome loads them async)
  useEffect(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices()
  }, [])

  async function submit(text: string) {
    const clean = text.trim()
    if (!clean) return
    setError(null)
    setPartial('')
    stopSpeaking()

    const nextTurns: ChatTurn[] = [...turns, { role: 'user', text: clean }]
    setTurns(nextTurns)
    setState('thinking')

    try {
      const res = await sendToAgent(nextTurns, inventory)
      setInventory(res.inventory)
      setTurns([...nextTurns, { role: 'assistant', text: res.reply }])
      setState('speaking')
      speak(res.reply)
      // Return to idle roughly when speech finishes
      const ms = Math.min(8000, 1200 + res.reply.length * 55);
      window.setTimeout(() => setState((s) => (s === 'speaking' ? 'idle' : s)), ms);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      setState('idle');
    }
  }

  function startListening() {
    if (!supported || state === 'thinking') return
    stopSpeaking()
    setPartial('')
    const rec = createRecognizer({
      onPartial: setPartial,
      onResult: (text) => submit(text),
      onEnd: () => setState((s) => (s === 'listening' ? 'idle' : s)),
      onError: (msg) => {
        if (msg !== 'no-speech' && msg !== 'aborted') setError(`Mic: ${msg}`)
        setState('idle')
      },
    })
    recognizerRef.current = rec
    rec?.start()
    setState('listening')
  }

  function stopListening() {
    recognizerRef.current?.stop()
  }

  return (
    <div className="scanlines min-h-full">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        {/* ── header ── */}
        <header className="flex items-center justify-between border-b border-graphite pb-5 mb-10">
          <div className="flex items-baseline gap-4">
            <h1 className="font-display text-5xl font-medium tracking-tight text-glow text-electric-mint">
              SOUSY
            </h1>
            <span className="font-mono text-xs text-muted-ash tracking-widest hidden sm:inline">
              VOICE LINE COOK · ZERO-WASTE
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-widest text-muted-ash">
            POWERED BY GROQ
          </span>
        </header>

        {/* ── hero / mic ── */}
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 items-start">
          <div className="flex flex-col items-center gap-10 lg:sticky lg:top-8">
            <p className="font-display text-3xl sm:text-4xl leading-[1.05] text-center max-w-md">
              HANDS FULL?
              <br />
              <span className="text-muted-ash">JUST TELL ME WHAT&nbsp;CHANGED.</span>
            </p>

            <MicButton state={state} supported={supported} onDown={startListening} onUp={stopListening} />

            {/* typed fallback */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit(typed)
                setTyped('')
              }}
              className="w-full max-w-md flex gap-2"
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="…or type it"
                className="flex-1 bg-transparent border border-graphite focus:border-electric-mint outline-none px-4 py-3 font-mono text-sm"
              />
              <button
                type="submit"
                className="px-5 py-3 rounded-full bg-electric-mint text-midnight-ink font-display tracking-widest text-sm hover:opacity-90"
              >
                SEND
              </button>
            </form>

            {error && (
              <p className="font-mono text-xs text-danger border border-danger/50 px-4 py-2 max-w-md text-center">
                {error}
              </p>
            )}
          </div>

          {/* ── right column: waste rail + transcript + inventory ── */}
          <div className="flex flex-col gap-10">
            <WasteRail inventory={inventory} />
            <Transcript turns={turns} partial={partial} />
            <InventoryGrid inventory={inventory} />
          </div>
        </div>

        <footer className="mt-16 pt-5 border-t border-graphite font-mono text-[10px] tracking-widest text-muted-ash">
          SOUSY · A SOUS-CHEF THAT NEVER FORGETS THE WALK-IN. INVENTORY SAVED LOCALLY IN YOUR BROWSER.
        </footer>
      </div>
    </div>
  )
}
