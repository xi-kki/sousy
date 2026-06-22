import type { ChatResponse, ChatTurn, InventoryItem } from '../types';

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Send conversation history and current inventory to the Sousy agent backend.
 * The backend runs the LLM agent loop and returns an updated inventory + reply.
 *
 * @param history — Previous conversation turns
 * @param inventory — Current inventory snapshot
 * @param signal — Optional AbortSignal to cancel the request
 * @throws {Error} On network failure, timeout, or non-OK server response
 */
export async function sendToAgent(
  history: ChatTurn[],
  inventory: InventoryItem[],
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Combine the caller's signal with our timeout
  const combinedSignal = signal
    ? combineAbortSignals(signal, controller.signal)
    : controller.signal;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, inventory }),
      signal: combinedSignal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Request failed (${res.status})`);
    }

    return res.json() as Promise<ChatResponse>;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out or was cancelled');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Combine two AbortSignals into one.
 * The returned signal aborts when either input signal aborts.
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
  }

  return controller.signal;
}
