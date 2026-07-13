// @ts-check
/**
 * @file Sousy — Express server that proxies voice agent requests to Groq.
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
  baseUrl: process.env.GROK_BASE_URL || 'https://api.groq.com/openai/v1',
  model: process.env.GROK_MODEL || 'llama-3.3-70b-versatile',
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

/**
 * POST /api/transcribe — Speech-to-text via Groq Whisper.
 * Accepts multipart/form-data with a 'file' field (WAV/MP3/WebM).
 * Returns { text: string }.
 */
app.post('/api/transcribe', express.raw({ type: 'audio/*', limit: '10mb' }), async (req, res) => {
  if (!llmConfig.apiKey) {
    return res.status(500).json({ error: 'GROK_API_KEY not configured' });
  }

  try {
    // Forward raw audio to Groq Whisper endpoint
    const formData = new FormData();
    const audioBlob = new Blob([req.body], { type: req.headers['content-type'] || 'audio/wav' });
    formData.append('file', audioBlob, 'recording.wav');
    formData.append('model', 'whisper-large-v3-turbo');

    const whisperRes = await fetch(
      `${llmConfig.baseUrl}/audio/transcriptions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${llmConfig.apiKey}` },
        body: formData,
      }
    );

    if (!whisperRes.ok) {
      const err = await whisperRes.text().catch(() => 'Whisper error');
      return res.status(502).json({ error: `STT failed: ${err.slice(0, 200)}` });
    }

    const data = await whisperRes.json();
    res.json({ text: data.text || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tts — Text-to-speech via Groq PlayAI.
 * Accepts { text: string, voice?: string }.
 * Returns audio/wav stream.
 */
app.post('/api/tts', async (req, res) => {
  if (!llmConfig.apiKey) {
    return res.status(500).json({ error: 'GROK_API_KEY not configured' });
  }

  try {
    const { text, voice = 'Arista-PlayAI' } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    const ttsRes = await fetch(
      `${llmConfig.baseUrl}/audio/speech`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llmConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: 'playai-tts',
          voice,
          input: text,
          response_format: 'wav',
        }),
      }
    );

    if (!ttsRes.ok) {
      const err = await ttsRes.text().catch(() => 'TTS error');
      return res.status(502).json({ error: `TTS failed: ${err.slice(0, 200)}` });
    }

    res.setHeader('Content-Type', 'audio/wav');
    const reader = ttsRes.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  const log = JSON.stringify({
    level: 'info',
    ts: new Date().toISOString(),
    msg: 'server started',
    port: PORT,
    model: llmConfig.model,
    keyConfigured: Boolean(llmConfig.apiKey),
  });
  process.stdout.write(log + '\n');
});
