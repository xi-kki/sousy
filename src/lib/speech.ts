/**
 * Thin wrappers around the browser Web Speech API (no external keys).
 * STT = SpeechRecognition, TTS = speechSynthesis. Chrome/Edge have the best support.
 */

/** Type guard for the prefixed SpeechRecognition constructors. */
interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}

/** Minimal interface matching what we use from the native SpeechRecognition. */
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

/** Minimal shape of the results object from SpeechRecognition. */
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionErrorEvent {
  error?: string;
}

/**
 * Check whether the browser supports the Web Speech API (SpeechRecognition).
 */
export function speechSupported(): boolean {
  const w = window as SpeechRecognitionWindow;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface Recognizer {
  start: () => void;
  stop: () => void;
}

export interface RecognizerHandlers {
  onResult: (text: string) => void;
  onPartial?: (text: string) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}

/**
 * Create a push-to-talk recognizer (continuous=false).
 * Captures one utterance, fires `onResult` with the final transcript, then `onEnd`.
 *
 * @returns Null if the browser doesn't support SpeechRecognition.
 */
export function createRecognizer(handlers: RecognizerHandlers): Recognizer | null {
  const w = window as SpeechRecognitionWindow;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = '';

  rec.onresult = (event: SpeechRecognitionEvent) => {
    let interim = '';
    finalText = '';
    for (let i = 0; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interim += transcript;
      }
    }
    if (interim && handlers.onPartial) {
      handlers.onPartial(interim);
    }
  };

  rec.onerror = (event: SpeechRecognitionErrorEvent) => {
    handlers.onError?.(event.error || 'speech error');
  };

  rec.onend = () => {
    if (finalText.trim()) {
      handlers.onResult(finalText.trim());
    }
    handlers.onEnd?.();
  };

  return {
    start: () => {
      finalText = '';
      try { rec.start(); } catch { /* already started — ignore */ }
    },
    stop: () => {
      try { rec.stop(); } catch { /* not running — ignore */ }
    },
  };
}

/**
 * Speak text aloud using speechSynthesis.
 * Cancels anything currently speaking first.
 */
export function speak(text: string): void {
  if (!('speechSynthesis' in window) || !text) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1;

  // Prefer a crisp English voice
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /en-(US|GB)/.test(v.lang) && /Google|Natural|Samantha|Daniel/.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en'));
  if (preferred) utterance.voice = preferred;

  window.speechSynthesis.speak(utterance);
}

/**
 * Stop any ongoing speech output.
 */
export function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
