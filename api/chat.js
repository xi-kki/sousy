import Groq from 'groq-sdk';

// Tool definitions (inlined from server/tools.js)
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'upsert_item',
      description: 'Add a new ingredient to inventory or update an existing one (quantity, unit, category, or expiry). Use when the cook reports stock arriving or a count.',
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

function normaliseName(name) {
  return String(name || '').trim().toLowerCase();
}

function findItem(inv, name) {
  const key = normaliseName(name);
  return inv.findIndex((i) => normaliseName(i.name) === key);
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateId(inventoryLength) {
  return `${Date.now()}-${Math.round(inventoryLength * 1000 + inventoryLength)}`;
}

function applyUpsert(inv, args) {
  const idx = findItem(inv, args.name);
  const expiryISO = args.days_until_expiry !== undefined ? addDaysISO(args.days_until_expiry) : null;
  if (idx >= 0) {
    inv[idx] = { ...inv[idx], quantity: args.quantity, unit: args.unit, category: args.category, expiresOn: expiryISO };
    return { kind: 'upsert', name: inv[idx].name, detail: `Updated to ${args.quantity} ${args.unit}` };
  }
  const newItem = { id: generateId(inv.length), name: normaliseName(args.name), quantity: args.quantity, unit: args.unit, category: args.category, expiresOn: expiryISO };
  inv.push(newItem);
  return { kind: 'upsert', name: newItem.name, detail: `Added ${args.quantity} ${args.unit}` };
}

function applyConsume(inv, args) {
  const idx = findItem(inv, args.name);
  if (idx === -1) return { kind: 'consume', name: args.name, detail: 'Not found in inventory' };
  inv[idx].quantity -= args.quantity;
  if (inv[idx].quantity <= 0) {
    const removed = inv.splice(idx, 1)[0];
    return { kind: 'consume', name: removed.name, detail: 'Used up — removed' };
  }
  return { kind: 'consume', name: inv[idx].name, detail: `Used ${args.quantity} ${inv[idx].unit}` };
}

function applyRemove(inv, args) {
  const idx = findItem(inv, args.name);
  if (idx === -1) return { kind: 'remove', name: args.name, detail: 'Not found in inventory' };
  const removed = inv.splice(idx, 1)[0];
  return { kind: 'remove', name: removed.name, detail: 'Removed from inventory' };
}

export function applyToolCall(inv, toolName, args) {
  switch (toolName) {
    case 'upsert_item': return applyUpsert(inv, args);
    case 'consume_item': return applyConsume(inv, args);
    case 'remove_item': return applyRemove(inv, args);
    default: throw new Error(`Unknown tool: ${toolName}`);
  }
}

// Prompt builder (inlined from server/prompt.js)
function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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

function formatInventoryLine(item) {
  const expiry = item.expiresOn ? `, expires ${item.expiresOn}` : '';
  return `- ${item.name}: ${item.quantity} ${item.unit} (${item.category})${expiry}`;
}

function formatSoonItems(soon) {
  if (soon.length === 0) return 'none';
  return soon
    .map((e) => `${e.name} (${e.days <= 0 ? 'TODAY/overdue' : e.days + 'd'})`)
    .join(', ');
}

function buildSystemPrompt(inv) {
  const lines = inv.length > 0
    ? inv.map(formatInventoryLine).join('\n')
    : '(empty)';

  const soon = expirySummary(inv).filter((e) => e.days <= 2);
  const soonFormatted = formatSoonItems(soon);

  return `You are Sousy, a calm, sharp sous-chef voice assistant for a busy commercial kitchen.
The cook's hands are full — keep spoken replies SHORT (1–2 sentences), concrete, and confirm what you logged.
Your mission: cut food waste by keeping inventory accurate and pushing the cook to use what expires soonest.

Today is ${todayISO()}.

Current inventory:
${lines}

Items expiring within 2 days: ${soonFormatted}

Rules:
- When the cook reports stock, counts, usage, or spoilage, CALL the appropriate tool(s) to update inventory. You may call several in one turn.
- If asked "what should I use" / "what's going off", recommend the soonest-expiring items and a quick dish idea.
- Normalise names to singular lowercase (e.g. "tomatoes" → "tomato").
- Never invent expiry dates the cook didn't give; only set days_until_expiry when stated or clearly implied.
- After tools run, give one short spoken confirmation. No markdown, no lists — this is read aloud.`;
}

// Groq chat completion (inlined from server/grok.js)
const DEFAULT_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callChatCompletion(config, messages, useTools) {
  const { apiKey, baseUrl, model } = config;

  if (!apiKey) {
    throw new Error('LLM API key is not configured');
  }

  const body = {
    model,
    messages,
    temperature: 0.3,
    ...(useTools ? { tools: TOOL_DEFINITIONS, tool_choice: 'auto' } : {}),
  };

  let response;
  try {
    response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      DEFAULT_TIMEOUT_MS,
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`LLM request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    }
    throw new Error(`LLM network error: ${err.message}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`LLM API error (${response.status}): ${errorText.slice(0, 400)}`);
  }

  return response.json();
}

// Serverless inventory (resets on cold start)
let serverlessInventory = null;

function getInventory() {
  if (!serverlessInventory) {
    serverlessInventory = [
      { id: 's1', name: 'salmon fillet', quantity: 6, unit: 'each', category: 'protein', expiresOn: addDaysISO(1) },
      { id: 's2', name: 'tomato', quantity: 2, unit: 'crate', category: 'produce', expiresOn: addDaysISO(3) },
      { id: 's3', name: 'spinach', quantity: 4, unit: 'bag', category: 'produce', expiresOn: addDaysISO(0) },
      { id: 's4', name: 'double cream', quantity: 5, unit: 'litre', category: 'dairy', expiresOn: addDaysISO(4) },
      { id: 's5', name: 'basmati rice', quantity: 20, unit: 'kg', category: 'dry', expiresOn: null },
      { id: 's6', name: 'chicken thigh', quantity: 8, unit: 'kg', category: 'protein', expiresOn: addDaysISO(2) },
    ];
  }
  return serverlessInventory;
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const llmConfig = {
  apiKey: process.env.GROQ_API_KEY,
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'llama-3.1-70b-versatile',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { history = [], inventory: clientInventory } = req.body;
    
    const inv = clientInventory && clientInventory.length > 0 ? clientInventory : getInventory();
    
    const systemPrompt = buildSystemPrompt(inv);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.text,
      })),
    ];
    
    const response = await callChatCompletion(llmConfig, messages, true);
    const choice = response.choices?.[0];
    
    if (!choice) {
      throw new Error('No response from LLM');
    }
    
    const message = choice.message;
    
    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push(message);
      
      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        const result = applyToolCall(inv, functionName, functionArgs);
        
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ ...result, inventory: inv }),
        });
      }
      
      const finalResponse = await callChatCompletion(llmConfig, messages, false);
      const finalChoice = finalResponse.choices?.[0];
      
      if (!finalChoice) {
        throw new Error('No final response from LLM');
      }
      
      return res.status(200).json({
        reply: finalChoice.message.content,
        inventory: inv,
      });
    }
    
    return res.status(200).json({
      reply: message.content,
      inventory: inv,
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({ error: 'Agent error', details: error.message });
  }
}