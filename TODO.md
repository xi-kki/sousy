# Sousy — Production Sprint Plan
> Target: 45% → 100% | Started: 2026-07-13

---

## Phase 1: Server API Endpoints ✅ DONE (~5 min)
- [x] `POST /api/transcribe` — Groq Whisper STT
- [x] `POST /api/tts` — Groq PlayAI TTS
- [x] `/api/chat` already existed — inventory tools work

## Phase 2: Kitchen Voice Agent ✅ DONE (~10 min)
- [x] Built `KitchenVoiceAgent.svelte` — VAD + Groq STT/TTS + inventory tools
- [x] Integrated with server `/api/transcribe`, `/api/chat`, `/api/tts`
- [x] Inventory sidebar with expiry warnings
- [x] Quick actions (expiring, stock, suggest, used)
- [x] Keyboard shortcut (Space = hold to talk)
- [x] Updated App.svelte to use new component
- [x] Cleaned up index.css (old Eclipse theme → kitchen theme)

## Phase 3: UI Polish & Deploy Config (~15 min) — ⬅️ DOING NOW
- [x] Favicon added
- [x] Responsive layout (desktop + mobile)
- [ ] Update `vercel.json` for serverless
- [ ] Test build (skip if slow — move on)
- [ ] Push to GitHub
- [ ] Deploy to Vercel

## Phase 4: README & Docs (~10 min) — 🔜 NEXT
- [ ] Write README.md (setup, features, architecture, deploy)
- [ ] Update .env.example
- [ ] Update .gitignore

## Phase 5: Memory Update & Ship (~5 min) — 🔜 LAST
- [ ] Update project memory to 100%
- [ ] Git commit + push
- [ ] Final status update

---

**Time spent:** ~15 min
**Time remaining:** ~45 min
**On track:** Yes ✅
