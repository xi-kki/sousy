<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import SousyAvatar from '@shared/components/SousyAvatar.svelte';
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

  // Audio
  let audioStream: MediaStream | null = null;
  let vadInstance: any = null;
  let ttsAudioBuffer: any = null;
  let ttsAbortController: AbortController | null = null;

  // VAD config
  let vadLoaded = false;

  // Keyboard
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
          if (agentState === 'listening') {
            statusText = 'Hearing you...';
          }
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
    if (vadInstance) {
      vadInstance.stop().catch(() => {});
      vadInstance = null;
    }
    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      audioStream = null;
    }
    if (agentState === 'listening') {
      agentState = 'idle';
      statusText = 'Ready';
    }
  }

  function toggleMic() {
    if (agentState === 'idle') {
      startListening();
    } else if (agentState === 'listening') {
      stopListening();
    }
  }

  // ── Audio Processing Pipeline ──────────────────────────────────
  async function processAudio(audio: Float32Array) {
    agentState = 'thinking';
    statusText = 'Transcribing...';
    stopListening();

    try {
      // 1. Convert to WAV
      const wavBlob = float32ToWav(audio);

      // 2. Transcribe via server
      statusText = 'Thinking...';
      const formData = new FormData();
      formData.append('file', wavBlob, 'recording.wav');

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

      if (!spokenText?.trim()) {
        agentState = 'idle';
        statusText = 'Ready';
        return;
      }

      transcript = spokenText;

      // 3. Send to agent
      statusText = 'Thinking...';
      conversationHistory = [...conversationHistory, { role: 'user', text: spokenText }];

      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: conversationHistory, inventory }),
      });

      if (!chatRes.ok) throw new Error('Agent error');
      const result = await chatRes.json();

      // Update inventory
      inventory = result.inventory;
      saveInventory(inventory);

      // Add response to history
      conversationHistory = [...conversationHistory, { role: 'assistant', text: result.reply }];
      response = result.reply;

      // 4. Speak response
      statusText = 'Speaking...';
      agentState = 'speaking';
      await speakWithGroq(result.reply);

      // Done
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

      // Play the audio stream
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.play();
      });

    } catch (e: any) {
      if (e.name === 'AbortError') return;
      // Fallback to browser TTS
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

  $: categoryEmoji: Record<string, string> = {
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

  // ── Cleanup ────────────────────────────────────────────────────
  function cleanup() {
    stopListening();
    ttsAbortController?.abort();
  }
</script>

<div class="kitchen-agent">
  <!-- Header -->
  <header class="kitchen-header">
    <div class="header-left">
      <span class="logo">🔪</span>
      <h1>Sousy</h1>
      <span class="badge">AI Sous-Chef</span>
    </div>
    <div class="header-right">
      <button class="icon-btn" on:click={clearChat} title="Clear chat">🗑️</button>
    </div>
  </header>

  <div class="kitchen-layout">
    <!-- Main Voice Area -->
    <main class="voice-main">
      <!-- Avatar -->
      <div class="avatar-wrap">
        <SousyAvatar state={agentState} size={200} />
      </div>

      <!-- Status -->
      <p class="status-text" class:active={agentState !== 'idle'}>{statusText}</p>

      <!-- Error -->
      {#if error}
        <div class="error-banner">
          <span>⚠️</span> {error}
          <button on:click={() => error = ''}>✕</button>
        </div>
      {/if}

      <!-- Transcript -->
      {#if transcript}
        <div class="bubble user">
          <span class="bubble-label">You</span>
          {transcript}
        </div>
      {/if}

      {#if response}
        <div class="bubble assistant">
          <span class="bubble-label">Sousy</span>
          {response}
        </div>
      {/if}

      <!-- Mic Button -->
      <div class="mic-area">
        <button
          class="mic-btn"
          class:listening={agentState === 'listening'}
          class:thinking={agentState === 'thinking'}
          class:speaking={agentState === 'speaking'}
          on:click={toggleMic}
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
          {:else if agentState === 'listening'}Listening... release to stop
          {:else if agentState === 'thinking'}Processing...
          {:else}Sousy is speaking...{/if}
        </p>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <button class="action-chip" on:click={() => quickAction("What's expiring soon?")}>🗓️ Expiring</button>
        <button class="action-chip" on:click={() => quickAction("What do we have in stock?")}>📦 Stock</button>
        <button class="action-chip" on:click={() => quickAction("Suggest a dish using what expires first")}>🍳 Suggest</button>
        <button class="action-chip" on:click={() => quickAction("I just used 2kg chicken thigh")}>➖ Used</button>
      </div>
    </main>

    <!-- Inventory Sidebar -->
    <aside class="inventory-sidebar">
      <div class="sidebar-header">
        <h2>📦 Inventory</h2>
        <span class="item-count">{inventory.length} items</span>
      </div>

      {#if expiringItems.length > 0}
        <div class="expiry-alert">
          <span>⚠️</span>
          <span>{expiringItems.length} item{expiringItems.length > 1 ? 's' : ''} expiring within 2 days!</span>
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
            <p>Nothing in inventory yet.</p>
            <p class="empty-hint">Tell Sousy: "I have 5kg salmon" to add items.</p>
          </div>
        {/each}
      </div>
    </aside>
  </div>
</div>

<style>
  .kitchen-agent {
    min-height: 100vh;
    background: #0c0c14;
    color: #f0f0f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .kitchen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .header-left { display: flex; align-items: center; gap: 0.75rem; }
  .logo { font-size: 1.5rem; }
  .header-left h1 { font-size: 1.25rem; font-weight: 700; margin: 0; }
  .badge {
    font-size: 0.65rem;
    background: rgba(255,107,53,0.15);
    color: #FF6B35;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .icon-btn {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 0.5rem;
    cursor: pointer;
    font-size: 1rem;
    transition: background 0.2s;
  }
  .icon-btn:hover { background: rgba(255,255,255,0.1); }

  /* Layout */
  .kitchen-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 320px;
    overflow: hidden;
  }

  /* Main */
  .voice-main {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
    overflow-y: auto;
  }
  .avatar-wrap { margin-bottom: 1.5rem; }
  .status-text {
    font-size: 0.85rem;
    color: rgba(255,255,255,0.5);
    margin-bottom: 1rem;
    transition: color 0.3s;
  }
  .status-text.active { color: rgba(255,107,53,0.8); }

  /* Error */
  .error-banner {
    background: rgba(255,59,48,0.12);
    border: 1px solid rgba(255,59,48,0.3);
    border-radius: 10px;
    padding: 0.6rem 1rem;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    max-width: 500px;
    width: 100%;
  }
  .error-banner button {
    margin-left: auto;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    opacity: 0.6;
  }

  /* Bubbles */
  .bubble {
    max-width: 500px;
    width: 100%;
    border-radius: 14px;
    padding: 0.8rem 1rem;
    margin-bottom: 0.75rem;
    line-height: 1.5;
    animation: fadeSlideIn 0.25s ease;
  }
  .bubble-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.5;
    display: block;
    margin-bottom: 0.2rem;
  }
  .bubble.user {
    background: rgba(108,92,231,0.12);
    border: 1px solid rgba(108,92,231,0.2);
  }
  .bubble.assistant {
    background: rgba(255,107,53,0.12);
    border: 1px solid rgba(255,107,53,0.2);
  }

  /* Mic */
  .mic-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin: 1.5rem 0;
  }
  .mic-btn {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, #FF6B35, #FF8C5A);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: all 0.25s ease;
    box-shadow: 0 4px 20px rgba(255,107,53,0.35);
  }
  .mic-btn:hover:not(:disabled) { transform: scale(1.06); box-shadow: 0 6px 30px rgba(255,107,53,0.45); }
  .mic-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .mic-btn.listening { background: linear-gradient(135deg, #00D4AA, #00F5C4); box-shadow: 0 4px 30px rgba(0,212,170,0.4); animation: pulse 1.4s infinite; }
  .mic-btn.thinking { background: linear-gradient(135deg, #FFD93D, #FFE566); box-shadow: 0 4px 20px rgba(255,217,61,0.3); }
  .mic-btn.speaking { background: linear-gradient(135deg, #6C5CE7, #A29BFE); box-shadow: 0 4px 30px rgba(108,92,231,0.4); }

  .mic-btn svg { width: 28px; height: 28px; }

  .pulse-ring {
    position: absolute;
    width: 100%; height: 100%;
    border-radius: 50%;
    border: 2px solid currentColor;
    animation: pulseRing 1.4s infinite;
  }
  .spinner {
    width: 22px; height: 22px;
    border: 3px solid rgba(0,0,0,0.15);
    border-top-color: #333;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  .sound-waves { display: flex; gap: 3px; align-items: center; }
  .sound-waves span {
    width: 3px;
    background: white;
    border-radius: 2px;
    animation: wave 0.5s ease-in-out infinite;
  }
  .sound-waves span:nth-child(1) { height: 10px; animation-delay: 0s; }
  .sound-waves span:nth-child(2) { height: 16px; animation-delay: 0.1s; }
  .sound-waves span:nth-child(3) { height: 12px; animation-delay: 0.2s; }

  .mic-hint {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.4);
    text-align: center;
  }
  .mic-hint kbd {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px;
    padding: 0.1em 0.4em;
    font-family: inherit;
    font-size: 0.85em;
  }

  /* Quick Actions */
  .quick-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 0.5rem;
  }
  .action-chip {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    padding: 0.45rem 0.9rem;
    color: rgba(255,255,255,0.8);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  .action-chip:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,107,53,0.3); }

  /* Inventory Sidebar */
  .inventory-sidebar {
    background: rgba(255,255,255,0.02);
    border-left: 1px solid rgba(255,255,255,0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .sidebar-header h2 { font-size: 0.95rem; font-weight: 600; margin: 0; }
  .item-count { font-size: 0.75rem; color: rgba(255,255,255,0.4); }

  .expiry-alert {
    background: rgba(255,204,0,0.1);
    border-bottom: 1px solid rgba(255,204,0,0.15);
    padding: 0.6rem 1.25rem;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #FFD93D;
  }

  .inventory-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
  }
  .inv-item {
    padding: 0.65rem 0.75rem;
    border-radius: 8px;
    margin-bottom: 0.35rem;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .inv-item:hover { background: rgba(255,255,255,0.04); }
  .inv-item.expiring { border-left: 3px solid #FFD93D; }
  .inv-item.expired { border-left: 3px solid #FF3B30; }

  .inv-main { display: flex; align-items: center; gap: 0.6rem; }
  .inv-emoji { font-size: 1.2rem; }
  .inv-info { display: flex; flex-direction: column; }
  .inv-name { font-size: 0.85rem; font-weight: 500; text-transform: capitalize; }
  .inv-qty { font-size: 0.75rem; color: rgba(255,255,255,0.45); }

  .inv-expiry {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.4);
    white-space: nowrap;
  }
  .inv-expiry.urgent { color: #FF6B35; font-weight: 600; }

  .empty-state {
    text-align: center;
    padding: 2rem 1rem;
    color: rgba(255,255,255,0.3);
  }
  .empty-state p { margin: 0 0 0.5rem; }
  .empty-hint { font-size: 0.8rem; font-style: italic; }

  /* Animations */
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
  }
  @keyframes pulseRing {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.6); opacity: 0; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes wave {
    0%, 100% { transform: scaleY(0.4); }
    50% { transform: scaleY(1); }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .kitchen-layout {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }
    .inventory-sidebar {
      border-left: none;
      border-top: 1px solid rgba(255,255,255,0.06);
      max-height: 35vh;
    }
    .voice-main { padding: 1.5rem 1rem; }
  }
</style>
