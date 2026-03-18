<script lang="ts">
  import { ChevronLeft, ChevronRight, Cpu, FileText, Loader2, SkipBack, SkipForward } from 'lucide-svelte';
  import { createEventDispatcher, onMount } from 'svelte';
  import highlight from '$lib/highlight';
  import { TH } from '$lib/theme';
  import { currentStepIndex, editorCode, isPlaying, traceSteps } from '$lib/stores';
  import { buildControlButtonStyle, EDITOR_MONO } from './editor-pane-config';

  const dispatch = createEventDispatcher<{
    trace: void;
  }>();

  let code = $editorCode;
  let isTracing = false;
  let hlLine: number | null = null;
  let lineCount = 1;
  let taRef: HTMLTextAreaElement;
  let preRef: HTMLPreElement;
  let lnRef: HTMLDivElement;
  let playing = false;

  $: {
    code = $editorCode;
    lineCount = code.split('\n').length;
  }

  $: total = $traceSteps.length;
  $: curStep = $currentStepIndex;
  $: playing = $isPlaying;

  $: {
    if ($traceSteps && $traceSteps.length > 0 && $traceSteps[$currentStepIndex]) {
      hlLine = $traceSteps[$currentStepIndex].lineNo;
    } else {
      hlLine = null;
    }
  }

  function syncScroll() {
    if (taRef && preRef && lnRef) {
      preRef.scrollTop = taRef.scrollTop;
      preRef.scrollLeft = taRef.scrollLeft;
      lnRef.scrollTop = taRef.scrollTop;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = taRef.selectionStart;
      const end = taRef.selectionEnd;
      code = code.substring(0, start) + '  ' + code.substring(end);
      $editorCode = code;
      setTimeout(() => {
        taRef.selectionStart = taRef.selectionEnd = start + 2;
      }, 0);
    }
  }

  function handleCodeChange() {
    $editorCode = code;
    traceSteps.set([]);
  }

  async function runTrace() {
    isTracing = true;
    dispatch('trace');
    setTimeout(() => {
      isTracing = false;
    }, 500);
  }

  function setCurStep(val: number | ((prev: number) => number)) {
    if (typeof val === 'function') {
      currentStepIndex.update(val);
    } else {
      currentStepIndex.set(val);
    }
  }

  function setPlaying(val: boolean | ((prev: boolean) => boolean)) {
    if (typeof val === 'function') {
      isPlaying.update(val);
    } else {
      isPlaying.set(val);
    }
  }

  let playInterval: number | undefined;

  $: {
    if (playing && total > 0) {
      if (playInterval) clearInterval(playInterval);
      playInterval = window.setInterval(() => {
        if ($currentStepIndex < total - 1) {
          currentStepIndex.update((i) => i + 1);
        } else {
          isPlaying.set(false);
        }
      }, 800);
    } else if (playInterval) {
      clearInterval(playInterval);
      playInterval = undefined;
    }
  }

  onMount(() => () => {
    if (playInterval) clearInterval(playInterval);
  });
</script>

