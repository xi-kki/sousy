# 🔪 SOUS — voice line cook, zero-waste

A hands-free voice AI agent for commercial kitchens. Cooks have full/dirty hands, so
inventory never gets logged — and food **rots in the walk-in**. Sous lets you just *say*
what changed ("six crates of tomatoes came in, expire Friday" / "used two kilos of chicken"),
keeps a live count, and shouts about anything expiring in the next 48h so you cook it
before you bin it.

**Voice is the right modality here** — that's why this is a voice agent, not an app.

## Stack
- **Brain:** xAI **Grok** (function-calling drives inventory updates) via a small Express proxy
  so your API key stays server-side and never reaches the browser.
- **Ears + Voice:** browser **Web Speech API** (STT + TTS) — no extra keys, real push-to-talk.
- **UI:** the **Eclipse** design system (black/white + electric-mint glow, high-contrast for the line).
- **Front end:** Vite + React + TypeScript + Tailwind v4.

## Run it
1. `npm install`
2. `cp .env.example .env` and paste your xAI key (`GROK_API_KEY`). Get one at https://console.x.ai
3. `npm run dev` — starts the Grok proxy (3001) **and** the web app (3000).
4. Open **http://localhost:3000** in **Chrome or Edge** (best Web Speech support).
   Hold the mic button, talk, release. Or type in the box.

Inventory persists in your browser (localStorage) and is seeded with a sample pantry.

## Try saying
- "We just got six crates of tomatoes, they expire in two days."
- "What should I use first?"
- "Used two kilos of chicken thigh."
- "Throw out the spinach, it's gone."

## Notes
- Default model is `grok-4` (override with `GROK_MODEL` in `.env`).
- No key yet? The UI still runs; the agent call will return a clear error until you add one.
