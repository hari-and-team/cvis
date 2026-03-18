<script lang="ts">
  import { TH } from '$lib/theme';
  import type { TraceStep } from '$lib/types';

  export let traceStep: TraceStep | null = null;

  interface VarCellProps {
    name: string;
    val: any;
    changed: boolean;
    addr?: number;
  }

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
      if (isPointer(val)) return `->0x${val.toString(16)}`;
      if (val === 0 && isPointer(val)) return "NULL";
      return Number.isInteger(val) ? String(val) : val.toFixed(3);
    }
    if (typeof val === "string") return `"${val.slice(0, 10)}${val.length > 10 ? "..." : ""}"`;
    return "?";
  }

  $: memoryEntries = traceStep ? Object.entries(traceStep.memory) : [];
  $: registers = traceStep ? traceStep.registers : {};
</script>

<div style="height: 100%; overflow-y: auto; padding: 14px;">
  {#if !traceStep}
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; text-align: center; height: 100%;">
      <div style="color: {TH.white}; font-weight: 700; font-size: 14px;">No Trace Data</div>
      <div style="font-size: 11px; color: {TH.midText}; max-width: 280px; line-height: 1.7;">
        Click <span style="color: {TH.accent}; font-weight: 700;">Trace Execution</span> to visualize program execution.
      </div>
    </div>
  {:else}
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <!-- Registers Section -->
      <div style="background: {TH.bgRaised}; border: 1px solid {TH.border}; border-radius: 8px; padding: 12px;">
        <div style="color: {TH.dimText}; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">
          Registers
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px;">
          {#each Object.entries(registers) as [reg, value]}
            <div style="background: {TH.bgCard}; border: 1px solid {TH.border}; border-radius: 6px; padding: 8px;">
              <div style="color: {TH.midText}; font-size: 10px; font-family: monospace; margin-bottom: 4px;">
                {reg}
              </div>
              <div style="color: {TH.white}; font-size: 14px; font-weight: 800; font-family: monospace;">
                {value}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Memory Section -->
      <div style="background: {TH.bgRaised}; border: 1px solid {TH.border}; border-radius: 8px; padding: 12px;">
        <div style="color: {TH.dimText}; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">
          Variables & Memory
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px;">
          {#each memoryEntries as [varName, value]}
            {@const isArr = isArray(value)}
            {@const isStr = isStruct(value)}
            {@const isPtr = isPointer(value)}
            {@const disp = displayValue(value)}
            
            <div style="background: {TH.bgCard}; border: 1px solid {TH.border}; border-radius: 8px; padding: {isArr || isStr ? '8px' : '9px 11px'}; transition: all 0.25s; grid-column: {isArr || isStr ? '1 / -1' : 'auto'};">
              <div style="display: flex; align-items: center; gap: 5px; margin-bottom: {isArr || isStr ? 6 : 3}px;">
                <span style="color: {isPtr ? TH.purple : isArr ? TH.orange : isStr ? TH.cyan : TH.midText}; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; font-family: monospace;">
                  {varName}
                </span>
                {#if isPtr}
                  <span style="font-size: 9px; color: {TH.purple}; background: {TH.purple}20; padding: 1px 4px; border-radius: 3px;">PTR</span>
                {/if}
                {#if isArr}
                  <span style="font-size: 9px; color: {TH.orange}; background: {TH.orange}20; padding: 1px 4px; border-radius: 3px;">ARR</span>
                {/if}
                {#if isStr}
                  <span style="font-size: 9px; color: {TH.cyan}; background: {TH.cyan}20; padding: 1px 4px; border-radius: 3px;">STRUCT</span>
                {/if}
              </div>
              
              {#if isArr}
                <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                  {#each value as v, i}
                    <div style="background: {TH.bgDeep}; border: 1px solid {TH.border}; border-radius: 4px; padding: 2px 5px; font-size: 11px; font-family: monospace; color: {TH.bright}; text-align: center; min-width: 26px;">
                      <div style="color: {TH.dimText}; font-size: 9px;">[{i}]</div>
                      <div>{v > 31 && v < 127 ? `'${String.fromCharCode(v)}'` : v}</div>
                    </div>
                  {/each}
                </div>
              {:else if isStr}
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  {#each Object.entries(value).filter(([k]) => !k.startsWith('__')) as [k, v]}
                    <div style="background: {TH.bgDeep}; border: 1px solid {TH.border}; border-radius: 4px; padding: 3px 7px; font-size: 11px; font-family: monospace; color: {TH.bright};">
                      <span style="color: {TH.dimText};">{k}: </span>
                      <span style="color: {typeof v === 'number' && v >= 256 ? TH.purple : TH.bright};">
                        {typeof v === 'number' && v >= 256 ? `->0x${v.toString(16)}` : String(v)}
                      </span>
                    </div>
                  {/each}
                </div>
              {:else}
                <div style="color: {isPtr ? TH.purple : TH.bright}; font-size: {isPtr ? 13 : 19}px; font-weight: 800; font-family: monospace;">
                  {disp}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Step Info -->
      <div style="background: {TH.bgCard}; border: 1px solid {TH.border}; border-radius: 8px; padding: 10px;">
        <div style="color: {TH.dimText}; font-size: 10px; font-family: monospace;">
          Step {traceStep.stepNumber} | Line {traceStep.lineNo} | IP: {traceStep.instructionPointer}
        </div>
      </div>
    </div>
  {/if}
</div>
