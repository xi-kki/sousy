<script lang="ts">
  import LandingPage from '@features/landing/components/LandingPage.svelte';
  import KitchenVoiceAgent from '@features/voice-agents/components/KitchenVoiceAgent.svelte';

  let showApp = $state(false);
</script>

{#if showApp}
  <KitchenVoiceAgent />
{:else}
  <LandingPage onEnterApp={() => showApp = true} />
{/if}
