<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';

  export let label = 'Structure';
  export let values: string[] = [];
  export let recentlyRemoved: string[] = [];
  export let removedLabel: string | null = null;

  $: normalizedLabel = label.trim().toLowerCase();
  $: isStack = normalizedLabel === 'stack';
  $: resolvedRemovedLabel = removedLabel ?? (isStack ? 'Popped values' : 'Removed values');
</script>

<section class="viz-section">
  <div class="section-header">
    <span class="section-label">{label}</span>
    <div class="section-rule"></div>
  </div>

  {#if isStack}
    <div class="stack-layout">
      <div class="stack-visualizer">
        <div class="stack-top-rail">
          <span class="stack-top-pill">Top</span>
        </div>

        <div class="stack-chamber">
          {#if values.length === 0}
            <div class="stack-empty-state">Empty stack</div>
          {:else}
            <div class="stack-column">
              {#each values as item, index (`${index}:${item}`)}
                <div
                  class:stack-block-top={index === values.length - 1}
                  class="stack-block"
                  in:fly={{ y: -28, duration: 220, opacity: 0.18 }}
                  out:fly={{ y: -28, duration: 180, opacity: 0 }}
                  animate:flip={{ duration: 220 }}
                >
                  <span class="stack-block-value">{item}</span>
                  {#if index === values.length - 1}
                    <span class="stack-top-tag">Top</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      {#if recentlyRemoved.length > 0}
        <aside class="removed-panel">
          <span class="removed-panel-label">{resolvedRemovedLabel}</span>
          <div class="removed-panel-arrow" aria-hidden="true">→</div>
          <div class="removed-panel-list">
            {#each recentlyRemoved as item, index (`${index}:${item}`)}
              <div class="removed-panel-chip">{item}</div>
            {/each}
          </div>
        </aside>
      {/if}
    </div>
  {:else}
    <div class="linear-structure">
      {#each values as item}
        <div class="linear-cell">{item}</div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .stack-layout {
    display: grid;
    grid-template-columns: minmax(0, 240px) minmax(120px, 180px);
    gap: 14px;
    align-items: start;
  }

  .stack-visualizer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .stack-top-rail {
    width: min(240px, 100%);
    display: flex;
    justify-content: flex-end;
    padding-right: 6px;
  }

  .stack-top-pill {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--cyan) 38%, transparent);
    background: color-mix(in srgb, var(--cyan) 10%, transparent);
    color: var(--cyan);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .stack-chamber {
    width: min(240px, 100%);
    min-height: 280px;
    padding: 14px 12px 12px;
    border-left: 3px solid color-mix(in srgb, var(--orange) 72%, transparent);
    border-right: 3px solid color-mix(in srgb, var(--orange) 72%, transparent);
    border-bottom: 3px solid color-mix(in srgb, var(--orange) 72%, transparent);
    border-radius: 0 0 16px 16px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--bg-card) 86%, transparent) 0%,
        color-mix(in srgb, var(--bg-deep) 92%, transparent) 100%
      );
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--text-bright) 5%, transparent),
      0 14px 26px color-mix(in srgb, var(--orange) 10%, transparent);
    overflow: hidden;
  }

  .stack-column {
    min-height: 248px;
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-start;
    gap: 8px;
  }

  .stack-block {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 42px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--blue) 28%, transparent);
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--bg-raised) 88%, var(--bg-deep)) 0%,
        color-mix(in srgb, var(--bg-card) 84%, var(--bg-deep)) 100%
      );
    color: var(--text-bright);
    box-shadow: 0 8px 16px color-mix(in srgb, var(--blue) 10%, transparent);
  }

  .stack-block.stack-block-top {
    border-color: color-mix(in srgb, var(--green) 36%, transparent);
    box-shadow: 0 10px 20px color-mix(in srgb, var(--green) 12%, transparent);
  }

  .stack-block-value {
    font-size: 13px;
    font-weight: 800;
  }

  .stack-top-tag {
    color: var(--green);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .stack-empty-state {
    min-height: 248px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed color-mix(in srgb, var(--border) 78%, transparent);
    border-radius: 12px;
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 11px;
    font-style: italic;
  }

  .removed-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--red) 42%, transparent);
    background:
      radial-gradient(circle at top center, color-mix(in srgb, var(--red) 16%, transparent), transparent 60%),
      color-mix(in srgb, var(--bg-deep) 92%, transparent);
    box-shadow: 0 12px 24px color-mix(in srgb, var(--red) 14%, transparent);
  }

  .removed-panel-label {
    color: color-mix(in srgb, var(--red) 82%, white 18%);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .removed-panel-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .removed-panel-arrow {
    color: color-mix(in srgb, var(--red) 70%, white 10%);
    font-size: 18px;
    font-weight: 900;
    line-height: 1;
  }

  .removed-panel-chip {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--red) 48%, transparent);
    background: color-mix(in srgb, var(--red) 12%, var(--bg-card));
    color: color-mix(in srgb, var(--red) 86%, white 14%);
    font-size: 14px;
    font-weight: 800;
    text-align: center;
    box-shadow: 0 10px 22px color-mix(in srgb, var(--red) 14%, transparent);
  }

  @media (max-width: 720px) {
    .stack-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
