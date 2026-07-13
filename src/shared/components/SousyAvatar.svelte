<script lang="ts">
  import type { AgentState } from '../../types';
  
  export let state: AgentState = 'idle';
  export let size: number = 200;
  
  // Animation values
  let pulseScale = 1;
  let glowIntensity = 0;
  let rotation = 0;
  let animationFrame: number;
  
  // State-based colors
  $: colors = {
    idle: { primary: '#FF6B35', secondary: '#FFB088', glow: 'rgba(255, 107, 53, 0.3)' },
    listening: { primary: '#00D4AA', secondary: '#7DFFD4', glow: 'rgba(0, 212, 170, 0.5)' },
    thinking: { primary: '#FFD93D', secondary: '#FFEB80', glow: 'rgba(255, 217, 61, 0.5)' },
    speaking: { primary: '#6C5CE7', secondary: '#A29BFE', glow: 'rgba(108, 92, 231, 0.5)' },
  }[state] || { primary: '#FF6B35', secondary: '#FFB088', glow: 'rgba(255, 107, 53, 0.3)' };
  
  // Animation loop
  function animate() {
    const time = Date.now() / 1000;
    
    switch (state) {
      case 'idle':
        pulseScale = 1 + Math.sin(time * 1.5) * 0.03;
        glowIntensity = 0.3 + Math.sin(time * 2) * 0.1;
        rotation = 0;
        break;
      case 'listening':
        pulseScale = 1 + Math.sin(time * 4) * 0.08;
        glowIntensity = 0.6 + Math.sin(time * 3) * 0.2;
        rotation = Math.sin(time * 2) * 5;
        break;
      case 'thinking':
        pulseScale = 1 + Math.sin(time * 6) * 0.1;
        glowIntensity = 0.8 + Math.sin(time * 4) * 0.2;
        rotation = time * 30;
        break;
      case 'speaking':
        pulseScale = 1 + Math.sin(time * 8) * 0.12;
        glowIntensity = 1;
        rotation = Math.sin(time * 3) * 10;
        break;
    }
    
    animationFrame = requestAnimationFrame(animate);
  }
  
  import { onMount, onDestroy } from 'svelte';
  
  onMount(() => {
    animationFrame = requestAnimationFrame(animate);
  });
  
  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });
</script>

<div 
  class="avatar-container"
  style="width: {size}px; height: {size}px;"
>
  <!-- Outer glow ring -->
  <div 
    class="glow-ring"
    style="
      background: radial-gradient(circle, {colors.glow} 0%, transparent 70%);
      transform: scale({pulseScale * 1.3});
      opacity: {glowIntensity};
    "
  />
  
  <!-- Main orb -->
  <div 
    class="orb"
    style="
      background: radial-gradient(circle at 30% 30%, {colors.secondary}, {colors.primary});
      transform: scale({pulseScale}) rotate({rotation}deg);
      box-shadow: 0 0 {40 * glowIntensity}px {colors.glow}, inset 0 0 {20 * glowIntensity}px rgba(255,255,255,0.2);
    "
  >
    <!-- Inner highlight -->
    <div class="highlight" />
    
    <!-- Face container -->
    <div class="face">
      {#if state === 'idle'}
        <!-- Sleepy eyes -->
        <svg viewBox="0 0 100 60" class="eyes">
          <ellipse cx="30" cy="30" rx="8" ry="4" fill="rgba(0,0,0,0.6)" />
          <ellipse cx="70" cy="30" rx="8" ry="4" fill="rgba(0,0,0,0.6)" />
        </svg>
        <svg viewBox="0 0 40 15" class="mouth">
          <path d="M10 8 Q20 12 30 8" stroke="rgba(0,0,0,0.5)" stroke-width="2" fill="none" />
        </svg>
      {:else if state === 'listening'}
        <!-- Wide open eyes -->
        <svg viewBox="0 0 100 60" class="eyes">
          <circle cx="30" cy="30" r="10" fill="rgba(0,0,0,0.7)" />
          <circle cx="70" cy="30" r="10" fill="rgba(0,0,0,0.7)" />
          <circle cx="33" cy="27" r="3" fill="white" />
          <circle cx="73" cy="27" r="3" fill="white" />
        </svg>
        <svg viewBox="0 0 40 15" class="mouth">
          <ellipse cx="20" cy="8" rx="8" ry="5" fill="rgba(0,0,0,0.5)" />
        </svg>
      {:else if state === 'thinking'}
        <!-- Squinting eyes -->
        <svg viewBox="0 0 100 60" class="eyes">
          <path d="M20 30 Q30 20 40 30" stroke="rgba(0,0,0,0.7)" stroke-width="3" fill="none" />
          <path d="M60 30 Q70 20 80 30" stroke="rgba(0,0,0,0.7)" stroke-width="3" fill="none" />
        </svg>
        <svg viewBox="0 0 40 15" class="mouth">
          <circle cx="20" cy="8" r="5" fill="rgba(0,0,0,0.4)" />
        </svg>
      {:else if state === 'speaking'}
        <!-- Happy eyes -->
        <svg viewBox="0 0 100 60" class="eyes">
          <path d="M20 35 Q30 25 40 35" stroke="rgba(0,0,0,0.7)" stroke-width="3" fill="none" />
          <path d="M60 35 Q70 25 80 35" stroke="rgba(0,0,0,0.7)" stroke-width="3" fill="none" />
        </svg>
        <svg viewBox="0 0 40 15" class="mouth">
          <path d="M8 5 Q20 15 32 5" stroke="rgba(0,0,0,0.6)" stroke-width="2.5" fill="rgba(0,0,0,0.2)" />
        </svg>
      {/if}
    </div>
  </div>
  
  <!-- State label -->
  <div class="state-label" style="color: {colors.primary}">
    {state === 'idle' ? 'Ready' : state === 'listening' ? 'Listening...' : state === 'thinking' ? 'Thinking...' : 'Speaking...'}
  </div>
</div>

<style>
  .avatar-container {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  
  .glow-ring {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }
  
  .orb {
    position: relative;
    width: 70%;
    height: 70%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s ease, box-shadow 0.3s ease;
  }
  
  .highlight {
    position: absolute;
    top: 15%;
    left: 20%;
    width: 25%;
    height: 25%;
    background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }
  
  .face {
    position: relative;
    width: 60%;
    height: 60%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  
  .eyes {
    width: 80%;
    height: auto;
  }
  
  .mouth {
    width: 35%;
    height: auto;
    margin-top: -5%;
  }
  
  .state-label {
    margin-top: 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: 0.8;
  }
</style>
