<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { sendToAgent } from '@lib/api';
  import { loadInventory, saveInventory, seedInventory } from '@lib/inventory';
  import type { AgentState, ChatTurn, InventoryItem } from '../../types';
  
  // State
  let agentState: AgentState = 'idle';
  let transcript = '';
  let response = '';
  let inventory: InventoryItem[] = [];
  let conversationHistory: ChatTurn[] = [];
  let error = '';
  let isSupported = false;
  
  // Speech recognition
  let recognition: any = null;
  let synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
  
  // Audio context for visualization
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let animationFrame: number;
  
  onMount(() => {
    // Load inventory
    inventory = loadInventory();
    
    // Check speech support
    const w = window as any;
    isSupported = Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
    
    if (isSupported) {
      initSpeechRecognition();
    }
  });
  
  onDestroy(() => {
    if (recognition) {
      try { recognition.stop(); } catch {}
    }
    if (synthesis) {
      synthesis.cancel();
    }
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });
  
  function initSpeechRecognition() {
    const w = window as any;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      agentState = 'listening';
      transcript = '';
    };
    
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      
      transcript = finalTranscript || interimTranscript;
    };
    
    recognition.onend = async () => {
      if (transcript.trim()) {
        await processUserInput(transcript.trim());
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        error = `Speech error: ${event.error}`;
      }
      agentState = 'idle';
    };
  }
  
  async function processUserInput(text: string) {
    agentState = 'thinking';
    
    try {
      // Add user message to history
      conversationHistory = [...conversationHistory, { role: 'user', text }];
      
      // Send to backend agent
      const result = await sendToAgent(conversationHistory, inventory);
      
      // Update inventory from backend
      inventory = result.inventory;
      saveInventory(inventory);
      
      // Add assistant response to history
      conversationHistory = [...conversationHistory, { role: 'assistant', text: result.reply }];
      
      response = result.reply;
      
      // Speak the response
      await speakResponse(result.reply);
      
    } catch (err: any) {
      console.error('Agent error:', err);
      error = err.message || 'Something went wrong';
      agentState = 'idle';
    }
  }
  
  async function speakResponse(text: string) {
    return new Promise<void>((resolve) => {
      if (!synthesis) {
        agentState = 'idle';
        resolve();
        return;
      }
      
      synthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      // Pick a nice voice
      const voices = synthesis.getVoices();
      const preferred = voices.find(v => 
        /en-US/.test(v.lang) && /Google|Samantha|Alex|Daniel/.test(v.name)
      ) || voices.find(v => v.lang.startsWith('en'));
      
      if (preferred) utterance.voice = preferred;
      
      utterance.onstart = () => {
        agentState = 'speaking';
      };
      
      utterance.onend = () => {
        agentState = 'idle';
        response = '';
        resolve();
      };
      
      utterance.onerror = () => {
        agentState = 'idle';
        resolve();
      };
      
      synthesis.speak(utterance);
    });
  }
  
  function startListening() {
    if (!recognition) return;
    
    error = '';
    transcript = '';
    
    try {
      recognition.start();
    } catch (e) {
      // Already started
    }
  }
  
  function stopListening() {
    if (!recognition) return;
    
    try {
      recognition.stop();
    } catch {}
    
    agentState = 'idle';
  }
  
  function toggleListening() {
    if (agentState === 'listening') {
      stopListening();
    } else if (agentState === 'idle') {
      startListening();
    }
  }
  
  // Expiry helpers
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
</script>

