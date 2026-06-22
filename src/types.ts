/**
 * @file Shared type definitions for the Sousy application.
 * Used by both frontend components and the API client.
 */

/** Inventory categories an ingredient can belong to. */
export type Category = 'produce' | 'protein' | 'dairy' | 'dry' | 'frozen' | 'other';

/**
 * A single inventory item tracked in the kitchen.
 */
export interface InventoryItem {
  /** Unique identifier for this item (e.g. "s1" for seed data, timestamp-based for user-added) */
  id: string;
  /** Ingredient name, singular & lowercase (e.g. "tomato", "chicken thigh") */
  name: string;
  /** Numeric quantity on hand */
  quantity: number;
  /** Unit of measurement (e.g. "kg", "crate", "each", "litre") */
  unit: string;
  /** Category grouping for sorting and display */
  category: Category;
  /** ISO date (yyyy-mm-dd) the item expires, or null if non-perishable */
  expiresOn: string | null;
}

/** Visual state of the Sousy agent for UI feedback. */
export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** Kinds of inventory mutations the AI agent can perform. */
export type ActionKind = 'upsert' | 'consume' | 'remove';

/** Record of a single mutation the AI agent performed on inventory. */
export interface AgentAction {
  kind: ActionKind;
  name: string;
  detail: string;
}

/** A single turn in the conversation between the cook and Sousy. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Response from the /api/chat endpoint after the agent loop completes. */
export interface ChatResponse {
  /** The assistant's spoken reply (1-2 sentences, read aloud by TTS) */
  reply: string;
  /** The full inventory after all mutations were applied */
  inventory: InventoryItem[];
  /** Log of every tool call that was executed */
  actions: AgentAction[];
}
