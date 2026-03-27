<script lang="ts">
  export let arrays: Array<{
    name: string;
    values: Array<{ idx: number; displayValue: string }>;
    totalCells: number;
    visibleCells: number;
    hiddenCells: number;
    isSummarized: boolean;
    summaryLabel: string | null;
  }> = [];
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
          <div class="array-head-copy">
            <span class="array-name">{array.name}</span>
            {#if array.summaryLabel}
              <span class="array-summary">{array.summaryLabel}</span>
            {/if}
          </div>
          <span class="array-meta">
            {#if array.isSummarized}
              {array.visibleCells} shown / {array.totalCells}
            {:else}
              {array.totalCells} cells
            {/if}
          </span>
        </div>
        <div class="array-cells">
          {#each array.values as cell}
            <div class="array-cell">
              <span class="array-index">[{cell.idx}]</span>
              <span class="array-value">{cell.displayValue}</span>
            </div>
          {/each}
        </div>
        {#if array.hiddenCells > 0}
          <div class="array-truncation-note">
            {array.hiddenCells} unchanged or unhelpful cells hidden to keep the visualizer readable.
          </div>
        {/if}
      </article>
    {/each}
  </div>
</section>
