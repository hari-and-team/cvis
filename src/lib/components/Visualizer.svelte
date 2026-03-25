<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    ChevronLeft,
    ChevronRight,
    Pause,
    Play,
    SkipBack,
    SkipForward
  } from 'lucide-svelte';
  import RawStateInspector from './RawStateInspector.svelte';
  import { currentStepIndex, editorCode, isPlaying, runSessionId, traceSteps } from '$lib/stores';
  import type { TraceStep } from '$lib/types';
  import type { VisualizerFrame } from '$lib/visualizer/trace-normalization';
  import { normalizeTraceStep } from '$lib/visualizer/trace-normalization';
  import { predictProgramIntent } from '$lib/visualizer/program-intent';

  export let traceStep: TraceStep | null = null;

  interface ArrayView {
    name: string;
    values: Array<{ idx: number; value: unknown }>;
  }

  $: normalizedTrace = normalizeTraceStep(traceStep);
  $: previousTraceStep =
    $currentStepIndex > 0 ? $traceSteps[$currentStepIndex - 1] ?? null : null;
  $: previousNormalizedTrace = normalizeTraceStep(previousTraceStep);
  $: intentPrediction = predictProgramIntent($editorCode);

  $: stackFrames = normalizedTrace.stackFrames;
  $: previousStackFrames = previousNormalizedTrace.stackFrames;
  $: globalFrame = normalizedTrace.globalFrame;
  $: previousGlobalFrame = previousNormalizedTrace.globalFrame;
  $: memoryEntries = normalizedTrace.memoryEntries;
  $: arrays = buildArrayViews(normalizedTrace.arrays);
  $: linkedLists = normalizedTrace.linkedLists;
  $: trees = normalizedTrace.trees;
  $: stackItems = normalizedTrace.stack.values;
  $: queueItems = normalizedTrace.queue.values;
  $: graphs = normalizedTrace.graphs;
  $: totalSteps = $traceSteps.length;
  $: hasStructureViews =
    arrays.length > 0 ||
    linkedLists.length > 0 ||
    trees.length > 0 ||
    stackItems.length > 0 ||
    queueItems.length > 0 ||
    graphs.length > 0;
  $: hasRenderableSections =
    stackFrames.length > 0 ||
    Boolean(globalFrame && Object.keys(globalFrame.locals).length > 0) ||
    arrays.length > 0 ||
    linkedLists.length > 0 ||
    trees.length > 0 ||
    stackItems.length > 0 ||
    queueItems.length > 0 ||
    graphs.length > 0;
  $: isPartialSnapshot = Boolean(traceStep) && !hasStructureViews && hasRenderableSections;
  $: isTraceComplete = totalSteps > 0 && $currentStepIndex >= totalSteps - 1;
  $: flowDescriptor = describeTraceStep(traceStep?.description);

  let playInterval: number | null = null;

  function buildArrayViews(
    source: Array<{ name: string; cells: Array<{ idx: number; value: unknown }> }>
  ): ArrayView[] {
    return source.map((entry) => ({
      name: entry.name,
      values: entry.cells.map((cell) => ({ idx: cell.idx, value: cell.value }))
    }));
  }

  function formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length}]`;

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function formatTechniqueLabel(tag: string): string {
    return tag
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function confidenceClass(confidence: number): string {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.6) return 'confidence-medium';
    return 'confidence-low';
  }

  function valuesEqual(left: unknown, right: unknown): boolean {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return left === right;
    }
  }

  function previousFrameFor(index: number): VisualizerFrame | null {
    return previousStackFrames[index] ?? null;
  }

  function previousGlobalValue(key: string): unknown {
    return previousGlobalFrame?.locals[key];
  }

  function goToTraceStart() {
    isPlaying.set(false);
    currentStepIndex.set(0);
  }

  function goToTraceEnd() {
    if (totalSteps === 0) return;
    isPlaying.set(false);
    currentStepIndex.set(totalSteps - 1);
  }

  function stepTrace(delta: number) {
    if (totalSteps === 0) return;
    isPlaying.set(false);
    currentStepIndex.update((index) => Math.max(0, Math.min(totalSteps - 1, index + delta)));
  }

  function toggleTracePlayback() {
    if (totalSteps === 0) return;

    if (!$isPlaying && $currentStepIndex >= totalSteps - 1) {
      currentStepIndex.set(0);
    }

    isPlaying.update((playing) => !playing);
  }

  function returnToEditor() {
    isPlaying.set(false);
    currentStepIndex.set(0);
    traceSteps.set([]);
  }

  function describeTraceStep(
    description: string | undefined
  ): { label: string; color: string; text: string } | null {
    if (!description) return null;

    const normalized = description.toLowerCase();

    if (/\bprintf\b|\bputs\b|\bputchar\b|output/.test(normalized)) {
      return { label: 'Output', color: 'var(--green)', text: description };
    }

    if (/return/.test(normalized)) {
      return { label: 'Return', color: 'var(--red)', text: description };
    }

    if (/call /.test(normalized)) {
      return { label: 'Call', color: 'var(--orange)', text: description };
    }

    if (/\bfor\b|\bwhile\b|\bloop\b/.test(normalized)) {
      return { label: 'Loop', color: 'var(--purple)', text: description };
    }

    if (/\bif\b|\bcondition\b|\bswitch\b/.test(normalized)) {
      return { label: 'Branch', color: 'var(--cyan)', text: description };
    }

    if (/\bdeclare\b|declaration/.test(normalized)) {
      return { label: 'Declare', color: 'var(--purple)', text: description };
    }

    if (/\bscanf\b|\binput\b/.test(normalized)) {
      return { label: 'Input', color: 'var(--orange)', text: description };
    }

    return { label: 'State', color: 'var(--text-mid)', text: description };
  }

  $: {
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
      <span class="intent-pill {confidenceClass(intentPrediction.confidence)}">
        {intentPrediction.primaryLabel} {Math.round(intentPrediction.confidence * 100)}%
      </span>
      <span class:play-live={$isPlaying} class="play-indicator"></span>
    </div>
  </div>

  <div class="viz-scroll">
    {#if !traceStep}
      <div class="empty-state">
        <div class="empty-title">Ready to visualize</div>
        <div class="empty-copy">Run a trace to inspect program flow, variables, and data structure behavior.</div>
      </div>
    {:else}
      <section class="trace-nav-card">
        <div class="trace-nav-head">
          <div class="trace-nav-copy">
            <span class="trace-nav-title">Trace Controls</span>
            <span class="trace-nav-meta">step {$currentStepIndex + 1} / {totalSteps}</span>
          </div>
          {#if isTraceComplete}
            <span class="trace-complete-pill">Trace complete</span>
          {/if}
        </div>
        <div class="trace-nav-actions">
          <div class="trace-nav-buttons">
            <button type="button" class="trace-btn icon-btn" on:click={goToTraceStart} title="Go to start">
              <SkipBack size={13} />
            </button>
            <button
              type="button"
              class="trace-btn"
              on:click={() => stepTrace(-1)}
              disabled={$currentStepIndex === 0}
            >
              <ChevronLeft size={14} />
              <span>Prev</span>
            </button>
            <button type="button" class="trace-btn trace-play-btn" on:click={toggleTracePlayback}>
              {#if $isPlaying}
                <Pause size={13} />
                <span>Pause</span>
              {:else}
                <Play size={13} />
                <span>{isTraceComplete ? 'Replay' : 'Play'}</span>
              {/if}
            </button>
            <button
              type="button"
              class="trace-btn"
              on:click={() => stepTrace(1)}
              disabled={$currentStepIndex >= totalSteps - 1}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
            <button type="button" class="trace-btn icon-btn" on:click={goToTraceEnd} title="Go to end">
              <SkipForward size={13} />
            </button>
          </div>
          <button type="button" class="trace-exit-btn" on:click={returnToEditor}>
            Back to Editor
          </button>
        </div>
      </section>

      {#if flowDescriptor}
        <section class="viz-section">
          <div class="flow-card" style="--flow-color: {flowDescriptor.color}">
            <span class="flow-badge">{flowDescriptor.label}</span>
            <span class="flow-copy">{flowDescriptor.text}</span>
          </div>
        </section>
      {/if}

      {#if isPartialSnapshot}
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
          <span class="tag active">{intentPrediction.primaryLabel}</span>
          {#each intentPrediction.techniques.slice(0, 4) as technique}
            <span class="tag">{formatTechniqueLabel(technique)}</span>
          {/each}
          <span class="tag subtle">line {traceStep.lineNo ?? '—'}</span>
        </div>
      </section>

      {#if stackFrames.length > 0}
        <section class="viz-section">
          <div class="section-header">
            <span class="section-label">Call Stack</span>
            <div class="section-rule"></div>
          </div>
          <div class="frame-stack">
            {#each [...stackFrames].reverse() as frame, reverseIndex}
              {@const frameIndex = stackFrames.length - 1 - reverseIndex}
              <article class:frame-active={reverseIndex === 0} class="frame-card">
                <div class="frame-head">
                  <div class="frame-name">{frame.name}()</div>
                  {#if reverseIndex === 0}
                    <span class="frame-badge">ACTIVE</span>
                  {/if}
                </div>

                <div class="var-grid">
                  {#if Object.keys(frame.locals).length === 0}
                    <div class="var-empty">empty frame</div>
                  {:else}
                    {#each Object.entries(frame.locals) as [name, value]}
                      <div
                        class:var-changed={!valuesEqual(previousFrameFor(frameIndex)?.locals[name], value)}
                        class="var-card"
                      >
                        <span class="var-name">{name}</span>
                        <span class="var-value">{formatValue(value)}</span>
                      </div>
                    {/each}
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        </section>
      {/if}

      {#if globalFrame && Object.keys(globalFrame.locals).length > 0}
        <section class="viz-section">
          <div class="section-header">
            <span class="section-label">Globals</span>
            <div class="section-rule"></div>
          </div>
          <div class="var-grid">
            {#each Object.entries(globalFrame.locals) as [name, value]}
              <div
                class:var-changed={!valuesEqual(previousGlobalValue(name), value)}
                class="var-card"
              >
                <span class="var-name">{name}</span>
                <span class="var-value">{formatValue(value)}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if arrays.length > 0}
        <section class="viz-section">
          <div class="section-header">
            <span class="section-label">Arrays</span>
            <div class="section-rule"></div>
          </div>
          <div class="array-list">
            {#each arrays as array}
              <article class="array-card">
                <div class="array-head">
                  <span class="array-name">{array.name}</span>
                  <span class="array-meta">{array.values.length} cells</span>
                </div>
                <div class="array-cells">
                  {#each array.values as cell}
                    <div class="array-cell">
                      <span class="array-index">[{cell.idx}]</span>
                      <span class="array-value">{formatValue(cell.value)}</span>
                    </div>
                  {/each}
                </div>
              </article>
            {/each}
          </div>
        </section>
      {/if}

      {#if linkedLists.length > 0}
        <section class="viz-section">
          <div class="section-header">
            <span class="section-label">Linked List</span>
            <div class="section-rule"></div>
          </div>
          <div class="list-stack">
            {#each linkedLists as list}
              <div class="list-row">
                {#each list.nodes as node, index}
                  <div class="list-node-block">
                    <div class="list-node">{node.label}</div>
                    {#if index < list.nodes.length - 1}
                      <span class="list-arrow">-&gt;</span>
                    {/if}
                  </div>
                {/each}
                <span class="list-null">NULL</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if stackItems.length > 0}
        <section class="viz-section">
          <div class="section-header">
            <span class="section-label">Stack</span>
            <div class="section-rule"></div>
          </div>
          <div class="linear-structure">
            {#each stackItems as item}
              <div class="linear-cell">{formatValue(item)}</div>
            {/each}
          </div>
        </section>
      {/if}

      {#if queueItems.length > 0}
        <section class="viz-section">
          <div class="section-header">
            <span class="section-label">Queue</span>
            <div class="section-rule"></div>
          </div>
          <div class="linear-structure">
            {#each queueItems as item}
              <div class="linear-cell">{formatValue(item)}</div>
            {/each}
          </div>
        </section>
      {/if}

      {#if trees.length > 0}
        <section class="viz-section">
          <div class="section-header">
            <span class="section-label">Binary Tree</span>
            <div class="section-rule"></div>
          </div>
          <div class="tree-stack">
            {#each trees as tree}
              <div class="tree-card">
                {#each tree.levels as level}
                  <div class="tree-level">
                    {#each level as node}
                      {#if node}
                        <div class="tree-node">{node.label}</div>
                      {:else}
                        <div class="tree-node tree-node-empty"></div>
                      {/if}
                    {/each}
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if graphs.length > 0}
        <section class="viz-section">
          <div class="section-header">
            <span class="section-label">Graph</span>
            <div class="section-rule"></div>
          </div>
          <div class="graph-stack">
            {#each graphs as graph}
              <article class="graph-card">
                <div class="graph-head">
                  <span class="graph-name">{graph.label}</span>
                  <span class="graph-meta">{graph.nodes.length} nodes · {graph.edges.length} edges</span>
                </div>
                <div class="graph-node-grid">
                  {#each graph.nodes as node}
                    <span class="graph-node-chip">{node.label}</span>
                  {/each}
                </div>
                <div class="graph-edge-list">
                  {#each graph.edges as edge}
                    <span class="graph-edge-chip">{edge.from} -&gt; {edge.to}</span>
                  {/each}
                </div>
              </article>
            {/each}
          </div>
        </section>
      {/if}

      {#if !hasRenderableSections}
        <RawStateInspector
          title="Program State"
          reason={normalizedTrace.fallbackReason}
          {globalFrame}
          {stackFrames}
          {memoryEntries}
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

  .trace-nav-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg-deep) 88%, transparent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .trace-nav-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .trace-nav-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .trace-nav-title {
    color: var(--text-bright);
    font-size: 12px;
    font-weight: 800;
  }

  .trace-nav-meta {
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 10px;
  }

  .trace-complete-pill {
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--green) 32%, transparent);
    background: color-mix(in srgb, var(--green) 12%, transparent);
    color: var(--green);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .trace-nav-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .trace-nav-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .trace-btn,
  .trace-exit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
    background: color-mix(in srgb, var(--bg-raised) 84%, var(--bg-deep));
    color: var(--text-bright);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
  }

  .trace-btn:hover:not(:disabled),
  .trace-exit-btn:hover {
    border-color: color-mix(in srgb, var(--blue) 52%, var(--border));
    background: color-mix(in srgb, var(--blue) 12%, var(--bg-raised));
  }

  .trace-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .trace-play-btn {
    border-color: color-mix(in srgb, var(--green) 28%, var(--border));
    background: color-mix(in srgb, var(--green) 12%, var(--bg-raised));
    color: var(--green);
  }

  .icon-btn {
    min-width: 36px;
    padding-inline: 8px;
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

  .frame-name,
  .array-name {
    color: var(--text-bright);
    font-size: 12px;
    font-weight: 700;
  }

  .frame-badge,
  .array-meta,
  .list-null {
    color: var(--green);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .frame-card .var-grid,
  .array-cells {
    padding: 10px;
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

  .list-node,
  .tree-node {
    width: 42px;
    height: 42px;
    border-radius: 999px;
    border: 2px solid var(--blue);
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

  .list-arrow {
    color: var(--blue);
    font-size: 16px;
    font-weight: 800;
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
