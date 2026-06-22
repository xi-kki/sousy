import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const PORT = process.env.PORT || 3001
const GROK_API_KEY = process.env.GROK_API_KEY
const GROK_MODEL = process.env.GROK_MODEL || 'grok-4'
const GROK_BASE_URL = process.env.GROK_BASE_URL || 'https://api.x.ai/v1'

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Serve built frontend
app.use(express.static(join(__dirname, '..', 'dist')))
app.get('*', (_req, res, next) => {
  // Don't catch API routes
  if (_req.path.startsWith('/api')) return next()
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'))
})

/* ────────────────────────────────────────────────────────────
   Tool (function) definitions Grok can call to mutate inventory.
   xAI is OpenAI-compatible, so this is the standard tools schema.
   ──────────────────────────────────────────────────────────── */
const tools = [
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
          quantity: { type: 'number', description: 'Amount used in the item’s existing unit' },
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
]

/* ───────────────────────── inventory helpers (server-side, stateless) ───────────────────────── */
const todayISO = () => new Date().toISOString().slice(0, 10)

function addDaysISO(days) {
  const d = new Date()
  d.setDate(d.getDate() + Math.round(days))
  return d.toISOString().slice(0, 10)
}

function findItem(inv, name) {
  const n = String(name || '').trim().toLowerCase()
  return inv.find((i) => i.name.toLowerCase() === n)
}

function applyToolCall(inv, name, args) {
  switch (name) {
    case 'upsert_item': {
      const existing = findItem(inv, args.name)
      const expiresOn =
        args.days_until_expiry != null ? addDaysISO(args.days_until_expiry) : existing?.expiresOn ?? null
      if (existing) {
        existing.quantity = args.quantity ?? existing.quantity
        existing.unit = args.unit ?? existing.unit
        existing.category = args.category ?? existing.category
        existing.expiresOn = expiresOn
        return { kind: 'upsert', name: existing.name, detail: `${existing.quantity} ${existing.unit}` }
      }
      inv.push({
        id: `${Date.now()}-${Math.round(inv.length * 1000 + inv.length)}`,
        name: String(args.name).trim().toLowerCase(),
        quantity: args.quantity,
        unit: args.unit,
        category: args.category || 'other',
        expiresOn,
      })
      return { kind: 'upsert', name: String(args.name).toLowerCase(), detail: `${args.quantity} ${args.unit}` }
    }
    case 'consume_item': {
      const existing = findItem(inv, args.name)
      if (!existing) return { kind: 'consume', name: args.name, detail: 'not found' }
      existing.quantity = Math.max(0, existing.quantity - (args.quantity || 0))
      if (existing.quantity <= 0) {
        const idx = inv.indexOf(existing)
        inv.splice(idx, 1)
        return { kind: 'consume', name: existing.name, detail: 'used up → removed' }
      }
      return { kind: 'consume', name: existing.name, detail: `${existing.quantity} ${existing.unit} left` }
    }
    case 'remove_item': {
      const existing = findItem(inv, args.name)
      if (!existing) return { kind: 'remove', name: args.name, detail: 'not found' }
      inv.splice(inv.indexOf(existing), 1)
      return { kind: 'remove', name: existing.name, detail: 'removed' }
    }
    default:
      return null
  }
}

function expirySummary(inv) {
  const today = new Date(todayISO())
  return inv
    .filter((i) => i.expiresOn)
    .map((i) => {
      const days = Math.round((new Date(i.expiresOn) - today) / 86400000)
      return { name: i.name, days }
    })
    .sort((a, b) => a.days - b.days)
}

function systemPrompt(inv) {
  const lines = inv.length
    ? inv
        .map(
          (i) =>
            `- ${i.name}: ${i.quantity} ${i.unit} (${i.category})${
              i.expiresOn ? `, expires ${i.expiresOn}` : ''
            }`
        )
        .join('\n')
    : '(empty)'
  const soon = expirySummary(inv)
    .filter((e) => e.days <= 2)
    .map((e) => `${e.name} (${e.days <= 0 ? 'TODAY/overdue' : e.days + 'd'})`)
  return `You are Sous, a calm, sharp sous-chef voice assistant for a busy commercial kitchen.
The cook's hands are full, so keep spoken replies SHORT (1-2 sentences), concrete, and confirm what you logged.
Your mission: cut food waste by keeping inventory accurate and pushing the cook to use what expires soonest.

Today is ${todayISO()}.

Current inventory:
${lines}

Items expiring within 2 days: ${soon.length ? soon.join(', ') : 'none'}

Rules:
- When the cook reports stock, counts, usage, or spoilage, CALL the appropriate tool(s) to update inventory. You may call several in one turn.
- If asked "what should I use" / "what's going off", recommend the soonest-expiring items and a quick dish idea.
- Normalise names to singular lowercase (e.g. "tomatoes" -> "tomato").
- Never invent expiry dates the cook didn't give; only set days_until_expiry when stated or clearly implied.
- After tools run, give one short spoken confirmation. No markdown, no lists — this is read aloud.`
}

async function callGrok(messages, useTools) {
  const res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROK_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages,
      ...(useTools ? { tools, tool_choice: 'auto' } : {}),
      temperature: 0.3,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Grok ${res.status}: ${body.slice(0, 400)}`)
  }
  return res.json()
}

/* ───────────────────────── routes ───────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: GROK_MODEL, keyConfigured: Boolean(GROK_API_KEY) })
})

app.post('/api/chat', async (req, res) => {
  if (!GROK_API_KEY) {
    return res.status(500).json({
      error: 'GROK_API_KEY is not set. Copy .env.example to .env and add your xAI key.',
    })
  }

  try {
    const history = Array.isArray(req.body.history) ? req.body.history : []
    const inventory = Array.isArray(req.body.inventory) ? structuredClone(req.body.inventory) : []
    const actions = []

    const messages = [
      { role: 'system', content: systemPrompt(inventory) },
      ...history.map((t) => ({ role: t.role, content: t.text })),
    ]

    // Agent loop: let Grok call tools, apply them, feed results back, up to 4 rounds.
    let reply = ''
    for (let round = 0; round < 4; round++) {
      const data = await callGrok(messages, true)
      const msg = data.choices?.[0]?.message
      if (!msg) break
      messages.push(msg)

      const toolCalls = msg.tool_calls || []
      if (toolCalls.length === 0) {
        reply = msg.content || ''
        break
      }

      for (const call of toolCalls) {
        let args = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {
          args = {}
        }
        const result = applyToolCall(inventory, call.function.name, args)
        if (result) actions.push(result)
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: true, result, inventoryCount: inventory.length }),
        })
      }
      // refresh system context with the mutated inventory for the next round
      messages[0] = { role: 'system', content: systemPrompt(inventory) }
    }

    res.json({ reply: reply || 'Done.', inventory, actions })
  } catch (err) {
    console.error('[chat] error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`\n  Sous Grok proxy on http://localhost:${PORT}`)
  console.log(`  model: ${GROK_MODEL}   key: ${GROK_API_KEY ? 'configured ✓' : 'MISSING ✗ (set .env)'}\n`)
})
