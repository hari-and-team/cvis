<!--
  Visualizer.svelte
  Drop into: src/lib/components/Visualizer.svelte

  Props:
    traceStep    — TraceStep | null   (current step from /api/trace)
    dataStructures — any[]            (optional: pre-parsed DS hints)

  Reads from stores:
    traceSteps, currentStepIndex, isPlaying

  Design: dark terminal / blueprint — matches cvis theme (#0a0e1a, #0f1629)
  Tailwind classes only, no inline style blocks.
-->

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { traceSteps, currentStepIndex, isPlaying } from '$lib/stores';
  import type { TraceStep } from '$lib/types';

  // ── Props ────────────────────────────────────────────
  export let traceStep: TraceStep | null = null;
  export let dataStructures: any[] = [];

  // ── Internal state ───────────────────────────────────
  type DSMode = 'auto' | 'linkedlist' | 'array' | 'stack' | 'tree';
  let mode: DSMode = 'auto';
  let highlightAddr: string | null = null;
  let canvasEl: HTMLElement;

  // ── Parsed memory snapshot ───────────────────────────
  interface MemNode { addr: string; val: string | number; next: string | null; }
  interface MemArray { name: string; cells: { idx: number; val: string | number; active: boolean }[]; }
  interface StackFrame { name: string; locals: Record<string, string | number>; }

  $: memNodes   = parseLinkedList(traceStep?.memory ?? {});
  $: memArrays  = parseArrays(traceStep?.memory ?? {});
  $: stackFrames = (traceStep?.stackFrames ?? []) as StackFrame[];
  $: registers   = traceStep?.registers ?? {};
  $: detectedMode = dataStructures.length > 0 ? 'auto' : detectMode(traceStep);
  $: activeMode   = mode === 'auto' ? detectedMode : mode;

  // ── Memory parsers ───────────────────────────────────
  // Expects memory keys like "node_0x2a00", "arr[0]", etc.
  function parseLinkedList(mem: Record<string, any>): MemNode[] {
    const nodes: MemNode[] = [];
    Object.entries(mem).forEach(([k, v]) => {
      if (k.startsWith('node_') || (typeof v === 'object' && v !== null && 'next' in v)) {
        nodes.push({
          addr: k.replace('node_', ''),
          val: v?.data ?? v?.val ?? v ?? '?',
          next: v?.next ?? null
        });
      }
    });
    return nodes;
  }

  function parseArrays(mem: Record<string, any>): MemArray[] {
    const arrMap: Record<string, MemArray> = {};
    Object.entries(mem).forEach(([k, v]) => {
      // Match pattern: varname[N]
      const m = k.match(/^(\w+)\[(\d+)\]$/);
      if (m) {
        const [, name, idxStr] = m;
        const idx = parseInt(idxStr);
        if (!arrMap[name]) arrMap[name] = { name, cells: [] };
        arrMap[name].cells.push({ idx, val: v, active: idx === (registers['pc'] ?? -1) });
      }
    });
    // Sort cells by index
    return Object.values(arrMap).map(a => ({
      ...a,
      cells: a.cells.sort((x, y) => x.idx - y.idx)
    }));
  }

  function detectMode(step: TraceStep | null): DSMode {
    if (!step) return 'array';
    const keys = Object.keys(step.memory ?? {});
    if (keys.some(k => k.startsWith('node_') || k.includes('->next'))) return 'linkedlist';
    if (keys.some(k => /\w+\[\d+\]/.test(k))) return 'array';
    if ((step.stackFrames?.length ?? 0) > 0) return 'stack';
    return 'array';
  }

  // ── Stack walk helpers ───────────────────────────────
  $: stackList = stackFrames.slice().reverse(); // top of stack = last frame

  // ── Register color ───────────────────────────────────
  function regColor(key: string): string {
    const map: Record<string, string> = {
      pc: 'text-emerald-400', sp: 'text-sky-400',
      fp: 'text-violet-400', ax: 'text-amber-400',
    };
    return map[key.toLowerCase()] ?? 'text-slate-300';
  }

  // ── Animation helpers ────────────────────────────────
  let prevStepIndex = -1;
  $: if ($currentStepIndex !== prevStepIndex) {
    highlightAddr = null;
    prevStepIndex = $currentStepIndex;
  }
</script>

<!-- ═══════════════════════════════════════════════════════════
     ROOT
════════════════════════════════════════════════════════════ -->
<div class="flex flex-col h-full bg-[#0a0e1a] text-slate-200 font-mono text-sm select-none">

  <!-- ── Toolbar ── -->
  <div class="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-[#0f1629] shrink-0">
    <span class="text-[10px] tracking-widest uppercase text-slate-500 mr-2">View</span>

    {#each (['auto','linkedlist','array','stack','tree'] as const) as m}
      <button
        class="px-2.5 py-1 rounded text-[11px] border transition-all duration-150
               {mode === m
                 ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-400'
                 : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'}"
        on:click={() => mode = m}
      >
        {m === 'auto' ? '⟳ auto' : m === 'linkedlist' ? '→ list' : m === 'array' ? '[ ] arr'
          : m === 'stack' ? '▲ stack' : '⌥ tree'}
      </button>
    {/each}

    <!-- step badge -->
    <div class="ml-auto flex items-center gap-3">
      {#if traceStep}
        <span class="text-[10px] text-slate-500">
          line <span class="text-sky-400">{traceStep.lineNo}</span>
          &nbsp;·&nbsp;
          step <span class="text-emerald-400">{traceStep.stepNumber}</span>
          / <span class="text-slate-400">{$traceSteps.length}</span>
        </span>
      {/if}
      <div class="w-1.5 h-1.5 rounded-full {$isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}"></div>
    </div>
  </div>

  <!-- ── Canvas + Registers ── -->
  <div class="flex flex-1 overflow-hidden">

    <!-- Canvas area -->
    <div class="flex-1 relative overflow-auto p-6" bind:this={canvasEl}>

      <!-- Dot grid background -->
      <div class="pointer-events-none absolute inset-0"
           style="background-image: radial-gradient(circle, #1e2a40 1px, transparent 1px); background-size: 28px 28px; opacity:0.5;"></div>

      <!-- Empty state -->
      {#if !traceStep}
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-600">
          <div class="text-4xl opacity-30">◈</div>
          <div class="text-xs tracking-widest uppercase">awaiting trace</div>
          <div class="text-[10px] text-slate-700">compile → run → trace to visualize</div>
        </div>

      <!-- ── LINKED LIST ── -->
      {:else if activeMode === 'linkedlist'}
        <div class="relative flex flex-col gap-12">
          <!-- head pointer label -->
          {#if memNodes.length > 0}
            <div class="text-[10px] tracking-widest uppercase text-slate-500 mb-1">
              struct Node* head → <span class="text-emerald-400">{memNodes[0]?.addr}</span>
            </div>
          {/if}

          <div class="flex items-center gap-0 flex-wrap">
            {#each memNodes as node, i}
              <!-- Node box -->
              <div
                class="relative flex flex-col items-center cursor-pointer group"
                on:click={() => highlightAddr = highlightAddr === node.addr ? null : node.addr}
              >
                <!-- HEAD / TAIL label -->
                {#if i === 0}
                  <div class="text-[9px] tracking-widest uppercase text-emerald-400 mb-1 opacity-80">head</div>
                {:else if i === memNodes.length - 1}
                  <div class="text-[9px] tracking-widest uppercase text-amber-400 mb-1 opacity-80">tail</div>
                {:else}
                  <div class="mb-1 h-3"></div>
                {/if}

                <!-- Cell -->
                <div class="flex border rounded overflow-hidden transition-all duration-200
                            {highlightAddr === node.addr
                              ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                              : 'border-slate-700 group-hover:border-slate-500'}">
                  <!-- data field -->
                  <div class="w-14 h-14 flex flex-col items-center justify-center bg-[#0f1629]
                              border-r border-slate-700 gap-0.5">
                    <span class="text-xs text-slate-500">data</span>
                    <span class="text-lg font-bold text-slate-100">{node.val}</span>
                  </div>
                  <!-- next field -->
                  <div class="w-14 h-14 flex flex-col items-center justify-center bg-[#131a2e] gap-0.5">
                    <span class="text-xs text-slate-500">next</span>
                    <span class="text-[9px] text-slate-400 truncate w-12 text-center">
                      {node.next ?? 'NULL'}
                    </span>
                  </div>
                </div>

                <!-- addr tooltip -->
                <div class="text-[9px] text-slate-600 mt-1 font-mono">{node.addr}</div>
              </div>

              <!-- Arrow / NULL -->
              {#if i < memNodes.length - 1}
                <div class="flex items-center mx-1 mt-4">
                  <div class="w-4 h-px bg-sky-600"></div>
                  <div class="text-sky-400 text-base leading-none">›</div>
                </div>
              {:else}
                <div class="flex items-center gap-1 mx-2 mt-4">
                  <div class="w-4 h-px bg-slate-700"></div>
                  <div class="px-2 py-0.5 border border-red-900/50 rounded text-[10px]
                               text-red-400 bg-red-950/20 tracking-wider">NULL</div>
                </div>
              {/if}
            {/each}

            {#if memNodes.length === 0}
              <div class="text-slate-600 text-xs tracking-widest">// empty list — head → NULL</div>
            {/if}
          </div>

          <!-- Memory detail panel (on node click) -->
          {#if highlightAddr}
            {@const n = memNodes.find(x => x.addr === highlightAddr)}
            {#if n}
              <div class="mt-4 p-3 border border-emerald-800/50 rounded bg-emerald-950/20
                           text-xs max-w-xs">
                <div class="text-emerald-400 text-[10px] tracking-widest uppercase mb-2">node detail</div>
                <div class="grid grid-cols-2 gap-y-1 text-slate-400">
                  <span class="text-slate-500">addr</span><span class="text-emerald-300">{n.addr}</span>
                  <span class="text-slate-500">data</span><span class="text-slate-200">{n.val}</span>
                  <span class="text-slate-500">next</span><span class="text-sky-400">{n.next ?? 'NULL'}</span>
                </div>
              </div>
            {/if}
          {/if}
        </div>

      <!-- ── ARRAY ── -->
      {:else if activeMode === 'array'}
        <div class="flex flex-col gap-8">
          {#each memArrays as arr}
            <div>
              <div class="text-[10px] tracking-widest uppercase text-slate-500 mb-2">
                {arr.name}[{arr.cells.length}]
              </div>
              <div class="flex items-stretch">
                <div class="text-slate-600 text-2xl flex items-center mr-1">[</div>
                {#each arr.cells as cell, ci}
                  <div class="flex flex-col items-center relative">
                    <div class="w-12 h-12 flex items-center justify-center border-y
                                {ci === 0 ? 'border-l rounded-l' : ''}
                                {ci === arr.cells.length - 1 ? 'border-r rounded-r' : ''}
                                border-slate-700 transition-all duration-200
                                {cell.active
                                  ? 'bg-emerald-900/30 border-emerald-700'
                                  : 'bg-[#0f1629] hover:bg-slate-800/50'}">
                      <span class="font-bold text-base {cell.active ? 'text-emerald-300' : 'text-slate-200'}">
                        {cell.val}
                      </span>
                    </div>
                    <div class="text-[9px] text-slate-600 mt-1">{cell.idx}</div>
                    {#if cell.active}
                      <div class="absolute -bottom-5 text-emerald-400 text-[10px]">▲</div>
                    {/if}
                  </div>
                {/each}
                <div class="text-slate-600 text-2xl flex items-center ml-1">]</div>
              </div>
            </div>
          {/each}

          {#if memArrays.length === 0}
            <div class="text-slate-600 text-xs tracking-widest">// no array data in current step</div>
          {/if}
        </div>

      <!-- ── STACK ── -->
      {:else if activeMode === 'stack'}
        <div class="flex flex-col items-center gap-0 max-w-xs mx-auto">
          {#if stackList.length === 0}
            <div class="text-slate-600 text-xs tracking-widest">// call stack is empty</div>
          {:else}
            <!-- Top of stack label -->
            <div class="text-[9px] text-emerald-400 tracking-widest uppercase mb-1">← TOP</div>

            {#each stackList as frame, fi}
              <div class="w-full border transition-all duration-200
                          {fi === 0
                            ? 'border-emerald-700/60 bg-emerald-950/20 rounded-t'
                            : fi === stackList.length - 1
                              ? 'border-slate-700 bg-[#0f1629] rounded-b'
                              : 'border-slate-700 bg-[#0f1629]'}
                          border-b-0 last:border-b">
                <div class="px-4 py-2 flex items-center justify-between border-b border-inherit">
                  <span class="text-xs font-bold {fi === 0 ? 'text-emerald-300' : 'text-slate-300'}">
                    {frame.name}()
                  </span>
                  {#if fi === 0}
                    <span class="text-[9px] text-emerald-500 tracking-wider">active</span>
                  {/if}
                </div>
                <!-- Locals -->
                {#if Object.keys(frame.locals ?? {}).length > 0}
                  <div class="px-4 py-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {#each Object.entries(frame.locals) as [k, v]}
                      <span class="text-[10px] text-slate-500">{k}</span>
                      <span class="text-[10px] text-slate-300 text-right font-mono">{v}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}

            <!-- Stack base -->
            <div class="w-full h-2 bg-slate-800 rounded-b border border-t-0 border-slate-700"></div>
          {/if}
        </div>

      <!-- ── TREE (placeholder) ── -->
      {:else if activeMode === 'tree'}
        <div class="flex flex-col items-center justify-center h-40 text-slate-600 gap-2">
          <div class="text-2xl opacity-30">⌥</div>
          <div class="text-xs tracking-widest uppercase">BST rendering coming soon</div>
          <div class="text-[10px]">switch to linked list or array for now</div>
        </div>
      {/if}

    </div>

    <!-- ── Registers sidebar ── -->
    <div class="w-40 border-l border-slate-800 bg-[#0f1629] flex flex-col shrink-0">
      <div class="px-3 py-2 border-b border-slate-800">
        <span class="text-[9px] tracking-widest uppercase text-slate-600">Registers</span>
      </div>
      <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {#each Object.entries(registers) as [reg, val]}
          <div class="flex flex-col gap-0.5">
            <span class="text-[9px] tracking-widest text-slate-600 uppercase">{reg}</span>
            <span class="text-xs font-mono {regColor(reg)}">{val}</span>
          </div>
        {/each}
        {#if Object.keys(registers).length === 0}
          <div class="text-[10px] text-slate-700 tracking-wider">—</div>
        {/if}
      </div>

      <!-- Memory summary -->
      <div class="border-t border-slate-800 px-3 py-2">
        <div class="text-[9px] tracking-widest uppercase text-slate-600 mb-2">Memory</div>
        <div class="grid grid-cols-4 gap-0.5">
          {#each Object.entries(traceStep?.memory ?? {}).slice(0, 16) as [k, _], i}
            <div class="h-4 w-full rounded-sm transition-all duration-200
                        {k === highlightAddr ? 'bg-emerald-500' : 'bg-slate-800 hover:bg-slate-700'}"
                 title={k}></div>
          {/each}
          {#if Object.keys(traceStep?.memory ?? {}).length === 0}
            {#each Array(16) as _}
              <div class="h-4 w-full rounded-sm bg-slate-900 opacity-50"></div>
            {/each}
          {/if}
        </div>
        <div class="text-[9px] text-slate-700 mt-1">
          {Object.keys(traceStep?.memory ?? {}).length} addrs
        </div>
      </div>
    </div>

  </div>

  <!-- ── Bottom status bar ── -->
  <div class="flex items-center gap-4 px-4 py-1.5 border-t border-slate-800 bg-[#0f1629]
               text-[10px] text-slate-600 shrink-0">
    <span>ip: <span class="text-slate-400">{traceStep?.instructionPointer ?? '—'}</span></span>
    <span>frames: <span class="text-slate-400">{stackFrames.length}</span></span>
    <span>mode: <span class="text-slate-400">{activeMode}</span></span>
    <span class="ml-auto">
      {#if traceStep}
        {new Date(traceStep.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}
      {:else}
        —
      {/if}
    </span>
  </div>
</div>