<div style="width: 50%; display: flex; flex-direction: column; border-right: 1px solid {TH.border};">
  <div
    style="display: flex; align-items: center; padding: 5px 10px; background: {TH.bgCard}; border-bottom: 1px solid {TH.border}; gap: 6px;"
  >
    <FileText size={12} color={TH.dimText} />
    <span style="font-family: monospace; color: {TH.bright}; font-size: 11px;">main.c</span>
  </div>

  <div style="display: flex; flex: 1; overflow: hidden; position: relative;">
    <div
      bind:this={lnRef}
      style="width: 38px; padding-top: 12px; padding-bottom: 12px; padding-right: 6px; background: {TH.bgDeep}; border-right: 1px solid {TH.border}; overflow-y: hidden; text-align: right; user-select: none; font-family: {EDITOR_MONO.fontFamily}; font-size: 11px; color: {TH.dimText};"
    >
      {#each Array.from({ length: lineCount }, (_, i) => i) as i}
        <div
          style="line-height: 22px; color: {hlLine === i + 1 ? TH.accent : TH.dimText}; font-weight: {hlLine === i + 1 ? 700 : 400};"
        >
          {i + 1}
        </div>
      {/each}
    </div>

    <div style="flex: 1; position: relative; overflow: hidden;">
      {#if hlLine}
        <div
          style="position: absolute; left: 0; right: 0; top: {(hlLine - 1) * 22 + 12}px; height: 22px; background: {TH.accent}1e; border-left: 3px solid {TH.accent}; pointer-events: none; z-index: 2; transition: top 0.18s ease;"
        ></div>
      {/if}
      <pre
        bind:this={preRef}
        style="position: absolute; inset: 0; margin: 0; padding: 12px; font-family: {EDITOR_MONO.fontFamily}; font-size: {EDITOR_MONO.fontSize}; line-height: {EDITOR_MONO.lineHeight}; color: {TH.bright}; pointer-events: none; overflow: hidden; z-index: 1;"
      >{@html highlight(code)}</pre>
      <textarea
        bind:this={taRef}
        bind:value={code}
        on:input={handleCodeChange}
        on:keydown={onKey}
        on:scroll={syncScroll}
        spellcheck={false}
        style="position: absolute; inset: 0; width: 100%; height: 100%; padding: 12px; margin: 0; font-family: {EDITOR_MONO.fontFamily}; font-size: {EDITOR_MONO.fontSize}; line-height: {EDITOR_MONO.lineHeight}; background: transparent; color: transparent; caret-color: {TH.white}; resize: none; outline: none; overflow: auto; z-index: 3; border: none; tab-size: {EDITOR_MONO.tabSize};"
      ></textarea>
    </div>
  </div>

  <div style="background: {TH.bgCard}; border-top: 1px solid {TH.border}; padding: 10px; display: flex; flex-direction: column; gap: 7px; flex-shrink: 0;">
    <button
      on:click={runTrace}
      disabled={isTracing}
      style="display: flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 0; background: {isTracing ? `${TH.accent}50` : TH.accent}; border: none; border-radius: 7px; color: {TH.white}; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; cursor: {isTracing ? 'not-allowed' : 'pointer'};"
    >
      {#if isTracing}
        <Loader2 size={14} class="animate-spin" />
        Interpreting…
      {:else}
        <Cpu size={14} />
        Trace Execution
      {/if}
    </button>

    {#if $traceSteps && $traceSteps.length > 0}
      <div style="display: flex; gap: 5px;">
        <button
          on:click={() => {
            setCurStep(0);
            setPlaying(false);
          }}
          style={buildControlButtonStyle()}
        >
          <SkipBack size={12} />
        </button>
        <button
          on:click={() => setCurStep((p) => Math.max(0, p - 1))}
          disabled={curStep === 0}
          style={buildControlButtonStyle({ flex: 1, opacity: curStep === 0 ? 0.4 : 1 })}
        >
          <ChevronLeft size={13} />PREV
        </button>
        <button
          on:click={() => setPlaying((p) => !p)}
          style={buildControlButtonStyle({
            flex: 1,
            background: playing ? `${TH.orange}18` : TH.bgRaised,
            color: playing ? TH.orange : TH.midText
          })}
        >
          {playing ? '⏸' : '▶'} {playing ? 'PAUSE' : 'PLAY'}
        </button>
        <button
          on:click={() => setCurStep((p) => Math.min(total - 1, p + 1))}
          disabled={curStep === total - 1}
          style={buildControlButtonStyle({ flex: 1, opacity: curStep === total - 1 ? 0.4 : 1 })}
        >
          NEXT<ChevronRight size={13} />
        </button>
        <button
          on:click={() => {
            setCurStep(total - 1);
            setPlaying(false);
          }}
          style={buildControlButtonStyle()}
        >
          <SkipForward size={12} />
        </button>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div
          role="button"
          tabindex="0"
          on:click={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = e instanceof MouseEvent ? e.clientX : 0;
            setCurStep(Math.min(total - 1, Math.floor(((x - r.left) / r.width) * total)));
            setPlaying(false);
          }}
          on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
            }
          }}
          style="flex: 1; height: 3px; background: {TH.border}; border-radius: 2px; cursor: pointer; overflow: hidden;"
        >
          <div
            style="width: {((curStep + 1) / total) * 100}%; height: 100%; background: {TH.accent}; border-radius: 2px; transition: width 0.15s;"
          ></div>
        </div>
        <span style="color: {TH.dimText}; font-size: 10px; font-family: monospace; white-space: nowrap;">
          {curStep + 1}/{total}
        </span>
      </div>
    {/if}
  </div>
</div>
