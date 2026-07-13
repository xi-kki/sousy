# 🔪 Sousy — AI Sous-Chef Voice Assistant

> Hands-free kitchen inventory management powered by voice AI. Talk to Sousy, and it tracks your ingredients, warns about expiry, and suggests dishes — all through natural conversation.

## ✨ Features

- **Voice-First Interface** — Hold Space (or tap) to talk. Sousy listens, thinks, and speaks back.
- **Kitchen Inventory** — Add, update, remove ingredients by voice. Tracks quantity, unit, category, and expiry dates.
- **Expiry Alerts** — Visual warnings for items expiring within 2 days. Sousy proactively suggests dishes to reduce waste.
- **AI-Powered Chat** — Powered by Groq (Llama 3.3 70B) for ultra-fast, natural responses.
- **Real-Time Voice** — VAD (Voice Activity Detection) for hands-free conversation. Just speak naturally.
- **Quick Actions** — One-tap buttons for common queries: check stock, see expiring items, get dish suggestions.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (Svelte 5 + TypeScript + Tailwind)    │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ VAD       │  │ Avatar   │  │ Inventory    │ │
│  │ Detection │  │ Animated │  │ Sidebar      │ │
│  └─────┬─────┘  └──────────┘  └──────────────┘ │
│        │ Audio chunks                            │
│        ▼                                         │
│  POST /api/transcribe  (Groq Whisper STT)       │
│  POST /api/chat        (Groq LLM + tools)       │
│  POST /api/tts         (Groq PlayAI TTS)        │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  Backend (Express.js)                           │
│  • /api/chat — Agent loop with tool calling     │
│    → upsert_item, consume_item, remove_item     │
│  • /api/transcribe — Whisper STT proxy          │
│  • /api/tts — PlayAI TTS proxy                  │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  Groq API (free tier)                           │
│  • STT: whisper-large-v3-turbo                  │
│  • LLM: llama-3.3-70b-versatile                 │
│  • TTS: playai-tts (Arista voice)               │
└─────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- A free Groq API key ([get one here](https://console.groq.com/keys))

### Setup

```bash
# Clone
git clone https://github.com/yourusername/sousy.git
cd sousy

# Install
npm install

# Configure
cp .env.example .env
# Edit .env and add your GROK_API_KEY

# Run
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and start talking to Sousy!

## 🎙️ Usage

1. **Tap the mic** or **hold Space** to start talking
2. Say things like:
   - *"I have 5kg salmon, expires in 3 days"*
   - *"We just used 2 bags of spinach"*
   - *"What's expiring soon?"*
   - *"Suggest a dish using what expires first"*
   - *"Remove the double cream"*
3. Sousy responds with voice and updates the inventory panel in real-time.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Svelte 5, TypeScript, Tailwind CSS, Vite |
| **UI Components** | shadcn/ui (Svelte), bits-ui |
| **Voice Detection** | @ricky0123/vad-web (Silero VAD) |
| **Backend** | Express.js, Node.js |
| **AI** | Groq API (Whisper STT, Llama 3.3 70B, PlayAI TTS) |
| **Inventory** | localStorage (client-side) |

## 📁 Project Structure

```
sousy/
├── server/
│   ├── index.js          # Express server + API routes
│   ├── tools.js          # Inventory tool definitions + executor
│   ├── prompt.js         # System prompt builder
│   └── grok.js           # Groq API client
├── src/
│   ├── app/              # App shell, layouts, main entry
│   ├── features/
│   │   └── voice-agents/ # KitchenVoiceAgent component
│   ├── lib/              # API client, inventory utils
│   └── shared/           # Components, stores, utils
├── public/               # Static assets, favicon
├── vercel.json           # Vercel deployment config
└── package.json
```

## 🚢 Deploy to Vercel

```bash
# Push to GitHub
git add -A && git commit -m "deploy: sousy v1.0" && git push

# Deploy via Vercel CLI
npx vercel --prod
```

Or connect your GitHub repo to [vercel.com](https://vercel.com) for auto-deploy.

**Important:** Set `GROK_API_KEY` in your Vercel environment variables.

## 📝 License

MIT
