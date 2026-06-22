// @ts-check
/**
 * @file System prompt builder for the Sousy AI agent.
 * Dynamically generates the system prompt with current inventory context.
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string} id
 * @property {string} name
 * @property {number} quantity
 * @property {string} unit
 * @property {string} category
 * @property {string|null} expiresOn
 */

/**
 * Get today's date as an ISO date string (yyyy-mm-dd).
 * @returns {string}
 */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build an expiry summary: items sorted by days until expiry.
 * @param {InventoryItem[]} inv
 * @returns {Array<{ name: string, days: number }>}
 */
function expirySummary(inv) {
  const today = new Date(todayISO());
  return inv
    .filter((i) => i.expiresOn)
    .map((i) => {
      const days = Math.round((new Date(i.expiresOn).getTime() - today.getTime()) / 86400000);
      return { name: i.name, days };
    })
    .sort((a, b) => a.days - b.days);
}

/**
 * Format a single inventory line for the prompt.
 * @param {InventoryItem} item
 * @returns {string}
 */
function formatInventoryLine(item) {
  const expiry = item.expiresOn ? `, expires ${item.expiresOn}` : '';
  return `- ${item.name}: ${item.quantity} ${item.unit} (${item.category})${expiry}`;
}

/**
 * Format the "items expiring soon" section.
 * @param {Array<{ name: string, days: number }>} soon
 * @returns {string}
 */
function formatSoonItems(soon) {
  if (soon.length === 0) return 'none';
  return soon
    .map((e) => `${e.name} (${e.days <= 0 ? 'TODAY/overdue' : e.days + 'd'})`)
    .join(', ');
}

/**
 * Build the system prompt with current inventory context.
 *
 * @param {InventoryItem[]} inv — Current inventory snapshot
 * @returns {string} — The full system prompt for the LLM
 */
export function buildSystemPrompt(inv) {
  const lines = inv.length > 0
    ? inv.map(formatInventoryLine).join('\n')
    : '(empty)';

  const soon = expirySummary(inv).filter((e) => e.days <= 2);
  const soonFormatted = formatSoonItems(soon);

  return `You are Sousy, a calm, sharp sous-chef voice assistant for a busy commercial kitchen.
The cook's hands are full, so keep spoken replies SHORT (1-2 sentences), concrete, and confirm what you logged.
Your mission: cut food waste by keeping inventory accurate and pushing the cook to use what expires soonest.

Today is ${todayISO()}.

Current inventory:
${lines}

Items expiring within 2 days: ${soonFormatted}

Rules:
- When the cook reports stock, counts, usage, or spoilage, CALL the appropriate tool(s) to update inventory. You may call several in one turn.
- If asked "what should I use" / "what's going off", recommend the soonest-expiring items and a quick dish idea.
- Normalise names to singular lowercase (e.g. "tomatoes" -> "tomato").
- Never invent expiry dates the cook didn't give; only set days_until_expiry when stated or clearly implied.
- After tools run, give one short spoken confirmation. No markdown, no lists — this is read aloud.`;
}
