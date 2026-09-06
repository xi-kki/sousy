import Groq from 'groq-sdk';
import { TOOL_DEFINITIONS, applyToolCall } from '../server/tools.js';
import { callChatCompletion } from '../server/grok.js';

// In-memory inventory for serverless (resets on cold start)
let serverlessInventory = null;

function getInventory() {
  if (!serverlessInventory) {
    // Seed with default inventory
    serverlessInventory = [
      { id: 's1', name: 'salmon fillet', quantity: 6, unit: 'each', category: 'protein', expiresOn: getISODate(1) },
      { id: 's2', name: 'tomato', quantity: 2, unit: 'crate', category: 'produce', expiresOn: getISODate(3) },
      { id: 's3', name: 'spinach', quantity: 4, unit: 'bag', category: 'produce', expiresOn: getISODate(0) },
      { id: 's4', name: 'double cream', quantity: 5, unit: 'litre', category: 'dairy', expiresOn: getISODate(4) },
      { id: 's5', name: 'basmati rice', quantity: 20, unit: 'kg', category: 'dry', expiresOn: null },
      { id: 's6', name: 'chicken thigh', quantity: 8, unit: 'kg', category: 'protein', expiresOn: getISODate(2) },
    ];
  }
  return serverlessInventory;
}

function getISODate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return getISODate(0);
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

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const llmConfig = {
  apiKey: process.env.GROQ_API_KEY,
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'llama-3.3-70b-versatile',
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
    
    // Use client inventory if provided, otherwise serverless inventory
    const inv = clientInventory && clientInventory.length > 0 ? clientInventory : getInventory();
    
    // Build messages with system prompt
    const systemPrompt = buildSystemPrompt(inv);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.text,
      })),
    ];
    
    // First LLM call with tools
    const response = await callChatCompletion(llmConfig, messages, true);
    const choice = response.choices?.[0];
    
    if (!choice) {
      throw new Error('No response from LLM');
    }
    
    const message = choice.message;
    
    // Handle tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Add assistant message with tool calls to history
      messages.push(message);
      
      // Execute each tool call
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
      
      // Second LLM call to get final response
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
    
    // No tool calls, just return the reply
    return res.status(200).json({
      reply: message.content,
      inventory: inv,
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({ error: 'Agent error', details: error.message });
  }
}