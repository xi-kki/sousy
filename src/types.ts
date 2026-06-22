export type Category = 'produce' | 'protein' | 'dairy' | 'dry' | 'frozen' | 'other'

export interface InventoryItem {
  id: string
  name: string
  quantity: number
  unit: string
  category: Category
  /** ISO date (yyyy-mm-dd) the item expires, or null if not tracked */
  expiresOn: string | null
}

export interface AgentAction {
  kind: 'upsert' | 'consume' | 'remove'
  name: string
  detail: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatResponse {
  reply: string
  inventory: InventoryItem[]
  actions: AgentAction[]
}
