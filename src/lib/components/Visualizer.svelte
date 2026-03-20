<script lang="ts">
  import type { TraceStep } from '$lib/types';

  export let traceStep: TraceStep | null = null;
  export let sourceLines: string[] = [];

  let prevMemory: Record<string, any> = {};
  let prevRegisters: Record<string, any> = {};
  let changedVars: Set<string> = new Set();
  let changedRegs: Set<string> = new Set();

  function isArray(val: any): boolean {
    return Array.isArray(val);
  }

  function isStruct(val: any): boolean {
    return val && typeof val === "object" && val.__type === "struct";
  }

  function isPointer(val: any): boolean {
    return !isArray(val) && !isStruct(val) && typeof val === "number" && val >= 256 && val < 0x10000;
  }

  function displayValue(val: any): string {
    if (isArray(val)) return `[${val.length}]`;
    if (isStruct(val)) return "struct";
    if (typeof val === "number") {
      if (isPointer(val)) return `0x${val.toString(16)}`;
      if (val === 0 && isPointer(val)) return "NULL";
      return Number.isInteger(val) ? String(val) : val.toFixed(3);
    }
    if (typeof val === "string") return `"${val.slice(0, 10)}${val.length > 10 ? "..." : ""}"`;
    return "?";
  }

  function detectChanges(current: Record<string, any>, prev: Record<string, any>): Set<string> {
    const changed = new Set<string>();
    for (const key of Object.keys(current)) {
      if (JSON.stringify(current[key]) !== JSON.stringify(prev[key])) {
        changed.add(key);
      }
    }
    return changed;
  }

  $: memoryEntries = traceStep ? Object.entries(traceStep.memory) : [];
  $: registers = traceStep ? traceStep.registers : {};
  $: currentLine = traceStep && sourceLines[traceStep.lineNo - 1]?.trim() || '';
  
  $: if (traceStep) {
    changedVars = detectChanges(traceStep.memory, prevMemory);
    changedRegs = detectChanges(traceStep.registers, prevRegisters);
    prevMemory = { ...traceStep.memory };
    prevRegisters = { ...traceStep.registers };
  }
</script>

