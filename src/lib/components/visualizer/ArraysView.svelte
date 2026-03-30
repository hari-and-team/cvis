<script lang="ts">
  import type { VisualizerArrayView } from '$lib/visualizer/render-model';

  export let arrays: VisualizerArrayView[] = [];

  function emphasisLabel(emphasis: string): string {
    if (emphasis === 'search') return 'search focus';
    if (emphasis === 'delete') return 'delete shift';
    if (emphasis === 'changed') return 'updated';
    return 'stable';
  }

  function arrayMetaLabel(array: VisualizerArrayView): string {
    if (array.matrix) {
      return `${array.matrix.visibleRowCount} x ${array.matrix.visibleColCount} grid`;
    }

    return `${array.cellCount} cells`;
  }
</script>

<section class="viz-section">
  <div class="section-header">
    <span class="section-label">Arrays</span>
    <div class="section-rule"></div>
  </div>
  <div class="array-list">
    {#each arrays as array}
      <article class="array-card">
        <div class="array-head">
          <div class="array-title-block">
            <span class="array-name">{array.name}</span>
            <span class="array-meta">{arrayMetaLabel(array)}</span>
          </div>
          {#if array.recentDeletedValues.length > 0}
            <div class="array-alert-list">
              {#each array.recentDeletedValues as deletedValue}
                <span class="array-alert-chip">Deleted {deletedValue}</span>
              {/each}
            </div>
          {/if}
        </div>
        {#if array.matrix}
          <div class="matrix-shell">
            <div class="matrix-grid" style={`--matrix-cols: ${array.matrix.visibleColCount};`}>
              <div class="matrix-corner"></div>
              {#each Array.from({ length: array.matrix.visibleColCount }, (_, colIndex) => colIndex) as colIndex}
                <div class="matrix-axis-label">c{colIndex}</div>
              {/each}

              {#each array.matrix.rows as row}
                <div class="matrix-axis-label matrix-axis-row">r{row.row}</div>
                {#each row.cells as cell}
                  <div
                    class="array-cell matrix-cell"
                    class:array-cell-search={cell.emphasis === 'search'}
                    class:array-cell-delete={cell.emphasis === 'delete'}
                    class:array-cell-changed={cell.emphasis === 'changed'}
                  >
                    <span class="matrix-coordinate">[{cell.row}][{cell.col}]</span>
                    <span class="array-value">{cell.displayValue}</span>
                    {#if cell.emphasis !== 'default'}
                      <span class="array-cell-badge">{emphasisLabel(cell.emphasis)}</span>
                    {/if}
                  </div>
                {/each}
              {/each}
            </div>
          </div>
        {:else}
          <div class="array-cells">
            {#each array.values as cell}
              <div class="array-cell" class:array-cell-search={cell.emphasis === 'search'} class:array-cell-delete={cell.emphasis === 'delete'} class:array-cell-changed={cell.emphasis === 'changed'}>
                <span class="array-index">[{cell.idx}]</span>
                <span class="array-value">{cell.displayValue}</span>
                {#if cell.emphasis !== 'default'}
                  <span class="array-cell-badge">{emphasisLabel(cell.emphasis)}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
  .array-title-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .array-alert-list {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .array-alert-chip {
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--red) 40%, transparent);
    background: color-mix(in srgb, var(--red) 14%, transparent);
    color: color-mix(in srgb, var(--red) 86%, white 14%);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  .array-cell {
    position: relative;
    overflow: hidden;
  }

  .array-cell::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    transition: opacity 160ms ease;
  }

  .array-cell-search {
    border-color: color-mix(in srgb, var(--yellow) 56%, var(--orange));
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--yellow) 22%, var(--bg-card)) 0%,
        color-mix(in srgb, var(--orange) 12%, var(--bg-deep)) 100%
      );
    box-shadow: 0 10px 22px color-mix(in srgb, var(--yellow) 20%, transparent);
    transform: translateY(-1px);
  }

  .array-cell-search::after {
    opacity: 1;
    background: radial-gradient(circle at top center, color-mix(in srgb, #ffe9a3 55%, transparent), transparent 58%);
  }

  .array-cell-delete {
    border-color: color-mix(in srgb, var(--red) 60%, var(--orange));
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--red) 20%, var(--bg-card)) 0%,
        color-mix(in srgb, var(--orange) 10%, var(--bg-deep)) 100%
      );
    box-shadow: 0 10px 22px color-mix(in srgb, var(--red) 18%, transparent);
  }

  .array-cell-delete::after {
    opacity: 1;
    background: linear-gradient(135deg, color-mix(in srgb, #ffd0d5 34%, transparent), transparent 62%);
  }

  .array-cell-changed {
    border-color: color-mix(in srgb, var(--blue) 42%, transparent);
    background: color-mix(in srgb, var(--blue) 12%, var(--bg-card));
  }

  .array-cell-badge {
    color: color-mix(in srgb, var(--text-mid) 74%, var(--text-bright));
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .matrix-shell {
    padding: 10px;
    overflow-x: auto;
  }

  .matrix-grid {
    display: grid;
    grid-template-columns: minmax(42px, auto) repeat(var(--matrix-cols), minmax(72px, 1fr));
    gap: 8px;
    min-width: max-content;
    align-items: stretch;
  }

  .matrix-corner,
  .matrix-axis-label {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: color-mix(in srgb, var(--text-mid) 78%, var(--text-dim));
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .matrix-axis-label {
    min-height: 28px;
    border: 1px dashed color-mix(in srgb, var(--border) 72%, transparent);
    background: color-mix(in srgb, var(--bg-card) 42%, transparent);
  }

  .matrix-axis-row {
    min-width: 42px;
  }

  .matrix-cell {
    min-width: 72px;
    min-height: 72px;
    justify-content: center;
  }

  .matrix-coordinate {
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  @media (max-width: 640px) {
    .array-head {
      align-items: flex-start;
    }

    .array-alert-list {
      justify-content: flex-start;
    }

    .matrix-grid {
      grid-template-columns: minmax(36px, auto) repeat(var(--matrix-cols), minmax(64px, 1fr));
      gap: 6px;
    }

    .matrix-cell {
      min-width: 64px;
      min-height: 64px;
    }
  }
</style>
