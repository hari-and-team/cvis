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

<header class="header-bar">
  <div class="logo-section">
    <div class="logo-icon">
      <Code2 size={18} color="#61afef" />
    </div>
    <div class="logo-text">
      <h1 class="title">C Cloud Compiler</h1>
      <span class="subtitle">Interactive Visualizer</span>
    </div>
  </div>

  <div class="actions">
    <button
      class="btn btn-secondary"
      class:copied
      on:click={handleCopy}
    >
      {#if copied}
        <Check size={14} color="#98c379" />
        <span>Copied!</span>
      {:else}
        <Copy size={14} />
        <span>Copy</span>
      {/if}
    </button>

    <button
      class="btn btn-primary"
      class:running={$isRunning}
      disabled={$isRunning}
      on:click={handleCompileRun}
    >
      {#if $isRunning}
        <Loader2 size={14} class="animate-spin" />
        <span>Running…</span>
      {:else}
        <Play size={14} fill="#fff" />
        <span>Compile & Run</span>
      {/if}
    </button>
  </div>
</header>

<style>
  /* One Dark Colors */
  :root {
    --od-bg-main: #282c34;
    --od-bg-deep: #21252b;
    --od-bg-hover: #2c313a;
    --od-border: #3e4451;
    --od-text: #abb2bf;
    --od-text-dim: #5c6370;
    --od-text-bright: #e5e5e5;
    --od-green: #98c379;
    --od-blue: #61afef;
  }

  .header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--od-bg-deep);
    border-bottom: 1px solid var(--od-border);
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  /* Logo Section */
  .logo-section {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, rgba(97, 175, 239, 0.15), rgba(97, 175, 239, 0.05));
    border: 1px solid rgba(97, 175, 239, 0.2);
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .logo-icon:hover {
    background: linear-gradient(135deg, rgba(97, 175, 239, 0.25), rgba(97, 175, 239, 0.1));
    border-color: rgba(97, 175, 239, 0.4);
  }

  .logo-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--od-text-bright);
    letter-spacing: 0.3px;
  }

  .subtitle {
    font-size: 11px;
    color: var(--od-text-dim);
    font-weight: 500;
  }

  /* Actions */
  .actions {
    display: flex;
    gap: 8px;
  }

  /* Base Button Styles */
  .btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    outline: none;
  }

  .btn span {
    line-height: 1;
  }

  /* Secondary Button */
  .btn-secondary {
    background: var(--od-bg-main);
    border: 1px solid var(--od-border);
    color: var(--od-text);
  }

  .btn-secondary:hover {
    background: var(--od-bg-hover);
    border-color: #4b5263;
    color: var(--od-text-bright);
  }

  .btn-secondary:active {
    transform: translateY(1px);
  }

  .btn-secondary.copied {
    border-color: rgba(152, 195, 121, 0.4);
    color: var(--od-green);
  }

  /* Primary Button - Compile & Run */
  .btn-primary {
    background: linear-gradient(135deg, #98c379, #7eb35d);
    color: #1e2127;
    font-weight: 700;
    box-shadow: 
      0 2px 8px rgba(152, 195, 121, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .btn-primary:hover:not(:disabled) {
    background: linear-gradient(135deg, #a8d089, #8ec36d);
    box-shadow: 
      0 4px 12px rgba(152, 195, 121, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
    transform: translateY(-1px);
  }

  .btn-primary:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 
      0 1px 4px rgba(152, 195, 121, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .btn-primary.running {
    background: linear-gradient(135deg, #7eb35d, #6a9b4d);
    cursor: not-allowed;
    opacity: 0.85;
  }

  .btn-primary:disabled {
    cursor: not-allowed;
  }

  /* Spin Animation */
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
