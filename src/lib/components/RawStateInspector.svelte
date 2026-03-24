<script lang="ts">
  import type {
    VisualizerFrame,
    VisualizerMemoryEntry
  } from '$lib/visualizer/trace-normalization';

  export let title = 'Raw Runtime State';
  export let reason: string | null = null;
  export let registers: Record<string, number> = {};
  export let globalFrame: VisualizerFrame | null = null;
  export let stackFrames: VisualizerFrame[] = [];
  export let memoryEntries: VisualizerMemoryEntry[] = [];

  function formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.map((entry) => formatValue(entry)).join(', ')}]`;

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
</script>

<section class="raw-panel">
  <div class="raw-panel-header">
    <div class="raw-panel-title">{title}</div>
    {#if reason}
      <div class="raw-panel-reason">{reason}</div>
    {/if}
  </div>

  <div class="raw-grid">
    <article class="raw-card">
      <div class="raw-card-title">Registers</div>
      {#if Object.keys(registers).length > 0}
        <div class="kv-list">
          {#each Object.entries(registers) as [key, value]}
            <div class="kv-row">
              <span class="kv-key">{key}</span>
              <span class="kv-value">{value}</span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="raw-empty">No register state</div>
      {/if}
    </article>

    <article class="raw-card">
      <div class="raw-card-title">Call Stack</div>
      {#if stackFrames.length > 0}
        <div class="frame-list">
          {#each stackFrames as frame}
            <div class="frame-item">
              <div class="frame-name">{frame.name}()</div>
              {#if Object.keys(frame.locals).length > 0}
                <div class="kv-list">
                  {#each Object.entries(frame.locals) as [key, value]}
                    <div class="kv-row">
                      <span class="kv-key">{key}</span>
                      <span class="kv-value">{formatValue(value)}</span>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="raw-empty">No locals</div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="raw-empty">No non-global frames</div>
      {/if}
    </article>

    <article class="raw-card">
      <div class="raw-card-title">Global Scope</div>
      {#if globalFrame && Object.keys(globalFrame.locals).length > 0}
        <div class="kv-list">
          {#each Object.entries(globalFrame.locals) as [key, value]}
            <div class="kv-row">
              <span class="kv-key">{key}</span>
              <span class="kv-value">{formatValue(value)}</span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="raw-empty">No global values</div>
      {/if}
    </article>
  </div>

  <article class="raw-card raw-memory-card">
    <div class="raw-card-title">Memory</div>
    {#if memoryEntries.length > 0}
      <div class="memory-list">
        {#each memoryEntries as entry}
          <div class="kv-row">
            <span class="kv-key">{entry.key}</span>
            <span class="kv-value">{formatValue(entry.value)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="raw-empty">No memory entries</div>
    {/if}
  </article>
</section>

<style>
  .raw-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 18px;
  }

  .raw-panel-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .raw-panel-title {
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-bright);
  }

  .raw-panel-reason {
    font-size: 11px;
    color: color-mix(in srgb, var(--text-mid) 78%, var(--text-dim));
  }

  .raw-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .raw-card {
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg-deep) 88%, transparent);
    padding: 12px;
    min-width: 0;
  }

  .raw-card-title {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--text-mid) 78%, var(--text-dim));
    margin-bottom: 10px;
  }

  .raw-empty {
    font-size: 11px;
    color: var(--text-dim);
  }

  .frame-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .frame-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  }

  .frame-item:first-child {
    border-top: none;
    padding-top: 0;
  }

  .frame-name {
    font-size: 12px;
    color: var(--text-bright);
  }

  .kv-list,
  .memory-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .kv-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
  }

  .kv-key {
    font-size: 11px;
    color: color-mix(in srgb, var(--text-mid) 78%, var(--text-dim));
    word-break: break-word;
  }

  .kv-value {
    font-size: 11px;
    color: var(--text-bright);
    text-align: right;
    word-break: break-word;
  }

  .raw-memory-card {
    max-height: 320px;
    overflow: auto;
  }
</style>
