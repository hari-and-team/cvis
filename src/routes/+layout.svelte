<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import EditorPane from '$lib/components/EditorPane.svelte';
  import HeaderBar from '$lib/components/HeaderBar.svelte';
  import RightPane from '$lib/components/RightPane.svelte';
  import { runCompileAndRunAction, runTraceAction } from '$lib/layout/run-actions';
  import {
    editorCode,
    hasScannedInput,
    runtimeInput,
    scannedInput,
    traceSteps,
    currentStepIndex
  } from '$lib/stores';

  let isTracing = false;
  let traceErr: string | null = null;

  async function handleCompileAndRun() {
    if (!browser) return;

    await runCompileAndRunAction({
      code: $editorCode,
      runtimeInput: $runtimeInput,
      scannedInput: $scannedInput,
      hasScannedInput: $hasScannedInput
    });
  }

  async function handleTrace() {
    if (!browser) return;

    isTracing = true;
    traceErr = null;

    try {
      const result = await runTraceAction({ code: $editorCode });
      traceErr = result.traceErr;
    } finally {
      isTracing = false;
    }
  }
</script>

<div class="app">
  <HeaderBar code={$editorCode} on:run={handleCompileAndRun} />
  <div class="main">
    <EditorPane on:trace={handleTrace} />
    <RightPane
      traceSteps={$traceSteps}
      currentStep={$currentStepIndex}
      {isTracing}
      {traceErr}
    />
  </div>
  <slot />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
</style>
