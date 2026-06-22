// @ts-check
/**
 * @file Tool definitions and executor for the Sous AI agent.
 * Defines the function-calling tools the LLM can use to mutate inventory,
 * and the pure functions that apply each tool call.
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string} id
 * @property {string} name
 * @property {number} quantity
 * @property {string} unit
 * @property {'produce'|'protein'|'dairy'|'dry'|'frozen'|'other'} category
 * @property {string|null} expiresOn - ISO date (yyyy-mm-dd) or null
 */

/**
 * @typedef {'upsert'|'consume'|'remove'} ToolKind
 */

/**
 * @typedef {Object} ToolResult
 * @property {ToolKind} kind
 * @property {string} name
 * @property {string} detail
 */

/**
 * OpenAI-compatible tool definitions for Grok/xAI function calling.
 * @type {Array<Object>}
 */
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'upsert_item',
      description:
        'Add a new ingredient to inventory or update an existing one (quantity, unit, category, or expiry). Use when the cook reports stock arriving or a count.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Ingredient name, singular & lowercase, e.g. "tomato"' },
          quantity: { type: 'number', description: 'Numeric quantity on hand' },
          unit: { type: 'string', description: 'Unit, e.g. crate, kg, bag, each, litre' },
          category: {
            type: 'string',
            enum: ['produce', 'protein', 'dairy', 'dry', 'frozen', 'other'],
          },
          days_until_expiry: {
            type: 'number',
            description: 'Whole days from today until it expires. Omit if not perishable / unknown.',
          },
        },
        required: ['name', 'quantity', 'unit', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consume_item',
      description: 'Reduce the quantity of an item because it was used/cooked. Removes it if it hits zero.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number', description: 'Amount used in the item\'s existing unit' },
        },
        required: ['name', 'quantity'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_item',
      description: 'Remove an item entirely (spoiled, discarded, or no longer stocked).',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  },
];

/**
 * Normalise an ingredient name to a lookup key.
 * @param {string} name
 * @returns {string}
 */
function normaliseName(name) {
  return String(name || '').trim().toLowerCase();
}

/**
 * Find an item in inventory by normalised name.
 * @param {InventoryItem[]} inv
 * @param {string} name
 * @returns {InventoryItem | undefined}
 */
function findItem(inv, name) {
  const key = normaliseName(name);
  return inv.find((i) => i.name.toLowerCase() === key);
}

/**
 * Compute an ISO date string `days` from today.
 * @param {number} days
 * @returns {string}
 */
function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

/**
 * Generate a unique item ID based on timestamp and inventory length.
 * @param {number} inventoryLength
 * @returns {string}
 */
function generateId(inventoryLength) {
  return `${Date.now()}-${Math.round(inventoryLength * 1000 + inventoryLength)}`;
}

/**
 * Apply the `upsert_item` tool call: add or update an inventory item.
 * @param {InventoryItem[]} inv
 * @param {{ name: string, quantity: number, unit: string, category: string, days_until_expiry?: number }} args
 * @returns {ToolResult}
 */
function applyUpsert(inv, args) {
  const existing = findItem(inv, args.name);
  const expiresOn =
    args.days_until_expiry != null
      ? addDaysISO(args.days_until_expiry)
      : existing?.expiresOn ?? null;

  if (existing) {
    existing.quantity = args.quantity ?? existing.quantity;
    existing.unit = args.unit ?? existing.unit;
    existing.category = args.category ?? existing.category;
    existing.expiresOn = expiresOn;
    return { kind: 'upsert', name: existing.name, detail: `${existing.quantity} ${existing.unit}` };
  }

  const newItem = {
    id: generateId(inv.length),
    name: normaliseName(args.name),
    quantity: args.quantity,
    unit: args.unit,
    category: args.category || 'other',
    expiresOn,
  };
  inv.push(newItem);
  return { kind: 'upsert', name: newItem.name, detail: `${args.quantity} ${args.unit}` };
}

/**
 * Apply the `consume_item` tool call: reduce quantity, remove if zero.
 * @param {InventoryItem[]} inv
 * @param {{ name: string, quantity: number }} args
 * @returns {ToolResult}
 */
function applyConsume(inv, args) {
  const existing = findItem(inv, args.name);
  if (!existing) {
    return { kind: 'consume', name: args.name, detail: 'not found' };
  }

  existing.quantity = Math.max(0, existing.quantity - (args.quantity || 0));
  if (existing.quantity <= 0) {
    const idx = inv.indexOf(existing);
    inv.splice(idx, 1);
    return { kind: 'consume', name: existing.name, detail: 'used up → removed' };
  }
  return { kind: 'consume', name: existing.name, detail: `${existing.quantity} ${existing.unit} left` };
}

/**
 * Apply the `remove_item` tool call: delete an item entirely.
 * @param {InventoryItem[]} inv
 * @param {{ name: string }} args
 * @returns {ToolResult}
 */
function applyRemove(inv, args) {
  const existing = findItem(inv, args.name);
  if (!existing) {
    return { kind: 'remove', name: args.name, detail: 'not found' };
  }
  inv.splice(inv.indexOf(existing), 1);
  return { kind: 'remove', name: existing.name, detail: 'removed' };
}

/**
 * Apply a named tool call against an inventory array (mutates in place).
 *
 * @param {InventoryItem[]} inv — Mutable copy of inventory
 * @param {string} toolName — The tool function name
 * @param {Record<string, unknown>} args — Parsed arguments from the LLM
 * @returns {ToolResult | null} — Null if tool name is unknown
 */
export function applyToolCall(inv, toolName, args) {
  switch (toolName) {
    case 'upsert_item':
      return applyUpsert(inv, /** @type {any} */ (args));
    case 'consume_item':
      return applyConsume(inv, /** @type {any} */ (args));
    case 'remove_item':
      return applyRemove(inv, /** @type {any} */ (args));
    default:
      return null;
  }
}
