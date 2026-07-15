<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let { onEnterApp = () => {} } = $props();

  // Refs
  let scrollSpacer: HTMLDivElement;
  let panel: HTMLDivElement;
  let leftVideo: HTMLVideoElement;
  let rightVideo: HTMLVideoElement;
  let outroInfo: HTMLDivElement;
  let outroBuy: HTMLDivElement;
  let outroOverlay: HTMLDivElement;
  let outroFooter: HTMLDivElement;
  let circleSymbol: HTMLSpanElement;
  let cursor: HTMLDivElement;

  // State
  let isTouch = $state(false);
  let isMobile = $state(false);
  let isTablet = $state(false);
  let videosLoaded = $state(0);
  let mousePos = $state({ x: 0, y: 0 });
  let activeSide: 'left' | 'right' = 'right';
  let rafId = 0;
  let lastCircleUpdate = 0;
  let reducedMotion = $state(false);

  const symbols = ['🎤', '🔪', '📦', '⏰', '♻️'];

  const VIDEOS = {
    left: 'https://d8j0ntlcm91z4.cloudfront.net/user_39ca84eAE1ODL9hbR5VhoEj8tBf/hf_20260625_154433_532a85d3-dabf-4265-b8bd-19ac6af31842.mp4',
    right: 'https://d8j0ntlcm91z4.cloudfront.net/user_39ca84eAE1ODL9hbR5VhoEj8tBf/hf_20260625_154401_a664f076-b971-4557-8728-40ef9ea4c49b.mp4',
  };

  const GALLERY_IMAGES = [
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_104530_521b2f85-c0f3-4d0e-9704-b578315b4cb9.png&w=1920&q=85',
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103711_76ccdb8b-5043-4f47-9c54-4379713393ea.png&w=1920&q=85',
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103728_394f6a1b-85e2-4386-a4f6-408472a0a5b7.png&w=1920&q=85',
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103739_86743e0e-16a7-4bee-bf38-dd67985344dc.png&w=1920&q=85',
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103748_b2215dc8-a3a7-470d-b19a-5b87fa7d0c37.png&w=1920&q=85',
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103758_e919ce72-5c9d-4b87-9be6-d7647b34825c.png&w=1920&q=85',
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103808_013583d0-3386-4547-9832-37c7d8edb3ac.png&w=1920&q=85',
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103937_a0c49d0a-33eb-4ead-aea6-c1baf241acbc.png&w=1920&q=85',
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103956_d18ed8fd-7b6f-4b86-91f9-20010fe38670.png&w=1920&q=85',
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_104034_ba5a9963-87ff-4008-a545-6bd686c088b5.png&w=1920&q=85',
  ];

  // Responsive helpers
  function getCols(): number {
    if (typeof window === 'undefined') return 2;
    return window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2;
  }

  function getVideoHeight(): string {
    if (isMobile) return 'calc(100vh - 220px)';
    return '100%';
  }

  function getVideoTop(): string {
    if (isMobile) return '220px';
    return '0';
  }

  // Build gallery grid layout
  function buildLayout(count: number, cols: number): number[] {
    const grid: number[] = [];
    const rows = Math.ceil(count / cols);
    for (let r = 0; r < rows; r++) {
      const a = (r * 2 + (r % 2)) % cols;
      grid.push(a);
      if (r % 3 === 0 && grid.length < count) {
        const b = (a + 2) % cols;
        if (b !== a) grid.push(b);
      }
    }
    while (grid.length < rows * cols) grid.push(-1);
    return grid;
  }

  let grid = $derived(buildLayout(GALLERY_IMAGES.length, getCols()));

  // RAF loop — optimized for mobile
  function animate() {
    if (reducedMotion) return; // Skip animations for reduced motion

    const scrollY = window.scrollY;
    const vh = window.innerHeight;

    // Circle symbol throttle (lighter on mobile)
    const now = Date.now();
    const throttleMs = isMobile ? 120 : 80;
    if (now - lastCircleUpdate > throttleMs && circleSymbol) {
      if (scrollY > 50) {
        circleSymbol.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      }
      lastCircleUpdate = now;
    }

    // Video scrubbing (desktop only — mobile uses auto-play)
    if (!isTouch && leftVideo && rightVideo && videosLoaded >= 2) {
      const width = window.innerWidth;
      const deadZone = Math.max(30, width * 0.05);
      const centerX = width / 2;
      const x = mousePos.x;

      if (scrollY < vh) {
        leftVideo.style.visibility = 'visible';
        rightVideo.style.visibility = 'visible';

        if (x < centerX - deadZone) {
          activeSide = 'right';
          rightVideo.style.display = 'block';
          leftVideo.style.display = 'none';
          const range = centerX - deadZone;
          const dist = centerX - deadZone - x;
          const progress = Math.min(1, Math.max(0, dist / range));
          if (!rightVideo.seeking && rightVideo.duration) {
            rightVideo.currentTime = progress * rightVideo.duration;
          }
        } else if (x > centerX + deadZone) {
          activeSide = 'left';
          leftVideo.style.display = 'block';
          rightVideo.style.display = 'none';
          const range = width - (centerX + deadZone);
          const dist = x - (centerX + deadZone);
          const progress = Math.min(1, Math.max(0, dist / range));
          if (!leftVideo.seeking && leftVideo.duration) {
            leftVideo.currentTime = progress * leftVideo.duration;
          }
        }
      } else {
        leftVideo.style.visibility = 'hidden';
        rightVideo.style.visibility = 'hidden';
      }
    }

    // Card scaling — batch DOM reads/writes
    const cards = document.querySelectorAll<HTMLElement>('.bp-card');
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const cardTop = rect.top;
      const cardBottom = rect.bottom;

      if (cardBottom <= 0 || cardTop >= vh) {
        card.style.transform = 'scale(0)';
        return;
      }

      const enter = Math.min(1, (vh - cardTop) / (vh * 0.6));
      const exit = Math.min(1, cardBottom / (vh * 0.4));
      const scale = Math.min(enter, exit);
      card.style.transform = `scale(${Math.max(0, scale)})`;
    });

    // Outro animations
    const innerEl = document.querySelector('.bp-inner');
    if (innerEl) {
      const maxScroll = innerEl.scrollHeight - vh;
      if (scrollY > vh + maxScroll) {
        const progress = Math.min(1, (scrollY - vh - maxScroll) / (vh - 100));
        if (outroOverlay) outroOverlay.style.opacity = String(progress);
        if (outroFooter) outroFooter.style.opacity = String(progress);
        if (outroBuy) outroBuy.style.transform = `scale(${progress})`;
        if (outroInfo) {
          const offset = isMobile ? 132 : 166;
          outroInfo.style.transform = `translateY(-${progress * offset}px)`;
        }
      }
    }

    rafId = requestAnimationFrame(animate);
  }

  // Cursor tracking (desktop only)
  function handleMouseMove(e: MouseEvent) {
    if (isTouch) return;
    mousePos = { x: e.clientX, y: e.clientY };
    if (cursor) {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }
  }

  // Mobile video auto-play
  function startMobileVideo() {
    if (!isTouch || !leftVideo || !rightVideo) return;

    leftVideo.play().catch(() => {});
    leftVideo.onended = () => {
      rightVideo.play().catch(() => {});
      rightVideo.onended = () => {
        leftVideo.play().catch(() => {});
      };
    };
  }

  // Handle resize
  function handleResize() {
    isMobile = window.innerWidth < 640;
    isTablet = window.innerWidth >= 640 && window.innerWidth < 1024;
    setSpacerHeight();
  }

  function setSpacerHeight() {
    if (!scrollSpacer) return;
    const innerEl = document.querySelector('.bp-inner');
    if (!innerEl) return;
    const vh = window.innerHeight;
    const maxScroll = innerEl.scrollHeight - vh;
    scrollSpacer.style.height = `${vh + maxScroll + 2 * vh}px`;
  }

  onMount(() => {
    isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    isMobile = window.innerWidth < 640;
    isTablet = window.innerWidth >= 640 && window.innerWidth < 1024;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Disable cursor on touch
    if (scrollSpacer && isTouch) {
      scrollSpacer.style.cursor = 'auto';
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);

    // GSAP panel slide-up
    if (scrollSpacer && panel) {
      gsap.fromTo(panel,
        { yPercent: 100 },
        {
          yPercent: 0,
          scrollTrigger: {
            trigger: scrollSpacer,
            start: 'top top',
            end: `${window.innerHeight} top`,
            scrub: true,
            ease: 'none',
          },
        }
      );
    }

    // Set spacer height
    setSpacerHeight();
    setTimeout(setSpacerHeight, 2000);

    // Start mobile video
    if (isTouch && videosLoaded >= 2) {
      startMobileVideo();
    }

    // Start RAF (skip if reduced motion)
    if (!reducedMotion) {
      rafId = requestAnimationFrame(animate);
    }
  });

  onDestroy(() => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('resize', handleResize);
    cancelAnimationFrame(rafId);
    ScrollTrigger.getAll().forEach(t => t.kill());
  });
