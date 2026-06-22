import type { ChatResponse, ChatTurn, InventoryItem } from '../types'

export async function sendToAgent(
  history: ChatTurn[],
  inventory: InventoryItem[]
): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, inventory }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json()
}
