<script lang="ts">
  import { onDestroy } from 'svelte';
  import './visualizer/visualizer.css';
  import RawStateInspector from './RawStateInspector.svelte';
  import ArraysView from '$lib/components/visualizer/ArraysView.svelte';
  import FrameStackView from '$lib/components/visualizer/FrameStackView.svelte';
  import GlobalsView from '$lib/components/visualizer/GlobalsView.svelte';
  import GraphView from '$lib/components/visualizer/GraphView.svelte';
  import LinkedListView from '$lib/components/visualizer/LinkedListView.svelte';
  import LinearStructureView from '$lib/components/visualizer/LinearStructureView.svelte';
  import PointerMapView from '$lib/components/visualizer/PointerMapView.svelte';
  import StructBlocksView from '$lib/components/visualizer/StructBlocksView.svelte';
  import TreeView from '$lib/components/visualizer/TreeView.svelte';
  import { currentStepIndex, editorCode, isPlaying, runSessionId, traceSteps } from '$lib/stores';
  import type { TraceStep } from '$lib/types';
  import { buildVisualizerRenderModel } from '$lib/visualizer/render-model';

  export let traceStep: TraceStep | null = null;
  $: previousTraceStep =
    $currentStepIndex > 0 ? $traceSteps[$currentStepIndex - 1] ?? null : null;
  $: traceHistory =
    traceStep && $currentStepIndex >= 0 ? $traceSteps.slice(0, $currentStepIndex + 1) : [];
  $: renderModel = buildVisualizerRenderModel(
    traceStep,
    previousTraceStep,
    $editorCode,
    traceHistory
  );

  let playInterval: number | null = null;
  let scrollRef: HTMLDivElement | null = null;
  let smoothScrollFrame: number | null = null;
  let smoothScrollTarget = 0;
  let smoothScrollVelocity = 0;

  function confidenceClass(confidence: number): string {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.6) return 'confidence-medium';
    return 'confidence-low';
  }

  function clampScrollTarget(next: number): number {
    if (!scrollRef) return 0;
    const maxScroll = Math.max(0, scrollRef.scrollHeight - scrollRef.clientHeight);
    return Math.max(0, Math.min(maxScroll, next));
  }

  function stopSmoothScroll() {
    if (smoothScrollFrame !== null) {
      cancelAnimationFrame(smoothScrollFrame);
      smoothScrollFrame = null;
    }
  }

  function animateSmoothScroll() {
    if (!scrollRef) {
      stopSmoothScroll();
      return;
    }

    const current = scrollRef.scrollTop;
    const delta = smoothScrollTarget - current;
    smoothScrollVelocity = smoothScrollVelocity * 0.72 + delta * 0.16;

    if (Math.abs(delta) < 0.5 && Math.abs(smoothScrollVelocity) < 0.5) {
      scrollRef.scrollTop = smoothScrollTarget;
      smoothScrollVelocity = 0;
      stopSmoothScroll();
      return;
    }

    scrollRef.scrollTop = clampScrollTarget(current + smoothScrollVelocity);
    smoothScrollFrame = requestAnimationFrame(animateSmoothScroll);
  }

  function handleVizWheel(event: WheelEvent) {
    if (!scrollRef || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    const baseline = smoothScrollFrame === null ? scrollRef.scrollTop : smoothScrollTarget;
    const dampedDelta = event.deltaY * 0.72;
    smoothScrollTarget = clampScrollTarget(baseline + dampedDelta);

    if (smoothScrollFrame === null) {
      smoothScrollVelocity = 0;
      smoothScrollFrame = requestAnimationFrame(animateSmoothScroll);
    }
  }

  $: {
    const totalSteps = $traceSteps.length;
    if ($isPlaying && totalSteps > 0 && typeof window !== 'undefined') {
      if (playInterval !== null) {
        clearInterval(playInterval);
      }
      playInterval = window.setInterval(() => {
        if ($currentStepIndex < totalSteps - 1) {
          currentStepIndex.update((index) => index + 1);
        } else {
          isPlaying.set(false);
        }
      }, 760);
    } else if (playInterval !== null) {
      clearInterval(playInterval);
      playInterval = null;
    }
  }

  onDestroy(() => {
    if (playInterval !== null) {
      clearInterval(playInterval);
    }
    stopSmoothScroll();
    isPlaying.set(false);
  });
</script>

<div class="visualizer-shell">
  <div class="viz-toolbar">
    <div class="viz-title-block">
      <div class="viz-title">Execution Visualizer</div>
      <div class="viz-subtitle">
        line {traceStep?.lineNo ?? '—'} · step {traceStep?.stepNumber ?? '—'} / {$traceSteps.length || '—'}
      </div>
    </div>

    <div class="viz-meta">
      <span class="intent-pill {confidenceClass(renderModel.intentConfidence)}">
        {renderModel.intentLabel} {Math.round(renderModel.intentConfidence * 100)}%
      </span>
      <span class:play-live={$isPlaying} class="play-indicator"></span>
    </div>
  </div>

  <div bind:this={scrollRef} class="viz-scroll" on:wheel={handleVizWheel}>
    {#if !traceStep}
      <div class="empty-state">
        <div class="empty-title">Ready to visualize</div>
        <div class="empty-copy">Run a trace to inspect program flow, variables, and data structure behavior.</div>
      </div>
    {:else}
      {#if renderModel.flowDescriptor}
        <section class="viz-section">
          <div class="flow-card" style="--flow-color: {renderModel.flowDescriptor.color}">
            <span class="flow-badge">{renderModel.flowDescriptor.label}</span>
            <span class="flow-copy">{renderModel.flowDescriptor.text}</span>
          </div>
        </section>
      {/if}

      {#if renderModel.isPartialSnapshot}
        <section class="viz-section">
          <div class="state-banner">
            <span class="state-banner-title">Program state snapshot</span>
            <span class="state-banner-copy">
              This step has useful variables and function state, but not enough recognized structure data yet
              for a richer animation.
            </span>
          </div>
        </section>
      {/if}

      <section class="viz-section">
        <div class="section-header">
          <span class="section-label">Detected</span>
          <div class="section-rule"></div>
        </div>
        <div class="tag-row">
          <span class="tag active">{renderModel.intentLabel}</span>
          {#each renderModel.techniques as technique}
            <span class="tag">{technique}</span>
          {/each}
          <span class="tag subtle">line {traceStep.lineNo ?? '—'}</span>
        </div>
      </section>

      {#if renderModel.stackFrames.length > 0}
        <FrameStackView frames={renderModel.stackFrames} />
      {/if}

      {#if renderModel.globalValues.length > 0}
        <GlobalsView globals={renderModel.globalValues} />
      {/if}

      {#if renderModel.structBlocks.length > 0}
        <StructBlocksView structBlocks={renderModel.structBlocks} />
      {/if}

      {#if renderModel.arrays.length > 0}
        <ArraysView arrays={renderModel.arrays} />
      {/if}

      {#if renderModel.linkedLists.length > 0}
        <LinkedListView linkedLists={renderModel.linkedLists} />
      {/if}

      {#if renderModel.pointerRefs.length > 0}
        <PointerMapView pointerRefs={renderModel.pointerRefs} />
      {/if}

      {#if renderModel.stackItems.length > 0 || renderModel.poppedStackItems.length > 0}
        <LinearStructureView
          label="Stack"
          stackItems={renderModel.stackItems}
          poppedItems={renderModel.poppedStackItems}
        />
      {/if}

      {#if renderModel.queueItems.length > 0}
        <LinearStructureView label="Queue" values={renderModel.queueItems} />
      {/if}

      {#if renderModel.trees.length > 0}
        <TreeView trees={renderModel.trees} />
      {/if}

      {#if renderModel.graphs.length > 0}
        <GraphView graphs={renderModel.graphs} />
      {/if}

      {#if !renderModel.hasRenderableSections}
        <RawStateInspector
          title="Program State"
          reason={renderModel.fallbackReason}
          globalFrame={renderModel.rawGlobalFrame}
          stackFrames={renderModel.rawStackFrames}
          memoryEntries={renderModel.memoryEntries}
        />
      {/if}
    {/if}
  </div>

  {#if $runSessionId}
    <div class="viz-footer-note">
      Runtime stdin is available in the <span>Console</span> tab.
    </div>
  {/if}
</div>

<style>
  .visualizer-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--bg-card) 92%, var(--bg-deep)) 0%,
        color-mix(in srgb, var(--bg-deep) 88%, #000 12%) 100%
      ),
      radial-gradient(circle at top right, color-mix(in srgb, var(--blue) 14%, transparent), transparent 42%);
    color: var(--text-bright);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .viz-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: color-mix(in srgb, var(--bg-deep) 88%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
  }

  .viz-title {
    color: var(--text-bright);
    font-size: 13px;
    font-weight: 800;
  }

  .viz-subtitle {
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 10px;
    margin-top: 2px;
  }

  .viz-meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .flow-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--flow-color) 30%, #1e2d4a);
    background: color-mix(in srgb, var(--flow-color) 10%, #0f1629);
  }

  .flow-badge {
    margin-top: 1px;
    padding: 2px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--flow-color) 18%, transparent);
    color: var(--flow-color);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .flow-copy {
    color: var(--text-bright);
    font-size: 12px;
    line-height: 1.55;
  }

  .state-banner {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--text-mid) 22%, transparent);
    background: color-mix(in srgb, var(--text-mid) 8%, transparent);
  }

  .state-banner-title {
    color: var(--text-bright);
    font-size: 11px;
    font-weight: 800;
  }

  .state-banner-copy {
    color: color-mix(in srgb, var(--text-mid) 85%, var(--text-dim));
    font-size: 11px;
    line-height: 1.55;
  }

  .intent-pill {
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
    background: color-mix(in srgb, var(--bg-raised) 84%, var(--bg-deep));
    padding: 4px 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .confidence-high {
    color: var(--green);
  }

  .confidence-medium {
    color: var(--blue);
  }

  .confidence-low {
    color: var(--orange);
  }

  .play-indicator {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-dim) 75%, var(--border));
  }

  .play-indicator.play-live {
    background: var(--green);
    box-shadow: 0 0 10px color-mix(in srgb, var(--green) 45%, transparent);
  }

  .viz-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    scroll-behavior: smooth;
    overscroll-behavior: contain;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--bg-card) 70%, var(--bg-deep)) 0%,
        color-mix(in srgb, var(--bg-deep) 92%, #000 8%) 100%
      ),
      radial-gradient(circle at top left, color-mix(in srgb, var(--blue) 10%, transparent), transparent 40%);
  }

  .empty-state {
    flex: 1;
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
  }

  .empty-title {
    color: var(--text-bright);
    font-size: 16px;
    font-weight: 800;
  }

  .empty-copy {
    max-width: 340px;
    font-size: 11px;
    line-height: 1.7;
  }

  .viz-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-label {
    color: color-mix(in srgb, var(--text-mid) 78%, var(--text-dim));
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .section-rule {
    flex: 1;
    height: 1px;
    background: color-mix(in srgb, var(--border) 82%, transparent);
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--blue) 28%, transparent);
    background: color-mix(in srgb, var(--blue) 8%, transparent);
    color: color-mix(in srgb, var(--blue) 88%, #ffffff 12%);
    font-size: 10px;
    font-weight: 700;
  }

  .tag.active {
    border-color: color-mix(in srgb, var(--green) 35%, transparent);
    background: color-mix(in srgb, var(--green) 10%, transparent);
    color: var(--green);
  }

  .tag.subtle {
    border-color: color-mix(in srgb, var(--text-mid) 18%, transparent);
    background: color-mix(in srgb, var(--text-mid) 8%, transparent);
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
  }

  .var-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
  }

  .var-card,
  .array-card,
  .frame-card,
  .tree-card {
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background: color-mix(in srgb, var(--bg-deep) 88%, transparent);
  }

  .var-name,
  .array-index {
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .var-value {
    color: var(--text-bright);
    font-size: 14px;
    font-weight: 700;
    word-break: break-word;
  }

  .var-value.var-value-pointer {
    color: var(--cyan);
  }

  .frame-stack,
  .array-list,
  .list-stack,
  .tree-stack,
  .graph-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .frame-card {
    overflow: hidden;
  }

  .frame-card.frame-active {
    border-color: color-mix(in srgb, var(--blue) 48%, var(--border));
    box-shadow: 0 0 18px color-mix(in srgb, var(--blue) 16%, transparent);
  }

  .frame-head,
  .array-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background: color-mix(in srgb, var(--bg-raised) 86%, var(--bg-deep));
  }

  .frame-head-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .frame-name,
  .array-name {
    color: var(--text-bright);
    font-size: 12px;
    font-weight: 700;
  }

  .frame-caption {
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .frame-badge,
  .array-meta,
  .list-null {
    color: var(--green);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .array-cells {
    padding: 10px;
  }

  .frame-ref-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 10px 10px;
  }

  .pointer-chip {
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--cyan) 34%, transparent);
    background: color-mix(in srgb, var(--cyan) 10%, transparent);
    color: var(--cyan);
    font-size: 10px;
    font-weight: 700;
  }

  .var-card {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .var-card.var-changed {
    border-color: color-mix(in srgb, var(--blue) 48%, var(--border));
    background: color-mix(in srgb, var(--blue) 12%, var(--bg-raised));
  }

  .var-empty {
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 11px;
    font-style: italic;
    padding: 10px 2px;
  }

  .array-cells,
  .linear-structure {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .array-cell,
  .linear-cell {
    min-width: 54px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background: color-mix(in srgb, var(--bg-card) 70%, var(--bg-deep));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .array-value,
  .linear-cell {
    color: var(--text-bright);
    font-size: 12px;
    font-weight: 700;
  }

  .list-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background: color-mix(in srgb, var(--bg-deep) 88%, transparent);
  }

  .list-node-block {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .linked-struct-card {
    min-width: 132px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--blue) 34%, var(--border));
    background: color-mix(in srgb, var(--bg-raised) 88%, var(--bg-deep));
    overflow: hidden;
  }

  .linked-struct-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background: color-mix(in srgb, var(--blue) 10%, transparent);
  }

  .linked-struct-title,
  .linked-struct-address {
    font-size: 10px;
    font-weight: 700;
  }

  .linked-struct-title {
    color: var(--text-bright);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .linked-struct-address {
    color: var(--cyan);
  }

  .linked-struct-fields,
  .struct-field-list {
    display: flex;
    flex-direction: column;
  }

  .linked-struct-field,
  .struct-field-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 8px 10px;
    border-top: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
  }

  .linked-struct-field:first-child,
  .struct-field-row:first-child {
    border-top: none;
  }

  .linked-struct-key,
  .struct-field-name {
    color: color-mix(in srgb, var(--text-mid) 78%, var(--text-dim));
    font-size: 10px;
  }

  .linked-struct-value,
  .struct-field-value {
    color: var(--text-bright);
    font-size: 11px;
    font-weight: 700;
  }

  .linked-struct-value.linked-struct-value-pointer,
  .struct-field-value.struct-field-pointer {
    color: var(--cyan);
  }

  .list-arrow {
    color: var(--blue);
    font-size: 18px;
    font-weight: 800;
  }

  .struct-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }

  .struct-block {
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--purple) 28%, var(--border));
    background: color-mix(in srgb, var(--bg-deep) 88%, transparent);
    overflow: hidden;
  }

  .struct-block.struct-block-inline {
    border-color: color-mix(in srgb, var(--orange) 26%, var(--border));
  }

  .struct-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background: color-mix(in srgb, var(--purple) 9%, transparent);
  }

  .struct-head-copy,
  .struct-badges {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .struct-badges {
    align-items: flex-end;
  }

  .struct-title {
    color: var(--text-bright);
    font-size: 12px;
    font-weight: 800;
  }

  .struct-meta {
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 10px;
  }

  .malloc-badge,
  .struct-address {
    font-size: 10px;
    font-weight: 700;
  }

  .malloc-badge {
    color: var(--green);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .struct-address {
    color: var(--cyan);
  }

  .tree-node {
    width: 42px;
    height: 42px;
    border-radius: 999px;
    border: 2px solid var(--orange);
    background: color-mix(in srgb, var(--bg-raised) 84%, var(--bg-deep));
    color: var(--text-bright);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
    text-align: center;
    padding: 4px;
    box-sizing: border-box;
  }

  .tree-card {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-x: auto;
  }

  .tree-level {
    display: flex;
    justify-content: center;
    gap: 14px;
    min-width: max-content;
  }

  .tree-node {
    border-color: var(--orange);
  }

  .tree-node-empty {
    opacity: 0;
  }

  .graph-card {
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background: color-mix(in srgb, var(--bg-deep) 88%, transparent);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .graph-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .graph-name {
    color: var(--text-bright);
    font-size: 12px;
    font-weight: 700;
  }

  .graph-meta {
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .graph-node-grid,
  .graph-edge-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .graph-node-chip,
  .graph-edge-chip {
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    background: color-mix(in srgb, var(--bg-card) 76%, var(--bg-deep));
    color: var(--text-bright);
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
  }

  .graph-node-chip {
    border-color: color-mix(in srgb, var(--cyan) 38%, transparent);
    color: var(--cyan);
  }

  .graph-edge-chip {
    border-color: color-mix(in srgb, var(--green) 34%, transparent);
    color: var(--green);
  }

  .pointer-ref-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .pointer-ref-item {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--cyan) 28%, transparent);
    background: color-mix(in srgb, var(--cyan) 8%, transparent);
    color: var(--cyan);
    font-size: 10px;
    font-weight: 700;
  }

  .viz-footer-note {
    padding: 8px 14px;
    border-top: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background: color-mix(in srgb, var(--bg-deep) 92%, transparent);
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 10px;
  }

  .viz-footer-note span {
    color: var(--green);
    font-weight: 700;
  }
</style>