<div class="visualizer-container">
  {#if !traceStep}
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0-6v6" />
        </svg>
      </div>
      <div class="empty-title">No Trace Data</div>
      <div class="empty-description">
        Click <span class="accent-text">Trace Execution</span> to visualize program state
      </div>
    </div>
  {:else}
    <div class="content-wrapper">
      <!-- Registers Section -->
      <section class="section registers-section">
        <header class="section-header">
          <span class="section-icon">⚙</span>
          <span class="section-title">Registers</span>
          <span class="section-count">{Object.keys(registers).length}</span>
        </header>
        <div class="registers-grid">
          {#each Object.entries(registers) as [reg, value]}
            {@const isChanged = changedRegs.has(reg)}
            <div class="register-card" class:changed={isChanged}>
              <div class="register-name">{reg}</div>
              <div class="register-value" class:highlight={isChanged}>{value}</div>
            </div>
          {/each}
        </div>
      </section>

      <!-- Memory Section -->
      <section class="section memory-section">
        <header class="section-header">
          <span class="section-icon">◈</span>
          <span class="section-title">Variables & Memory</span>
          <span class="section-count">{memoryEntries.length}</span>
        </header>
        <div class="memory-grid">
          {#each memoryEntries as [varName, value]}
            {@const isArr = isArray(value)}
            {@const isStr = isStruct(value)}
            {@const isPtr = isPointer(value)}
            {@const disp = displayValue(value)}
            {@const isChanged = changedVars.has(varName)}
            
            <div 
              class="memory-card"
              class:array-card={isArr}
              class:struct-card={isStr}
              class:pointer-card={isPtr}
              class:scalar-card={!isArr && !isStr && !isPtr}
              class:changed={isChanged}
            >
              <div class="var-header">
                <span class="var-name" class:pointer={isPtr} class:array={isArr} class:struct={isStr}>
                  {varName}
                </span>
                {#if isPtr}
                  <span class="type-badge pointer-badge">PTR</span>
                {:else if isArr}
                  <span class="type-badge array-badge">ARR[{value.length}]</span>
                {:else if isStr}
                  <span class="type-badge struct-badge">STRUCT</span>
                {/if}
              </div>
              
              {#if isArr}
                <div class="array-container">
                  {#each value as v, i}
                    <div class="array-cell">
                      <span class="array-index">{i}</span>
                      <span class="array-value">{v > 31 && v < 127 ? `'${String.fromCharCode(v)}'` : v}</span>
                    </div>
                  {/each}
                </div>
              {:else if isStr}
                <div class="struct-container">
                  {#each Object.entries(value).filter(([k]) => !k.startsWith('__')) as [k, v]}
                    <div class="struct-field">
                      <span class="field-name">{k}</span>
                      <span class="field-value" class:is-pointer={typeof v === 'number' && v >= 256}>
                        {typeof v === 'number' && v >= 256 ? `→ 0x${v.toString(16)}` : String(v)}
                      </span>
                    </div>
                  {/each}
                </div>
              {:else if isPtr}
                <div class="pointer-value">
                  <span class="pointer-arrow">→</span>
                  <span class="pointer-addr">{disp}</span>
                </div>
              {:else}
                <div class="scalar-value" class:highlight={isChanged}>
                  {disp}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <!-- Step Info Footer -->
      <footer class="step-footer">
        <div class="step-info-row">
          <div class="step-badge">
            <span class="step-label">Step</span>
            <span class="step-value">{traceStep.stepNumber}</span>
          </div>
          <div class="step-badge">
            <span class="step-label">Line</span>
            <span class="step-value">{traceStep.lineNo}</span>
          </div>
          <div class="step-badge">
            <span class="step-label">IP</span>
            <span class="step-value mono">{traceStep.instructionPointer}</span>
          </div>
        </div>
        {#if currentLine}
          <div class="line-preview">
            <code>{currentLine}</code>
          </div>
        {/if}
      </footer>
    </div>
  {/if}
</div>

<style>
  /* One Dark Color Palette */
  :root {
    --od-bg-main: #282c34;
    --od-bg-deep: #21252b;
    --od-bg-card: #2c313a;
    --od-border: #3e4451;
    --od-text: #abb2bf;
    --od-text-dim: #5c6370;
    --od-text-bright: #e5e5e5;
    --od-green: #98c379;
    --od-blue: #61afef;
    --od-purple: #c678dd;
    --od-cyan: #56b6c2;
    --od-yellow: #e5c07b;
    --od-orange: #d19a66;
    --od-red: #e06c75;
  }

  .visualizer-container {
    height: 100%;
    overflow-y: auto;
    padding: 16px;
    background: var(--od-bg-main);
  }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    text-align: center;
    height: 100%;
  }

  .empty-icon {
    color: var(--od-text-dim);
    opacity: 0.5;
  }

  .empty-title {
    color: var(--od-text-bright);
    font-weight: 600;
    font-size: 15px;
  }

  .empty-description {
    font-size: 12px;
    color: var(--od-text-dim);
    max-width: 260px;
    line-height: 1.6;
  }

  .accent-text {
    color: var(--od-blue);
    font-weight: 600;
  }

  /* Content Wrapper */
  .content-wrapper {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Sections */
  .section {
    background: linear-gradient(180deg, var(--od-bg-card) 0%, var(--od-bg-deep) 100%);
    border: 1px solid var(--od-border);
    border-radius: 10px;
    padding: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--od-border);
  }

  .section-icon {
    font-size: 12px;
    color: var(--od-blue);
  }

  .section-title {
    color: var(--od-text);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .section-count {
    margin-left: auto;
    background: var(--od-bg-deep);
    color: var(--od-text-dim);
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
  }

  /* Registers */
  .registers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
  }

  .register-card {
    background: var(--od-bg-deep);
    border: 1px solid var(--od-border);
    border-radius: 8px;
    padding: 10px;
    transition: all 0.2s ease;
  }

  .register-card:hover {
    border-color: var(--od-blue);
    box-shadow: 0 0 0 1px var(--od-blue), 0 4px 12px rgba(97, 175, 239, 0.1);
  }

  .register-card.changed {
    animation: pulse-green 0.5s ease;
    border-color: var(--od-green);
  }

  .register-name {
    color: var(--od-text-dim);
    font-size: 10px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .register-value {
    color: var(--od-text-bright);
    font-size: 16px;
    font-weight: 700;
    font-family: 'SF Mono', 'Fira Code', monospace;
    transition: color 0.2s;
  }

  .register-value.highlight {
    color: var(--od-green);
  }

  /* Memory Grid */
  .memory-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 10px;
  }

  /* Memory Cards */
  .memory-card {
    background: var(--od-bg-deep);
    border: 1px solid var(--od-border);
    border-radius: 8px;
    padding: 10px 12px;
    transition: all 0.2s ease;
  }

  .memory-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }

  .memory-card.changed {
    animation: pulse-green 0.5s ease;
  }

  .memory-card.array-card,
  .memory-card.struct-card {
    grid-column: 1 / -1;
  }

  .memory-card.pointer-card {
    border-left: 3px solid var(--od-purple);
  }

  .memory-card.pointer-card:hover {
    border-color: var(--od-purple);
    box-shadow: 0 0 0 1px var(--od-purple), 0 4px 12px rgba(198, 120, 221, 0.15);
  }

  .memory-card.array-card {
    border-left: 3px solid var(--od-orange);
  }

  .memory-card.struct-card {
    border-left: 3px solid var(--od-cyan);
  }

  .memory-card.scalar-card:hover {
    border-color: var(--od-blue);
  }

  /* Variable Header */
  .var-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .var-name {
    color: var(--od-text);
    font-size: 11px;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
    letter-spacing: 0.3px;
  }

  .var-name.pointer { color: var(--od-purple); }
  .var-name.array { color: var(--od-orange); }
  .var-name.struct { color: var(--od-cyan); }

  .type-badge {
    font-size: 9px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.5px;
  }

  .pointer-badge {
    color: var(--od-purple);
    background: rgba(198, 120, 221, 0.15);
  }

  .array-badge {
    color: var(--od-orange);
    background: rgba(209, 154, 102, 0.15);
  }

  .struct-badge {
    color: var(--od-cyan);
    background: rgba(86, 182, 194, 0.15);
  }

  /* Scalar Value */
  .scalar-value {
    color: var(--od-text-bright);
    font-size: 20px;
    font-weight: 700;
    font-family: 'SF Mono', 'Fira Code', monospace;
    transition: color 0.2s;
  }

  .scalar-value.highlight {
    color: var(--od-green);
  }

  /* Pointer Value */
  .pointer-value {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pointer-arrow {
    color: var(--od-purple);
    font-size: 16px;
    font-weight: 700;
  }

  .pointer-addr {
    color: var(--od-purple);
    font-size: 14px;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  /* Array Container */
  .array-container {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .array-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--od-bg-main);
    border: 1px solid var(--od-border);
    border-radius: 4px;
    padding: 4px 6px;
    min-width: 32px;
    transition: all 0.15s ease;
  }

  .array-cell:hover {
    border-color: var(--od-orange);
    background: rgba(209, 154, 102, 0.08);
  }

  .array-index {
    color: var(--od-text-dim);
    font-size: 9px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .array-value {
    color: var(--od-yellow);
    font-size: 12px;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  /* Struct Container */
  .struct-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .struct-field {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--od-bg-main);
    border: 1px solid var(--od-border);
    border-radius: 4px;
    padding: 5px 8px;
    transition: all 0.15s ease;
  }

  .struct-field:hover {
    border-color: var(--od-cyan);
  }

  .field-name {
    color: var(--od-text-dim);
    font-size: 10px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .field-name::after {
    content: ':';
    margin-left: 2px;
  }

  .field-value {
    color: var(--od-text-bright);
    font-size: 11px;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .field-value.is-pointer {
    color: var(--od-purple);
  }

  /* Step Footer */
  .step-footer {
    background: linear-gradient(180deg, var(--od-bg-card) 0%, var(--od-bg-deep) 100%);
    border: 1px solid var(--od-border);
    border-radius: 10px;
    padding: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .step-info-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .step-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--od-bg-deep);
    border: 1px solid var(--od-border);
    border-radius: 6px;
    padding: 6px 10px;
  }

  .step-label {
    color: var(--od-text-dim);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .step-value {
    color: var(--od-text-bright);
    font-size: 12px;
    font-weight: 700;
  }

  .step-value.mono {
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .line-preview {
    margin-top: 10px;
    padding: 8px 10px;
    background: var(--od-bg-deep);
    border: 1px solid var(--od-border);
    border-left: 3px solid var(--od-blue);
    border-radius: 6px;
    overflow-x: auto;
  }

  .line-preview code {
    color: var(--od-text);
    font-size: 11px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    white-space: pre;
  }

  /* Animations */
  @keyframes pulse-green {
    0% {
      box-shadow: 0 0 0 0 rgba(152, 195, 121, 0.4);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(152, 195, 121, 0.2);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(152, 195, 121, 0);
    }
  }

  /* Scrollbar Styling */
  .visualizer-container::-webkit-scrollbar {
    width: 8px;
  }

  .visualizer-container::-webkit-scrollbar-track {
    background: var(--od-bg-deep);
  }

  .visualizer-container::-webkit-scrollbar-thumb {
    background: var(--od-border);
    border-radius: 4px;
  }

  .visualizer-container::-webkit-scrollbar-thumb:hover {
    background: var(--od-text-dim);
  }
</style>