<div class="voice-agent">
  <!-- Avatar Section -->
  <div class="avatar-section">
    <div class="avatar-placeholder">
      <span class="avatar-state">{statusText}</span>
    </div>
  </div>
  
  <!-- Status Section -->
  <div class="status-section">
    {#if error}
      <div class="error-banner">
        <span class="error-icon">⚠️</span>
        {error}
        <button on:click={() => error = ''} class="dismiss-btn">✕</button>
      </div>
    {/if}
    
    {#if transcript}
      <div class="transcript-bubble user">
        <span class="label">You said:</span>
        {transcript}
      </div>
    {/if}
    
    {#if response}
      <div class="transcript-bubble assistant">
        <span class="label">Sousy:</span>
        {response}
      </div>
    {/if}
  </div>
  
  <!-- Control Button -->
  <div class="controls">
    {#if !isSupported}
      <div class="unsupported">
        Voice input not supported in this browser. Try Chrome or Edge.
      </div>
    {:else}
      <button 
        class="mic-button"
        class:listening={agentState === 'listening'}
        class:thinking={agentState === 'thinking'}
        class:speaking={agentState === 'speaking'}
        on:click={toggleListening}
        disabled={agentState === 'thinking' || agentState === 'speaking'}
      >
        {#if agentState === 'idle'}
          <svg viewBox="0 0 24 24" fill="currentColor" class="mic-icon">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        {:else if agentState === 'listening'}
          <div class="pulse-ring" />
          <svg viewBox="0 0 24 24" fill="currentColor" class="mic-icon">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        {:else if agentState === 'thinking'}
          <div class="spinner" />
        {:else if agentState === 'speaking'}
          <div class="sound-waves">
            <span /><span /><span />
          </div>
        {/if}
      </button>
      
      <p class="instruction">
        {#if agentState === 'idle'}
          Tap to start talking
        {:else if agentState === 'listening'}
          Listening... tap to stop
        {:else if agentState === 'thinking'}
          Processing...
        {:else if agentState === 'speaking'}
          Sousy is speaking...
        {/if}
      </p>
    {/if}
  </div>
  
  <!-- Quick Actions -->
  <div class="quick-actions">
    <button class="action-btn" on:click={() => processUserInput("What's expiring soon?")}>
      🗓️ Expiring Soon
    </button>
    <button class="action-btn" on:click={() => processUserInput("What do we have in stock?")}>
      📦 Check Stock
    </button>
    <button class="action-btn" on:click={() => processUserInput("Clear conversation")}>
      🗑️ Clear Chat
    </button>
  </div>
  
  <!-- Inventory Sidebar -->
  <div class="inventory-panel">
    <h3>Kitchen Inventory</h3>
    
    {#if expiringItems.length > 0}
      <div class="expiry-alert">
        <span class="alert-icon">⚠️</span>
        <span>{expiringItems.length} item{expiringItems.length > 1 ? 's' : ''} expiring soon!</span>
      </div>
    {/if}
    
    <div class="inventory-list">
      {#each inventory as item}
        <div class="inventory-item" class:expiring={daysUntil(item.expiresOn) !== null && daysUntil(item.expiresOn) <= 2}>
          <div class="item-main">
            <span class="item-name">{item.name}</span>
            <span class="item-qty">{item.quantity} {item.unit}</span>
          </div>
          <div class="item-meta">
            <span class="item-category">{item.category}</span>
            {#if item.expiresOn}
              <span class="item-expiry" class:urgent={daysUntil(item.expiresOn) <= 1}>
                {daysUntil(item.expiresOn) <= 0 ? 'Expired!' : `${daysUntil(item.expiresOn)}d left`}
              </span>
            {/if}
          </div>
        </div>
      {/each}
      
      {#if inventory.length === 0}
        <p class="empty-state">No items in inventory. Tell Sousy what you have!</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .voice-agent {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    padding: 2rem;
    background: linear-gradient(180deg, #0a0a0f 0%, #1a1a2e 100%);
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  
  .avatar-section {
    margin-bottom: 2rem;
  }
  
  .status-section {
    width: 100%;
    max-width: 500px;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .error-banner {
    background: rgba(255, 59, 48, 0.2);
    border: 1px solid rgba(255, 59, 48, 0.4);
    border-radius: 12px;
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    width: 100%;
  }
  
  .dismiss-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    opacity: 0.7;
  }
  
  .dismiss-btn:hover {
    opacity: 1;
  }
  
  .transcript-bubble {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 1rem 1.25rem;
    max-width: 100%;
    line-height: 1.5;
    animation: fadeIn 0.3s ease;
  }
  
  .transcript-bubble.user {
    background: rgba(108, 92, 231, 0.2);
    border: 1px solid rgba(108, 92, 231, 0.3);
  }
  
  .transcript-bubble.assistant {
    background: rgba(255, 107, 53, 0.2);
    border: 1px solid rgba(255, 107, 53, 0.3);
  }
  
  .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
    display: block;
    margin-bottom: 0.25rem;
  }
  
  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .unsupported {
    background: rgba(255, 59, 48, 0.1);
    border: 1px solid rgba(255, 59, 48, 0.3);
    border-radius: 12px;
    padding: 1rem;
    text-align: center;
    max-width: 300px;
  }
  
  .mic-button {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, #FF6B35 0%, #FF8C5A 100%);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: all 0.3s ease;
    box-shadow: 0 4px 20px rgba(255, 107, 53, 0.4);
  }
  
  .mic-button:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 6px 30px rgba(255, 107, 53, 0.5);
  }
  
  .mic-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .mic-button.listening {
    background: linear-gradient(135deg, #00D4AA 0%, #00F5C4 100%);
    box-shadow: 0 4px 30px rgba(0, 212, 170, 0.5);
    animation: pulse 1.5s infinite;
  }
  
  .mic-button.thinking {
    background: linear-gradient(135deg, #FFD93D 0%, #FFE566 100%);
    box-shadow: 0 4px 20px rgba(255, 217, 61, 0.4);
  }
  
  .mic-button.speaking {
    background: linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%);
    box-shadow: 0 4px 30px rgba(108, 92, 231, 0.5);
  }
  
  .mic-icon {
    width: 32px;
    height: 32px;
  }
  
  .pulse-ring {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2px solid currentColor;
    animation: pulseRing 1.5s infinite;
  }
  
  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(0, 0, 0, 0.2);
    border-top-color: #333;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  .sound-waves {
    display: flex;
    gap: 3px;
    align-items: center;
  }
  
  .sound-waves span {
    width: 4px;
    background: white;
    border-radius: 2px;
    animation: soundWave 0.5s ease-in-out infinite;
  }
  
  .sound-waves span:nth-child(1) { height: 12px; animation-delay: 0s; }
  .sound-waves span:nth-child(2) { height: 20px; animation-delay: 0.1s; }
  .sound-waves span:nth-child(3) { height: 16px; animation-delay: 0.2s; }
  
  .instruction {
    font-size: 0.875rem;
    opacity: 0.7;
    text-align: center;
  }
  
  .quick-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
    margin-bottom: 2rem;
  }
  
  .action-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    padding: 0.5rem 1rem;
    color: white;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .action-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
  }
  
  .inventory-panel {
    width: 100%;
    max-width: 400px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    padding: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .inventory-panel h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
    opacity: 0.9;
  }
  
  .expiry-alert {
    background: rgba(255, 204, 0, 0.15);
    border: 1px solid rgba(255, 204, 0, 0.3);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }
  
  .inventory-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .inventory-item {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 0.75rem;
    transition: background 0.2s ease;
  }
  
  .inventory-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  
  .inventory-item.expiring {
    border-left: 3px solid #FFD93D;
  }
  
  .item-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }
  
  .item-name {
    font-weight: 500;
    text-transform: capitalize;
  }
  
  .item-qty {
    opacity: 0.7;
    font-size: 0.875rem;
  }
  
  .item-meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.75rem;
    opacity: 0.6;
  }
  
  .item-expiry.urgent {
    color: #FF6B35;
    font-weight: 600;
  }
  
  .empty-state {
    text-align: center;
    opacity: 0.5;
    font-size: 0.875rem;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  
  @keyframes pulseRing {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.5); opacity: 0; }
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  @keyframes soundWave {
    0%, 100% { transform: scaleY(0.5); }
    50% { transform: scaleY(1); }
  }
</style>
