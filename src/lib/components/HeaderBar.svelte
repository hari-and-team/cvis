<script lang="ts">
  import { Check, Code2, ExternalLink, Loader2, Play, UserRound } from 'lucide-svelte';
  import { isCompiling, isRunning, lastBinaryPath, userProfile } from '$lib/stores';
  import { nativeExecutionEnabled } from '$lib/runtime-capabilities';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    compile: void;
    run: void;
    loadTemplate: string;
    editProfile: void;
  }>();

  function handleCompile() {
    dispatch('compile');
  }

  function handleRun() {
    dispatch('run');
  }

  function handleEditProfile() {
    dispatch('editProfile');
  }

  const supportsNativeExecution = nativeExecutionEnabled();
</script>

<header class="header-bar">
  <div class="logo-section">
    <div class="logo-icon">
      <Code2 size={18} color="currentColor" />
    </div>
    <div class="logo-text">
      <h1 class="title">C Cloud Compiler</h1>
      <span class="subtitle">
        Interactive Visualizer{#if !supportsNativeExecution} · Trace-Only Deployment{/if}
      </span>
    </div>
  </div>

  <div class="actions">
    <div class="profile-chip-shell">
      {#if $userProfile}
        <button class="profile-chip" on:click={handleEditProfile}>
          <span class="profile-chip-icon"><UserRound size={14} /></span>
          <span class="profile-chip-copy">
            <span class="profile-chip-name">{$userProfile.displayName}</span>
            <span class="profile-chip-meta">
              {$userProfile.role}
              {#if $userProfile.leetCode}
                · LeetCode {$userProfile.leetCode.username}
              {/if}
            </span>
          </span>
        </button>
      {:else}
        <div class="profile-chip profile-chip-static">
          <span class="profile-chip-icon"><UserRound size={14} /></span>
          <span class="profile-chip-copy">
            <span class="profile-chip-name">Local workspace</span>
            <span class="profile-chip-meta">Account creation disabled for now</span>
          </span>
        </div>
      {/if}
      {#if $userProfile?.leetCode}
        <a
          href={$userProfile.leetCode.profileUrl}
          target="_blank"
          rel="noreferrer"
          class="profile-chip-link"
          title="Open LeetCode profile"
        >
          <ExternalLink size={13} />
        </a>
      {/if}
    </div>

    <button
      class="btn btn-secondary"
      class:loading={$isCompiling}
      disabled={!supportsNativeExecution || $isCompiling || $isRunning}
      title={!supportsNativeExecution ? 'Compile is disabled in this deployment.' : undefined}
      on:click={handleCompile}
    >
      {#if $isCompiling}
        <Loader2 size={14} class="animate-spin" />
        <span>Compiling…</span>
      {:else}
        <Check size={14} />
        <span>Compile</span>
      {/if}
    </button>

    <button
      class="btn btn-primary"
      class:running={$isRunning}
      disabled={!supportsNativeExecution || $isCompiling || $isRunning || !$lastBinaryPath}
      title={!supportsNativeExecution ? 'Run is disabled in this deployment.' : undefined}
      on:click={handleRun}
    >
      {#if $isRunning}
        <Loader2 size={14} class="animate-spin" />
        <span>Running…</span>
      {:else}
        <Play size={14} fill="currentColor" />
        <span>Run</span>
      {/if}
    </button>
  </div>
</header>

<style>
  .header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-deep) 94%, transparent) 0%,
      color-mix(in srgb, var(--bg-card) 90%, transparent) 100%
    );
    border-bottom: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
    flex-shrink: 0;
    box-shadow: var(--shadow-soft);
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
    color: color-mix(in srgb, var(--lavender) 68%, var(--purple));
    background: color-mix(in srgb, var(--bg-hover, var(--bg-raised)) 92%, transparent);
    border: 1px solid color-mix(in srgb, var(--purple) 18%, var(--border));
    border-radius: var(--radius-card);
    transition: all 0.2s ease;
  }

  .logo-icon:hover {
    background: color-mix(in srgb, var(--purple) 8%, var(--bg-raised));
    border-color: color-mix(in srgb, var(--purple) 28%, var(--border));
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
    color: var(--text-bright);
    letter-spacing: 0.3px;
  }

  .subtitle {
    font-size: 11px;
    color: var(--text-dim);
    font-weight: 500;
  }

  /* Actions */
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .profile-chip {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 1px solid color-mix(in srgb, var(--selection-accent) 16%, var(--border));
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--bg-card) 86%, transparent);
    color: var(--text-bright);
    padding: 8px 11px;
    cursor: pointer;
    min-width: 0;
  }

  .profile-chip-static {
    cursor: default;
  }

  .profile-chip-shell {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .profile-chip-icon {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-control);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--selection-accent) 12%, transparent);
    color: color-mix(in srgb, var(--lavender) 70%, var(--text-bright));
    flex-shrink: 0;
  }

  .profile-chip-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }

  .profile-chip-name {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-bright);
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .profile-chip-meta {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: capitalize;
    max-width: 220px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .profile-chip-link {
    color: color-mix(in srgb, var(--lavender) 66%, var(--purple));
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Base Button Styles */
  .btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 15px;
    border-radius: var(--radius-control);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
    outline: none;
    box-shadow: var(--shadow-soft);
  }

  .btn span {
    line-height: 1;
  }

  .btn-secondary {
    background: color-mix(in srgb, var(--blue) 10%, var(--bg-raised));
    border-color: color-mix(in srgb, var(--blue) 26%, var(--border));
    color: var(--text-bright);
  }

  .btn-secondary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--blue) 14%, var(--bg-raised));
    transform: translateY(-1px);
  }

  .btn-secondary:active:not(:disabled) {
    transform: translateY(0);
    box-shadow:
      0 1px 4px rgba(40, 52, 69, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .btn-secondary.loading {
    background: color-mix(in srgb, var(--blue) 9%, var(--bg-raised));
    cursor: not-allowed;
    opacity: 0.9;
  }

  /* Primary Button - Run */
  .btn-primary {
    background: color-mix(in srgb, var(--green) 14%, var(--bg-raised));
    border-color: color-mix(in srgb, var(--green) 24%, var(--border));
    color: color-mix(in srgb, var(--green) 60%, var(--text-bright));
    font-weight: 700;
  }

  .btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--green) 18%, var(--bg-raised));
    transform: translateY(-1px);
  }

  .btn-primary:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 
      0 1px 4px rgba(43, 58, 37, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .btn-primary.running {
    background: color-mix(in srgb, var(--green) 12%, var(--bg-raised));
    cursor: not-allowed;
    opacity: 0.85;
  }

  .btn-primary:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .btn-secondary:disabled {
    cursor: not-allowed;
    opacity: 0.6;
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

  @media (max-width: 920px) {
    .header-bar {
      flex-wrap: wrap;
      gap: 12px;
    }

    .actions {
      width: 100%;
      justify-content: space-between;
      flex-wrap: wrap;
    }
  }
</style>
