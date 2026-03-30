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
  $: latestRemovedItem = recentlyRemoved[0] ?? null;
  $: olderRemovedItems = recentlyRemoved.slice(1);
</script>

<section class="viz-section">
  <div class="section-header">
    <span class="section-label">{label}</span>
    <div class="section-rule"></div>
  </div>

  {#if isStack}
    <div class="stack-layout">
      <div class="stack-shell">
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

      <div class="stack-pop-connector" aria-hidden="true">
        <span class="stack-pop-arrow">-></span>
        <span class="stack-pop-arrow-label">pop</span>
      </div>

      <div class="stack-pop-side">
        <div class="stack-pop-head">
          <span class="stack-pop-pill">{resolvedRemovedLabel}</span>
        </div>
        <div class="stack-pop-lane">
          {#if recentlyRemoved.length > 0}
            {#if latestRemovedItem}
              <div class="stack-pop-primary">
                <div
                  class="stack-block stack-block-popped"
                  in:fly={{ x: 18, duration: 220, opacity: 0.12 }}
                  out:fly={{ x: 18, duration: 180, opacity: 0 }}
                >
                  <span class="stack-block-value">{latestRemovedItem}</span>
                  <span class="stack-pop-tag">Removed</span>
                </div>
              </div>
            {/if}

            {#if olderRemovedItems.length > 0}
              <div class="stack-pop-history">
                <span class="stack-pop-history-label">Earlier removed</span>
                {#each olderRemovedItems as item, index (`history:${index}:${item}`)}
                  <div
                    class="stack-block stack-block-popped stack-block-history"
                    in:fly={{ x: 18, duration: 220, opacity: 0.12 }}
                    out:fly={{ x: 18, duration: 180, opacity: 0 }}
                    animate:flip={{ duration: 220 }}
                  >
                    <span class="stack-block-value">{item}</span>
                    <span class="stack-pop-tag">Removed</span>
                  </div>
                {/each}
              </div>
            {/if}
          {:else}
            <div class="stack-pop-empty">No removed items yet</div>
          {/if}
        </div>
      </div>
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
    width: min(500px, 100%);
    display: grid;
    grid-template-columns: minmax(0, 240px) auto minmax(0, 170px);
    gap: 8px;
    align-items: start;
    justify-content: center;
  }

  .stack-shell {
    display: flex;
    flex-direction: column;
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

  .stack-block.stack-block-popped {
    border-color: color-mix(in srgb, var(--red) 34%, transparent);
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--red) 16%, var(--bg-raised)) 0%,
        color-mix(in srgb, var(--bg-card) 76%, var(--bg-deep)) 100%
      );
    color: color-mix(in srgb, var(--text-mid) 88%, var(--text-dim));
    box-shadow: 0 8px 16px color-mix(in srgb, var(--red) 10%, transparent);
    opacity: 0.78;
  }

  .stack-pop-side {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 100%;
  }

  .stack-pop-connector {
    min-height: 280px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: color-mix(in srgb, var(--red) 82%, var(--orange));
  }

  .stack-pop-arrow {
    font-size: 26px;
    line-height: 1;
    font-weight: 900;
    text-shadow: 0 0 14px color-mix(in srgb, var(--red) 20%, transparent);
  }

  .stack-pop-arrow-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .stack-pop-head {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .stack-pop-pill {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--red) 34%, transparent);
    background: color-mix(in srgb, var(--red) 10%, transparent);
    color: var(--red);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .stack-pop-lane {
    min-height: 92px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px dashed color-mix(in srgb, var(--red) 26%, transparent);
    border-radius: 16px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--red) 7%, transparent) 0%,
        color-mix(in srgb, var(--bg-deep) 86%, transparent) 100%
      );
  }

  .stack-pop-primary {
    padding: 8px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--red) 24%, transparent);
    background: color-mix(in srgb, var(--red) 6%, transparent);
  }

  .stack-pop-history {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 2px;
  }

  .stack-pop-history-label {
    color: color-mix(in srgb, var(--text-mid) 82%, var(--text-dim));
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .stack-block.stack-block-popped.stack-block-history {
    opacity: 0.6;
    transform: scale(0.98);
  }

  .stack-pop-empty {
    min-height: 68px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed color-mix(in srgb, var(--red) 18%, transparent);
    border-radius: 12px;
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 11px;
    font-style: italic;
    text-align: center;
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

  .stack-pop-tag {
    color: var(--red);
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

  @media (max-width: 640px) {
    .stack-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .stack-pop-connector {
      min-height: 0;
      flex-direction: row;
    }

    .stack-pop-arrow {
      transform: rotate(90deg);
    }

    .stack-pop-side {
      width: min(240px, 100%);
      justify-self: center;
    }
  }
</style>
