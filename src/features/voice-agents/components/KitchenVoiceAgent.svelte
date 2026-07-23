<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { AgentState, InventoryItem } from '../../../types';
  import { loadInventory, saveInventory, seedInventory } from '@lib/inventory';

  // ── State ──────────────────────────────────────────────────────
  let agentState: AgentState = 'idle';
  let transcript = '';
  let response = '';
  let inventory: InventoryItem[] = [];
  let conversationHistory: Array<{ role: string; text: string }> = [];
  let error = '';
  let statusText = 'Ready';
  let showInventory = false;

  // Audio
  let audioStream: MediaStream | null = null;
  let vadInstance: any = null;
  let ttsAbortController: AbortController | null = null;
  let vadLoaded = false;
  let spaceHeld = false;

  // ── Lifecycle ──────────────────────────────────────────────────
  onMount(() => {
    inventory = loadInventory();
    loadVADScripts();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  });

  onDestroy(() => {
    cleanup();
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });

  // ── Keyboard ───────────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' && !e.repeat && agentState === 'idle') {
      e.preventDefault();
      spaceHeld = true;
      startListening();
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space' && spaceHeld) {
      e.preventDefault();
      spaceHeld = false;
      stopListening();
    }
  }

  // ── VAD Scripts ────────────────────────────────────────────────
  async function loadVADScripts() {
    if (vadLoaded || typeof (window as any).vad !== 'undefined') {
      vadLoaded = true;
      return;
    }
    try {
      const onnxScript = document.createElement('script');
      onnxScript.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.0/dist/ort.min.js';
      document.head.appendChild(onnxScript);
      await new Promise<void>(r => { onnxScript.onload = () => r(); });

      const vadScript = document.createElement('script');
      vadScript.src = 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.12/dist/bundle.min.js';
      document.head.appendChild(vadScript);
      await new Promise<void>(r => { vadScript.onload = () => r(); });

      vadLoaded = true;
    } catch (e) {
      console.error('Failed to load VAD:', e);
      error = 'Failed to load voice detection. Please refresh.';
    }
  }

  // ── Voice Control ──────────────────────────────────────────────
  async function startListening() {
    if (agentState !== 'idle') return;
    error = '';
    transcript = '';
    response = '';

    try {
      agentState = 'listening';
      statusText = 'Listening...';

      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      vadInstance = await (window as any).vad.MicVAD.new({
        stream: audioStream,
        onSpeechStart: () => {
          if (agentState === 'listening') statusText = 'Hearing you...';
        },
        onSpeechEnd: async (audio: Float32Array) => {
          if (agentState !== 'listening' && agentState !== 'thinking') return;
          await processAudio(audio);
        },
        positiveSpeechThreshold: 0.7,
        negativeSpeechThreshold: 0.5,
        minSpeechFrames: 4,
        redemptionFrames: 8,
        modelUrl: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.12/dist/silero_vad.onnx',
        workletUrl: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.12/dist/vad.worklet.bundle.min.js',
      });

      await vadInstance.start();
    } catch (e: any) {
      console.error('Mic error:', e);
      error = e.message || 'Microphone access denied';
      agentState = 'idle';
      statusText = 'Ready';
    }
  }

  function stopListening() {
    if (vadInstance) { vadInstance.stop().catch(() => {}); vadInstance = null; }
    if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null; }
    if (agentState === 'listening') { agentState = 'idle'; statusText = 'Ready'; }
  }

  function toggleMic() {
    if (agentState === 'idle') startListening();
    else if (agentState === 'listening') stopListening();
  }

  // ── Audio Processing Pipeline ──────────────────────────────────
  async function processAudio(audio: Float32Array) {
    agentState = 'thinking';
    statusText = 'Transcribing...';
    stopListening();

    try {
      const wavBlob = float32ToWav(audio);
      statusText = 'Thinking...';

      const sttRes = await fetch('/api/transcribe', {
        method: 'POST',
        body: (() => {
          const fd = new FormData();
          fd.append('file', wavBlob, 'recording.wav');
          return fd;
        })(),
      });

      if (!sttRes.ok) throw new Error('Transcription failed');
      const { text: spokenText } = await sttRes.json();

      if (!spokenText?.trim()) { agentState = 'idle'; statusText = 'Ready'; return; }

      transcript = spokenText;
      statusText = 'Thinking...';
      conversationHistory = [...conversationHistory, { role: 'user', text: spokenText }];

      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: conversationHistory, inventory }),
      });

      if (!chatRes.ok) throw new Error('Agent error');
      const result = await chatRes.json();

      inventory = result.inventory;
      saveInventory(inventory);
      conversationHistory = [...conversationHistory, { role: 'assistant', text: result.reply }];
      response = result.reply;

      statusText = 'Speaking...';
      agentState = 'speaking';
      await speakWithGroq(result.reply);

      agentState = 'idle';
      statusText = 'Ready';
      transcript = '';
      response = '';

    } catch (e: any) {
      console.error('Pipeline error:', e);
      error = e.message || 'Something went wrong';
      agentState = 'idle';
      statusText = 'Ready';
    }
  }

  // ── TTS via Groq ──────────────────────────────────────────────
  async function speakWithGroq(text: string) {
    ttsAbortController?.abort();
    ttsAbortController = new AbortController();

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'Arista-PlayAI' }),
        signal: ttsAbortController.signal,
      });

      if (!res.ok) throw new Error('TTS failed');
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(audioUrl); resolve(); };
        audio.play();
      });

    } catch (e: any) {
      if (e.name === 'AbortError') return;
      await speakWithBrowser(text);
    }
  }

  async function speakWithBrowser(text: string): Promise<void> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) { resolve(); return; }
      synth.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 1.0;
      utt.onend = () => resolve();
      utt.onerror = () => resolve();
      synth.speak(utt);
    });
  }

  // ── Quick Actions ──────────────────────────────────────────────
  async function quickAction(text: string) {
    if (agentState !== 'idle') return;
    agentState = 'thinking';
    statusText = 'Thinking...';

    try {
      conversationHistory = [...conversationHistory, { role: 'user', text }];
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: conversationHistory, inventory }),
      });

      if (!chatRes.ok) throw new Error('Agent error');
      const result = await chatRes.json();

      inventory = result.inventory;
      saveInventory(inventory);
      conversationHistory = [...conversationHistory, { role: 'assistant', text: result.reply }];
      response = result.reply;
      transcript = text;

      agentState = 'speaking';
      statusText = 'Speaking...';
      await speakWithGroq(result.reply);

      agentState = 'idle';
      statusText = 'Ready';
      transcript = '';
      response = '';

    } catch (e: any) {
      error = e.message || 'Action failed';
      agentState = 'idle';
      statusText = 'Ready';
    }
  }

  function clearChat() {
    conversationHistory = [];
    transcript = '';
    response = '';
    error = '';
  }

  // ── Inventory Helpers ──────────────────────────────────────────
  function daysUntil(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const now = new Date();
    const target = new Date(dateStr);
    return Math.ceil((target.getTime() - now.getTime()) / 86400000);
  }

  $: expiringItems = inventory
    .filter(item => {
      const days = daysUntil(item.expiresOn);
      return days !== null && days <= 3;
    })
    .sort((a, b) => (daysUntil(a.expiresOn) || 999) - (daysUntil(b.expiresOn) || 999));

  const categoryEmoji: Record<string, string> = {
    produce: '🥬', protein: '🥩', dairy: '🧀', dry: '🌾', frozen: '🧊', other: '📦',
  };

  // ── WAV Conversion ─────────────────────────────────────────────
  function float32ToWav(audio: Float32Array): Blob {
    const sampleRate = 16000;
    const buffer = new ArrayBuffer(44 + audio.length * 2);
    const view = new DataView(buffer);
    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + audio.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, audio.length * 2, true);

    for (let i = 0; i < audio.length; i++) {
      const s = Math.max(-1, Math.min(1, audio[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  function cleanup() {
    stopListening();
    ttsAbortController?.abort();
  }
</script>

<div class="sousy-app">
  <!-- Header -->
  <header class="sousy-header">
    <div class="header-left">
      <div class="logo-mark">
        <svg viewBox="0 0 280 90" fill="none" class="logo-svg">
          <path d="M20 10L16 45L12 80L20 76L28 80L24 45L20 10Z" fill="var(--sousy-orange)" fill-rule="evenodd" />
          <text x="45" y="62" font-family="Inter Tight, sans-serif" font-weight="600" font-size="52" fill="white" letter-spacing="-0.04em">SOUSY</text>
        </svg>
      </div>
      <span class="badge">AI SOUS-CHEF</span>
    </div>
    <div class="header-right">
      <button class="icon-btn" onclick={clearChat} title="Clear chat">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      </button>
      <button class="icon-btn mobile-inventory-toggle" onclick={() => showInventory = !showInventory} title="Toggle inventory">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
      </button>
    </div>
  </header>

  <div class="sousy-layout" class:inventory-open={showInventory}>
    <!-- Main Voice Area -->
    <main class="voice-main">
      <!-- Avatar placeholder -->
      <div class="avatar-wrap">
        <div class="avatar-placeholder">
          <span class="avatar-state">{statusText}</span>
        </div>
      </div>

      <!-- Status -->
      <p class="status-text" class:active={agentState !== 'idle'}>{statusText}</p>

      <!-- Error -->
      {#if error}
        <div class="error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          {error}
          <button onclick={() => error = ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      {/if}

      <!-- Transcript / Response -->
      <div class="chat-area">
        {#if transcript}
          <div class="bubble user">
            <span class="bubble-label">YOU</span>
            {transcript}
          </div>
        {/if}
        {#if response}
          <div class="bubble assistant">
            <span class="bubble-label">SOUSY</span>
            {response}
          </div>
        {/if}
      </div>

      <!-- Mic Button -->
      <div class="mic-area">
        <button
          class="mic-btn"
          class:listening={agentState === 'listening'}
          class:thinking={agentState === 'thinking'}
          class:speaking={agentState === 'speaking'}
          onclick={toggleMic}
          disabled={agentState === 'thinking' || agentState === 'speaking'}
          aria-label="Toggle microphone"
        >
          {#if agentState === 'idle'}
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
          {:else if agentState === 'listening'}
            <div class="pulse-ring" />
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
          {:else if agentState === 'thinking'}
            <div class="spinner" />
          {:else if agentState === 'speaking'}
            <div class="sound-waves"><span /><span /><span /></div>
          {/if}
        </button>
        <p class="mic-hint">
          {#if agentState === 'idle'}Hold <kbd>Space</kbd> or tap to talk
          {:else if agentState === 'listening'}Listening...
          {:else if agentState === 'thinking'}Processing...
          {:else}Sousy is speaking...{/if}
        </p>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <button class="action-chip" onclick={() => quickAction("What's expiring soon?")}>🗓️ Expiring</button>
        <button class="action-chip" onclick={() => quickAction("What do we have in stock?")}>📦 Stock</button>
        <button class="action-chip" onclick={() => quickAction("Suggest a dish using what expires first")}>🍳 Suggest</button>
        <button class="action-chip" onclick={() => quickAction("I just used 2kg chicken thigh")}>➖ Used</button>
      </div>
    </main>

    <!-- Inventory Sidebar -->
    <aside class="inventory-sidebar" class:show={showInventory}>
      <div class="sidebar-header">
        <h2>📦 Inventory</h2>
        <span class="item-count">{inventory.length} items</span>
      </div>

      {#if expiringItems.length > 0}
        <div class="expiry-alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4m0 4h.01"/></svg>
          <span>{expiringItems.length} item{expiringItems.length > 1 ? 's' : ''} expiring soon</span>
        </div>
      {/if}

      <div class="inventory-list">
        {#each inventory as item}
          {@const days = daysUntil(item.expiresOn)}
          <div class="inv-item" class:expiring={days !== null && days <= 2} class:expired={days !== null && days <= 0}>
            <div class="inv-main">
              <span class="inv-emoji">{categoryEmoji[item.category] || '📦'}</span>
              <div class="inv-info">
                <span class="inv-name">{item.name}</span>
                <span class="inv-qty">{item.quantity} {item.unit}</span>
              </div>
            </div>
            {#if days !== null}
              <span class="inv-expiry" class:urgent={days <= 1}>
                {days <= 0 ? '⚠️ Expired' : days === 1 ? '⏰ Tomorrow' : `${days}d left`}
              </span>
            {/if}
          </div>
        {:else}
          <div class="empty-state">
            <div class="empty-icon">📦</div>
            <p>Nothing in inventory yet.</p>
            <p class="empty-hint">Say: "I have 5kg salmon" to add items.</p>
          </div>
        {/each}
      </div>
    </aside>
  </div>
</div>

<style>
  /* ── Theme Variables ── */
  :root {
    --sousy-orange: #FF8C00;
    --sousy-orange-light: #FFa033;
    --sousy-orange-glow: rgba(255, 140, 0, 0.3);
    --sousy-green: #00D4AA;
    --sousy-purple: #6C5CE7;
    --sousy-yellow: #FFD93D;
    --sousy-red: #FF3B30;
    --sousy-bg: #0c0c14;
    --sousy-surface: rgba(255,255,255,0.04);
    --sousy-border: rgba(255,255,255,0.08);
    --sousy-text: #f0f0f0;
    --sousy-text-dim: rgba(255,255,255,0.5);
    --sousy-text-muted: rgba(255,255,255,0.3);
  }

  .sousy-app {
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--sousy-bg);
    color: var(--sousy-text);
    font-family: 'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Header ── */
  .sousy-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--sousy-surface);
    border-bottom: 1px solid var(--sousy-border);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    position: relative;
    z-index: 20;
  }
  .header-left { display: flex; align-items: center; gap: 0.75rem; }
  .logo-mark { width: 100px; }
  .logo-svg { width: 100%; height: auto; }
  .badge {
    font-size: 0.6rem;
    background: rgba(255,140,0,0.15);
    color: var(--sousy-orange);
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border: 1px solid rgba(255,140,0,0.2);
  }
  .header-right { display: flex; gap: 0.5rem; }
  .icon-btn {
    background: var(--sousy-surface);
    border: 1px solid var(--sousy-border);
    border-radius: 10px;
    padding: 0.5rem;
    cursor: pointer;
    color: var(--sousy-text-dim);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn:hover { background: rgba(255,255,255,0.08); color: white; }
  .mobile-inventory-toggle { display: none; }

  /* ── Layout ── */
  .sousy-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 340px;
    overflow: hidden;
    position: relative;
  }

  /* ── Main ── */
  .voice-main {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem 1rem;
    overflow-y: auto;
    position: relative;
  }
  .avatar-wrap {
    margin-bottom: 1rem;
    position: relative;
  }
  .avatar-wrap::after {
    content: '';
    position: absolute;
    inset: -20px;
    background: radial-gradient(circle, var(--sousy-orange-glow) 0%, transparent 70%);
    opacity: 0.3;
    pointer-events: none;
    z-index: -1;
  }
  .avatar-placeholder {
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--sousy-orange), var(--sousy-orange-light));
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 40px var(--sousy-orange-glow);
  }
  .avatar-state {
    font-size: 0.9rem;
    font-weight: 600;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .status-text {
    font-size: 0.8rem;
    color: var(--sousy-text-muted);
    margin-bottom: 0.75rem;
    transition: color 0.3s;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 500;
  }
  .status-text.active { color: var(--sousy-orange); }

  /* ── Error ── */
  .error-banner {
    background: rgba(255,59,48,0.1);
    border: 1px solid rgba(255,59,48,0.25);
    border-radius: 12px;
    padding: 0.6rem 1rem;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    max-width: 400px;
    width: 100%;
    color: #ff6b6b;
  }
  .error-banner button {
    margin-left: auto;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.6;
    padding: 4px;
  }
  .error-banner button:hover { opacity: 1; }

  /* ── Chat Area ── */
  .chat-area {
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .bubble {
    border-radius: 16px;
    padding: 0.8rem 1rem;
    line-height: 1.5;
    animation: fadeSlideIn 0.25s ease;
    font-size: 0.9rem;
  }
  .bubble-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.4;
    display: block;
    margin-bottom: 0.3rem;
    font-weight: 600;
  }
  .bubble.user {
    background: rgba(108,92,231,0.1);
    border: 1px solid rgba(108,92,231,0.2);
    border-bottom-right-radius: 4px;
  }
  .bubble.assistant {
    background: rgba(255,140,0,0.1);
    border: 1px solid rgba(255,140,0,0.2);
    border-bottom-left-radius: 4px;
  }

  /* ── Mic ── */
  .mic-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .mic-btn {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, var(--sousy-orange), var(--sousy-orange-light));
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 24px var(--sousy-orange-glow);
  }
  .mic-btn:hover:not(:disabled) {
    transform: scale(1.08);
    box-shadow: 0 8px 40px rgba(255,140,0,0.5);
  }
  .mic-btn:active:not(:disabled) { transform: scale(0.96); }
  .mic-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .mic-btn.listening {
    background: linear-gradient(135deg, var(--sousy-green), #00f5c4);
    box-shadow: 0 4px 40px rgba(0,212,170,0.4);
    animation: pulse 1.5s ease-in-out infinite;
  }
  .mic-btn.thinking {
    background: linear-gradient(135deg, var(--sousy-yellow), #ffe566);
    box-shadow: 0 4px 24px rgba(255,217,61,0.3);
  }
  .mic-btn.speaking {
    background: linear-gradient(135deg, var(--sousy-purple), #a29bfe);
    box-shadow: 0 4px 40px rgba(108,92,231,0.4);
  }

  .mic-btn svg { width: 32px; height: 32px; }

  .pulse-ring {
    position: absolute;
    width: 100%; height: 100%;
    border-radius: 50%;
    border: 2px solid currentColor;
    animation: pulseRing 1.5s infinite;
  }
  .spinner {
    width: 24px; height: 24px;
    border: 3px solid rgba(0,0,0,0.15);
    border-top-color: #333;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  .sound-waves { display: flex; gap: 4px; align-items: center; }
  .sound-waves span {
    width: 4px;
    background: white;
    border-radius: 2px;
    animation: wave 0.6s ease-in-out infinite;
  }
  .sound-waves span:nth-child(1) { height: 12px; animation-delay: 0s; }
  .sound-waves span:nth-child(2) { height: 20px; animation-delay: 0.15s; }
  .sound-waves span:nth-child(3) { height: 14px; animation-delay: 0.3s; }

  .mic-hint {
    font-size: 0.75rem;
    color: var(--sousy-text-muted);
    text-align: center;
    font-weight: 500;
  }
  .mic-hint kbd {
    background: var(--sousy-surface);
    border: 1px solid var(--sousy-border);
    border-radius: 4px;
    padding: 0.15em 0.5em;
    font-family: inherit;
    font-size: 0.9em;
  }

  /* ── Quick Actions ── */
  .quick-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 480px;
  }
  .action-chip {
    background: var(--sousy-surface);
    border: 1px solid var(--sousy-border);
    border-radius: 24px;
    padding: 0.5rem 1rem;
    color: var(--sousy-text-dim);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
    white-space: nowrap;
  }
  .action-chip:hover {
    background: rgba(255,140,0,0.1);
    border-color: rgba(255,140,0,0.3);
    color: white;
  }

  /* ── Inventory Sidebar ── */
  .inventory-sidebar {
    background: rgba(255,255,255,0.02);
    border-left: 1px solid var(--sousy-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--sousy-border);
  }
  .sidebar-header h2 {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0;
  }
  .item-count {
    font-size: 0.7rem;
    color: var(--sousy-text-muted);
    background: var(--sousy-surface);
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
  }

  .expiry-alert {
    background: rgba(255,204,0,0.08);
    border-bottom: 1px solid rgba(255,204,0,0.15);
    padding: 0.6rem 1.25rem;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--sousy-yellow);
  }

  .inventory-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
  }
  .inv-item {
    padding: 0.7rem 0.75rem;
    border-radius: 10px;
    margin-bottom: 0.35rem;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-left: 3px solid transparent;
  }
  .inv-item:hover { background: var(--sousy-surface); }
  .inv-item.expiring { border-left-color: var(--sousy-yellow); }
  .inv-item.expired { border-left-color: var(--sousy-red); }

  .inv-main { display: flex; align-items: center; gap: 0.6rem; }
  .inv-emoji { font-size: 1.2rem; }
  .inv-info { display: flex; flex-direction: column; }
  .inv-name { font-size: 0.85rem; font-weight: 500; text-transform: capitalize; }
  .inv-qty { font-size: 0.7rem; color: var(--sousy-text-muted); }

  .inv-expiry {
    font-size: 0.65rem;
    color: var(--sousy-text-muted);
    white-space: nowrap;
  }
  .inv-expiry.urgent { color: var(--sousy-orange); font-weight: 600; }

  .empty-state {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--sousy-text-muted);
  }
  .empty-icon { font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5; }
  .empty-state p { margin: 0 0 0.5rem; font-size: 0.85rem; }
  .empty-hint { font-size: 0.75rem; font-style: italic; }

  /* ── Animations ── */
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  @keyframes pulseRing {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.8); opacity: 0; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes wave {
    0%, 100% { transform: scaleY(0.4); }
    50% { transform: scaleY(1); }
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .sousy-layout {
      grid-template-columns: 1fr;
    }
    .inventory-sidebar {
      position: fixed;
      inset: 0;
      top: 53px;
      z-index: 15;
      border-left: none;
      background: var(--sousy-bg);
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .inventory-sidebar.show {
      transform: translateX(0);
    }
    .mobile-inventory-toggle { display: flex; }
    .voice-main { padding: 1rem; }
    .mic-btn { width: 72px; height: 72px; }
    .mic-btn svg { width: 28px; height: 28px; }
    .logo-mark { width: 80px; }
  }
</style>
