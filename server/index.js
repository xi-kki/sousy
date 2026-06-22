// @ts-check
/**
 * @file Sous — Express server that proxies voice agent requests to Grok/xAI.
 * Serves the built frontend statically and exposes /api/chat for the agent loop.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { applyToolCall } from './tools.js';
import { buildSystemPrompt } from './prompt.js';
import { callChatCompletion } from './grok.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);

/**
 * @typedef {Object} LLMConfig
 * @property {string} apiKey
 * @property {string} baseUrl
 * @property {string} model
 */

/** @type {LLMConfig} */
const llmConfig = {
  apiKey: process.env.GROK_API_KEY || '',
  baseUrl: process.env.GROK_BASE_URL || 'https://api.x.ai/v1',
  model: process.env.GROK_MODEL || 'grok-4',
};

// ── Express setup ──────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve built frontend
app.use(express.static(join(__dirname, '..', 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

// ── Routes ─────────────────────────────────────────────────────

/**
 * GET /api/health — Health check.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: llmConfig.model,
    keyConfigured: Boolean(llmConfig.apiKey),
  });
});

/**
 * POST /api/chat — Agent loop.
 *
 * Accepts conversation history + current inventory, runs the LLM agent
 * with tool-calling, applies inventory mutations, and returns the reply.
 */
app.post('/api/chat', async (req, res) => {
  if (!llmConfig.apiKey) {
    return res.status(500).json({
      error: 'GROK_API_KEY is not set. Copy .env.example to .env and add your API key.',
    });
  }

  try {
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    /** @type {import('./tools.js').InventoryItem[]} */
    const inventory = Array.isArray(req.body.inventory)
      ? structuredClone(req.body.inventory)
      : [];
    /** @type {Array<import('./tools.js').ToolResult>} */
    const actions = [];

    const messages = [
      { role: 'system', content: buildSystemPrompt(inventory) },
      ...history.map((/** @type {any} */ t) => ({ role: t.role, content: t.text })),
    ];

    // Agent loop: let the LLM call tools, apply results, feed back, up to 4 rounds
    let reply = '';
    for (let round = 0; round < 4; round++) {
      const data = await callChatCompletion(llmConfig, messages, true);
      const msg = data.choices?.[0]?.message;
      if (!msg) break;
      messages.push(msg);

      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        reply = msg.content || '';
        break;
      }

      for (const call of toolCalls) {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }

        const result = applyToolCall(inventory, call.function.name, args);
        if (result) actions.push(result);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: true, result, inventoryCount: inventory.length }),
        });
      }

      // Refresh system context with mutated inventory for next round
      messages[0] = { role: 'system', content: buildSystemPrompt(inventory) };
    }

    res.json({ reply: reply || 'Done.', inventory, actions });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────

app.listen(PORT, () => {
  /* eslint-disable no-console */
  console.log(`\n  Sous proxy on http://localhost:${PORT}`);
  console.log(`  model: ${llmConfig.model}   key: ${llmConfig.apiKey ? 'configured ✓' : 'MISSING ✗'}\n`);
});
