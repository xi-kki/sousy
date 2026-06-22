/* Thin wrappers around the browser Web Speech API (no external keys).
   STT = SpeechRecognition, TTS = speechSynthesis. Chrome/Edge have the best support. */

type SR = typeof window & {
  SpeechRecognition?: any
  webkitSpeechRecognition?: any
}

export function speechSupported(): boolean {
  const w = window as SR
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export interface Recognizer {
  start: () => void
  stop: () => void
}

/**
 * Create a push-to-talk recognizer. We use continuous=false: it captures one
 * utterance, fires onResult with the final transcript, then onEnd.
 */
export function createRecognizer(handlers: {
  onResult: (text: string) => void
  onPartial?: (text: string) => void
  onEnd?: () => void
  onError?: (msg: string) => void
}): Recognizer | null {
  const w = window as SR
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!Ctor) return null

  const rec = new Ctor()
  rec.lang = 'en-US'
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = 1

  let finalText = ''

  rec.onresult = (e: any) => {
    let interim = ''
    finalText = ''
    for (let i = 0; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) finalText += t
      else interim += t
    }
    if (interim && handlers.onPartial) handlers.onPartial(interim)
  }
  rec.onerror = (e: any) => handlers.onError?.(e.error || 'speech error')
  rec.onend = () => {
    if (finalText.trim()) handlers.onResult(finalText.trim())
    handlers.onEnd?.()
  }

  return {
    start: () => {
      finalText = ''
      try {
        rec.start()
      } catch {
        /* already started — ignore */
      }
    },
    stop: () => {
      try {
        rec.stop()
      } catch {
        /* not running — ignore */
      }
    },
  }
}

/** Speak text aloud. Cancels anything currently speaking first. */
export function speak(text: string) {
  if (!('speechSynthesis' in window) || !text) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1.05
  u.pitch = 1
  // prefer a crisp English voice if one is available
  const voices = window.speechSynthesis.getVoices()
  const preferred =
    voices.find((v) => /en-(US|GB)/.test(v.lang) && /Google|Natural|Samantha|Daniel/.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en'))
  if (preferred) u.voice = preferred
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