</script>

<div
  bind:this={scrollSpacer}
  class="landing-scroll-spacer"
  class:scanlines={!reducedMotion}
  style="position: relative; user-select: none; background: #0c0c14; height: 500vh; {isTouch ? 'cursor: auto;' : 'cursor: none;'} touch-action: pan-y;"
>
  <!-- Custom Cursor (Desktop only) -->
  {#if !isTouch}
    <div
      bind:this={cursor}
      class="sousy-cursor"
      style="position: fixed; pointer-events: none; z-index: 9999; transform: translate(-50%, -50%); mix-blend-mode: exclusion; width: 48px; height: 48px; left: -100px; top: -100px;"
    >
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="22.75" stroke="white" stroke-width="2.5" />
        <path d="M24 8L20 24L16 40L24 36L32 40L28 24L24 8Z" fill="white" fill-rule="evenodd" />
      </svg>
    </div>
  {/if}

  <!-- Logo -->
  <div
    class="hero-logo"
    style="position: fixed; pointer-events: none; z-index: 20; mix-blend-mode: exclusion; top: {isMobile ? 12 : isTablet ? 20 : 32}px; left: {isMobile ? 12 : isTablet ? 20 : 32}px; width: {isMobile ? 100 : isTablet ? 180 : 280}px; transition: opacity 0.6s ease;"
  >
    <svg viewBox="0 0 280 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 10L16 45L12 80L20 76L28 80L24 45L20 10Z" fill="white" fill-rule="evenodd" />
      <text x="45" y="62" font-family="Inter Tight, sans-serif" font-weight="500" font-size="52" fill="white" letter-spacing="-0.04em">SOUSY</text>
    </svg>
  </div>

  <!-- Tagline -->
  <div
    class="hero-tagline"
    style="position: fixed; pointer-events: none; z-index: 20; mix-blend-mode: exclusion; left: {isMobile ? 12 : isTablet ? 20 : 32}px; top: {isMobile ? 100 : isTablet ? 160 : 244}px; width: {isMobile ? 'calc(100vw - 24px)' : isTablet ? 'calc(50vw - 48px)' : '692px'}; font-family: 'Inter Tight', sans-serif; font-weight: 500; font-size: {isMobile ? 10 : isTablet ? 11 : 12}px; line-height: 140%; letter-spacing: -0.04em; color: #FFFFFF;"
  >
    HANDS-FREE VOICE AI FOR COMMERCIAL KITCHEN INVENTORY. TALK TO YOUR WALK-IN, NOT A SPREADSHEET.
  </div>

  <!-- Navigation -->
  <div
    class="hero-nav"
    style="position: fixed; pointer-events: none; z-index: 20; mix-blend-mode: exclusion; top: {isMobile ? 12 : isTablet ? 20 : 32}px; right: {isMobile ? 12 : isTablet ? 20 : 32}px; width: {isMobile ? 'auto' : '330px'}; height: 30px; display: flex; flex-direction: row; justify-content: space-between; align-items: center;"
  >
    {#if !isMobile}
      <span style="font-family: 'Inter Tight', sans-serif; font-weight: 500; font-size: {isTablet ? 13 : 15}px; text-transform: uppercase; color: white; letter-spacing: -0.02em;">FEATURES</span>
    {/if}
    <div style="display: flex; flex-direction: row; gap: {isMobile ? 16 : isTablet ? 30 : 50}px; align-items: center;">
      <svg width={isMobile ? 20 : isTablet ? 24 : 30} height={isMobile ? 20 : isTablet ? 24 : 30} viewBox="0 0 40 40" fill="none">
        <path d="M0 14H40" stroke="white" stroke-width="2.5" />
        <path d="M0 26H40" stroke="white" stroke-width="2.5" />
      </svg>
      <span style="font-family: 'Inter Tight', sans-serif; font-weight: 500; font-size: {isMobile ? 11 : isTablet ? 13 : 15}px; color: white; letter-spacing: -0.02em;">[ DEMO ]</span>
    </div>
  </div>

  <!-- Feature Info -->
  <div
    bind:this={outroInfo}
    class="hero-outro-info"
    style="position: fixed; pointer-events: none; z-index: 20; mix-blend-mode: exclusion; right: {isMobile ? 0 : 32}px; bottom: {isMobile ? 40 : isTablet ? 60 : 80}px; width: {isMobile ? '100%' : '330px'}; display: flex; flex-direction: column; align-items: {isMobile ? 'center' : 'flex-end'}; text-align: {isMobile ? 'center' : 'right'};"
  >
    <div style="position: relative; width: {isMobile ? 16 : isTablet ? 24 : 30}px; height: {isMobile ? 16 : isTablet ? 24 : 30}px; margin-bottom: {isMobile ? 8 : isTablet ? 20 : 32}px;">
      <svg width={isMobile ? 16 : isTablet ? 24 : 30} height={isMobile ? 16 : isTablet ? 24 : 30} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="18.75" stroke="white" stroke-width={isMobile ? 1.5 : 2.5} />
      </svg>
      <span
        bind:this={circleSymbol}
        style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: 'Inter Tight', sans-serif; font-weight: 500; font-size: {isMobile ? 8 : isTablet ? 12 : 15}px; color: white; letter-spacing: -0.04em;"
      >🎤</span>
    </div>
    <div style="font-family: 'Inter Tight', sans-serif; font-weight: 500; font-size: {isMobile ? 16 : isTablet ? 22 : 30}px; line-height: 100%; text-align: center; letter-spacing: -0.04em; text-transform: uppercase; color: white; margin-bottom: {isMobile ? 8 : isTablet ? 20 : 32}px; width: {isMobile ? 200 : isTablet ? 252 : '100%'};">
      VOICE INVENTORY<br />"SOUSY"
    </div>
    <div style="font-family: 'Inter Tight', sans-serif; font-weight: 500; font-size: {isMobile ? 48 : isTablet ? 64 : 80}px; line-height: 100%; text-align: center; letter-spacing: -0.04em; color: white;">
      FREE
    </div>
  </div>

  <!-- "Try Sousy" Button — larger touch target on mobile -->
  <div
    bind:this={outroBuy}
    class="hero-outro-buy"
    style="position: fixed; pointer-events: none; z-index: 20; mix-blend-mode: exclusion; right: {isMobile ? 12 : 32}px; bottom: {isMobile ? 16 : isTablet ? 24 : 32}px; width: {isMobile ? 'calc(100% - 24px)' : '330px'}; height: {isMobile ? 56 : isTablet ? 80 : 174}px; transform-origin: right bottom; transform: scale(0); background: #FF8C00; border-radius: {isMobile ? 28 : 1335}px; display: flex; align-items: center; justify-content: center; cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent;"
    onclick={onEnterApp}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onEnterApp()}
    role="button"
    tabindex="0"
  >
    <span style="font-family: 'Inter Tight', sans-serif; font-weight: 600; font-size: {isMobile ? 18 : isTablet ? 28 : 110}px; letter-spacing: -0.04em; color: #fff; mix-blend-mode: exclusion;">
      try sousy
    </span>
  </div>

  <!-- Footer -->
  <div
    bind:this={outroFooter}
    class="hero-footer"
    style="position: fixed; pointer-events: none; z-index: 20; mix-blend-mode: exclusion; left: {isMobile ? 12 : 16}px; bottom: {isMobile ? 80 : isTablet ? 40 : 32}px; opacity: 0; display: flex; flex-direction: {isMobile ? 'column' : 'row'}; gap: {isMobile ? 4 : 80}px; justify-content: {isMobile ? 'flex-start' : 'flex-start'}; width: {isMobile ? 'calc(100% - 24px)' : 'auto'};"
  >
    <span style="font-family: 'Inter Tight', sans-serif; font-weight: 500; font-size: {isMobile ? 9 : isTablet ? 11 : 13}px; letter-spacing: -0.02em; text-transform: uppercase; color: rgba(255,255,255,0.6);">SOUSY © 2026</span>
    <span style="font-family: 'Inter Tight', sans-serif; font-weight: 500; font-size: {isMobile ? 9 : isTablet ? 11 : 13}px; letter-spacing: -0.02em; text-transform: uppercase; color: rgba(255,255,255,0.6);">ZERO-WASTE KITCHEN AI</span>
  </div>

  <!-- Video Container -->
  <div
    class="hero-video-container"
    style="position: fixed; left: 0; top: {getVideoTop()}; width: 100%; height: {getVideoHeight()}; z-index: 0; pointer-events: none; overflow: hidden; opacity: {videosLoaded >= 2 ? 1 : 0.3}; transition: opacity 0.3s ease;"
  >
    <video
      bind:this={leftVideo}
      muted
      playsinline
      preload={isMobile ? 'metadata' : 'auto'}
      onloadeddata={() => { videosLoaded++; if (isTouch && videosLoaded >= 2) startMobileVideo(); }}
      style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: {isTouch ? 'block' : 'none'}; filter: saturate(1.2) contrast(1.1);"
      src={VIDEOS.left}
    />
    <video
      bind:this={rightVideo}
      muted
      playsinline
      preload={isMobile ? 'metadata' : 'auto'}
      onloadeddata={() => { videosLoaded++; if (isTouch && videosLoaded >= 2) startMobileVideo(); }}
      style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(1.2) contrast(1.1);"
      src={VIDEOS.right}
    />
  </div>

  <!-- White Overlay -->
  <div
    bind:this={outroOverlay}
    class="hero-outro-overlay"
    style="position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none; z-index: 12;"
  />

  <!-- Black Panel (Gallery) -->
  <div
    bind:this={panel}
    class="hero-panel"
    style="position: fixed; inset: 0; background: #0c0c14; z-index: 10; transform: translateY(100vh);"
  >
    <div class="bp-inner" style="width: 100%; padding-top: {isMobile ? 'min(200px, 30vh)' : 'min(400px, 40vh)'};">
      <!-- Section Title -->
      <div style="font-family: 'Inter Tight', sans-serif; font-weight: 500; font-size: {isMobile ? 24 : isTablet ? 36 : 48}px; letter-spacing: -0.04em; text-transform: uppercase; color: #FFFFFF; text-align: center; margin-bottom: {isMobile ? 16 : isTablet ? 32 : 48}px; padding: 0 {isMobile ? 12 : 32}px;">
        WHAT SOUSY SEES
      </div>

      <!-- Grid -->
      <div style="display: grid; grid-template-columns: repeat({getCols()}, 1fr); gap: {isMobile ? 6 : isTablet ? 10 : 16}px; padding: 0 {isMobile ? 12 : 32}px;">
        {#each grid as colIdx, i}
          {#if colIdx === -1}
            <div style="aspect-ratio: 2/3;"></div>
          {:else}
            {@const imgIdx = i % GALLERY_IMAGES.length}
            {@const isRightHalf = colIdx >= getCols() / 2}
            <div
              class="bp-card"
              style="aspect-ratio: 2/3; overflow: hidden; background: #1a1a2e; transform-origin: {isRightHalf ? 'left bottom' : 'right bottom'}; transform: scale(0); position: relative; border-radius: {isMobile ? 4 : 8}px;"
            >
              <img
                src={GALLERY_IMAGES[imgIdx]}
                alt="Sousy dashboard {i + 1}"
                loading="lazy"
                decoding="async"
                style="width: 100%; height: 100%; object-fit: cover; display: block;"
              />
            </div>
          {/if}
        {/each}
      </div>

      <!-- Bottom spacer -->
      <div style="height: {isMobile ? '15vh' : '20vh'};"></div>
    </div>
  </div>
</div>

<style>
  /* Hide scrollbar on landing */
  :global(.landing-scroll-spacer::-webkit-scrollbar) {
    display: none;
  }
  :global(.landing-scroll-spacer) {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  /* Scanlines — reduced on mobile */
  :global(.scanlines::after) {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.03) 2px,
      rgba(0, 0, 0, 0.03) 4px
    );
    pointer-events: none;
    z-index: 100;
  }

  /* Card hover — desktop only */
  @media (hover: hover) {
    :global(.bp-card:hover) {
      box-shadow: 0 0 30px rgba(255, 140, 0, 0.25);
    }
  }

  /* Touch feedback */
  @media (hover: none) {
    :global(.hero-outro-buy:active) {
      transform: scale(0.96) !important;
      opacity: 0.9;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    :global(.scanlines::after) {
      display: none;
    }
  }
</style>
