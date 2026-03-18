<script lang="ts">
  import { Code2, Check, Copy, Loader2, Play } from 'lucide-svelte';
  import { TH } from '$lib/theme';
  import { isCompiling, isRunning } from '$lib/stores';
  import { createEventDispatcher } from 'svelte';

  export let code: string = '';

  const dispatch = createEventDispatcher<{
    compile: void;
    run: void;
    loadTemplate: string;
  }>();

  let copied = false;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => copied = false, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  function handleCompileRun() {
    dispatch('run');
  }
</script>

<div
  class="header-bar"
  style="display: flex; align-items: center; justify-content: space-between; padding: 9px 14px; background: {TH.bgCard}; border-bottom: 1px solid {TH.border}; flex-shrink: 0;"
>
  <div style="display: flex; align-items: center; gap: 9px;">
    <div style="background: {TH.accent}20; border-radius: 7px; padding: 6px;">
      <Code2 size={16} color={TH.accent} />
    </div>
    <div>
      <div style="color: {TH.white}; font-weight: 800; font-size: 13px;">C Cloud Compiler</div>
      <div style="color: {TH.dimText}; font-size: 10px;">with Interactive Visualizer</div>
    </div>
  </div>
  <div style="display: flex; gap: 7px;">
    <button
      on:click={handleCopy}
      style="display: flex; align-items: center; gap: 5px; padding: 6px 12px; background: {TH.bgRaised}; border: 1px solid {TH.border}; border-radius: 6px; color: {TH.midText}; font-size: 11px; font-weight: 600; cursor: pointer;"
    >
      {#if copied}
        <Check size={12} color={TH.green} />
        Copied
      {:else}
        <Copy size={12} />
        Copy
      {/if}
    </button>
    <button
      on:click={handleCompileRun}
      disabled={$isRunning}
      style="display: flex; align-items: center; gap: 5px; padding: 6px 14px; background: {TH.green}; border: none; border-radius: 6px; color: {TH.white}; font-size: 11px; font-weight: 700; cursor: {$isRunning ? 'not-allowed' : 'pointer'}; opacity: {$isRunning ? 0.7 : 1};"
    >
      {#if $isRunning}
        <Loader2 size={12} class="animate-spin" />
        Running…
      {:else}
        <Play size={12} fill={TH.white} />
        Compile & Run
      {/if}
    </button>
  </div>
</div>

<style>
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
