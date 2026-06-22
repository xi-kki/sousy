// @ts-check
/**
 * @file Grok/xAI API client with timeout and error handling.
 * Uses OpenAI-compatible endpoints, so works with Groq, xAI, etc.
 */

import { TOOL_DEFINITIONS } from './tools.js';

/** Default timeout for LLM API calls in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * @typedef {Object} GrokConfig
 * @property {string} apiKey
 * @property {string} baseUrl
 * @property {string} model
 */

/**
 * @typedef {Object} ChatMessage
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string} content
 * @property {string} [tool_call_id]
 * @property {Array} [tool_calls]
 */

/**
 * @typedef {Object} ChatResponse
 * @property {Array<{ message: ChatMessage }>} [choices]
 */

/**
 * Create an AbortController-based fetch with a timeout.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Call the OpenAI-compatible chat completions endpoint.
 *
 * @param {GrokConfig} config
 * @param {ChatMessage[]} messages
 * @param {boolean} useTools — Whether to include function-calling tools
 * @returns {Promise<ChatResponse>}
 * @throws {Error} On network failure, timeout, or non-OK status
 */
export async function callChatCompletion(config, messages, useTools) {
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

  const data = await response.json();
  return data;
}
