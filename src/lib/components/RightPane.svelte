<script lang="ts">
  import { AlertTriangle, Cpu, Loader2 } from 'lucide-svelte';
  import Visualizer from './Visualizer.svelte';
  import type { TraceStep } from '$lib/types';
  import { TH } from '$lib/theme';
  import {
    hasScannedInput,
    lastCompileResult,
    lastExecutionResult,
    runtimeInput,
    scannedInput
  } from '$lib/stores';
  import { RIGHT_PANE_TABS, type RightPaneTabId, VISUALIZER_FEATURES } from './right-pane-config';

  export let traceSteps: TraceStep[] = [];
  export let currentStep: number = 0;
  export let isTracing = false;
  export let traceErr: string | null = null;

  let activeTab: RightPaneTabId = 'output';

  $: output = $lastExecutionResult
    ? $lastExecutionResult.stdout + $lastExecutionResult.stderr
    : $lastCompileResult
      ? $lastCompileResult.output || $lastCompileResult.errors.join('\n')
      : '';

  $: currentTraceStepData = traceSteps[currentStep] || null;

  function handleScanInput() {
    scannedInput.set($runtimeInput);
    hasScannedInput.set(true);
  }
</script>

<div style="width: 50%; display: flex; flex-direction: column;">
  <div style="display: flex; background: {TH.bgCard}; border-bottom: 1px solid {TH.border}; flex-shrink: 0;">
    {#each RIGHT_PANE_TABS as tab}
      <button
        on:click={() => (activeTab = tab.id)}
        style="flex: 1; padding: 9px 4px; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 5px; color: {activeTab === tab.id ? TH.white : TH.dimText}; background: {activeTab === tab.id ? `${tab.color}10` : 'transparent'}; border: none; border-bottom: 2px solid {activeTab === tab.id ? tab.color : 'transparent'}; cursor: pointer; transition: all 0.2s;"
      >
        <svelte:component this={tab.Icon} size={12} />
        {tab.label}
      </button>
    {/each}
  </div>

  <div style="flex: 1; overflow: hidden; position: relative;">
    {#if activeTab === 'output'}
      <div style="height: 100%; overflow-y: auto; padding: 14px;">
        <pre style="font-family: monospace; font-size: 12px; color: {TH.bright}; white-space: pre-wrap; margin: 0; line-height: 1.7;">
{output || 'No output yet. Click "Compile & Run" to execute your code.'}
        </pre>
      </div>
    {/if}

    {#if activeTab === 'input'}
      <div style="height: 100%; display: flex; flex-direction: column;">
        <div style="padding: 10px 14px; border-bottom: 1px solid {TH.border}; display: flex; align-items: center; gap: 10px;">
          <button
            on:click={handleScanInput}
            style="padding: 6px 12px; background: {TH.accent}; border: none; border-radius: 6px; color: {TH.white}; font-size: 11px; font-weight: 700; cursor: pointer;"
          >
            Scan
          </button>
          <span style="color: {$hasScannedInput ? TH.green : TH.dimText}; font-size: 10px; font-family: monospace;">
            {$hasScannedInput ? 'Input captured' : 'Not scanned'}
          </span>
        </div>
        <textarea
          bind:value={$runtimeInput}
          on:input={() => hasScannedInput.set(false)}
          placeholder="stdin for scanf()…"
          spellcheck={false}
          style="flex: 1; width: 100%; padding: 14px; background: transparent; color: {TH.bright}; font-family: monospace; font-size: 12px; resize: none; outline: none; border: none; box-sizing: border-box;"
        ></textarea>
      </div>
    {/if}

    {#if activeTab === 'visualizer'}
      {#if isTracing}
        <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;">
          <Loader2 size={32} color={TH.accent} class="animate-spin" />
          <span style="color: {TH.midText}; font-size: 12px; font-weight: 600;">Interpreting C code…</span>
        </div>
      {:else if traceErr}
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div style="background: {TH.red}0e; border: 1px solid {TH.red}35; border-radius: 10px; padding: 18px; max-width: 380px; text-align: center;">
            <AlertTriangle size={26} color={TH.red} style="margin-bottom: 8px;" />
            <div style="color: {TH.white}; font-weight: 700; margin-bottom: 6px; font-size: 13px;">Interpreter Error</div>
            <div style="color: {TH.midText}; font-size: 11px; font-family: monospace; line-height: 1.7; text-align: left;">
              {traceErr}
            </div>
            <div style="color: {TH.dimText}; font-size: 10px; margin-top: 10px;">
              Use "Compile & Run" for exact output from complex programs.
            </div>
          </div>
        </div>
      {:else if traceSteps && traceSteps.length > 0}
        <Visualizer traceStep={currentTraceStepData} />
      {:else}
        <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; text-align: center;">
          <Cpu size={44} color={`${TH.accent}50`} />
          <div style="color: {TH.white}; font-weight: 700; font-size: 14px;">Ready to Visualize</div>
          <div style="font-size: 11px; color: {TH.midText}; max-width: 280px; line-height: 1.7;">
            Click <span style="color: {TH.accent}; font-weight: 700;">Trace Execution</span> for a local, instant, step-by-step visualization.
          </div>
          <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; margin-top: 4px;">
            {#each VISUALIZER_FEATURES as feature}
              <span style="background: {TH.accent}12; color: {TH.purple}; font-size: 10px; padding: 2px 8px; border-radius: 10px; border: 1px solid {TH.accent}28;">
                {feature}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    {#if activeTab === 'analysis'}
      <div style="height: 100%; overflow-y: auto; padding: 14px;">
        <div style="color: {TH.midText}; font-size: 12px; font-style: italic;">
          Code analysis features coming soon...
        </div>
      </div>
    {/if}
  </div>
</div>
