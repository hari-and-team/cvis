<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { TraceStep } from '$lib/types';
  import {
    activeMilestoneIndex,
    editorCode,
    errorMessage,
    lastCompileResult,
    lastExecutionResult,
    lastRunInputTranscript,
    milestoneProgress,
    mentorSelectionMode,
    pendingRunInputEcho,
    rightPaneTab,
    runConsoleTranscript,
    runSessionId,
    selectedPracticeProblemId,
    userProfile
  } from '$lib/stores';
  import { analyzeUnifiedProgram } from '$lib/analysis/unified-analysis';
  import type { PracticeRecommendation } from '$lib/analysis/code-type-finder';
  import { createIntentExplainerController } from '$lib/analysis/intent-explainer';
  import {
    buildAnalysisViewModel,
    buildConsoleViewModel,
    buildMentorPanelViewModel,
    buildVisualizerViewModel,
    type IntentExplainerViewModel
  } from '$lib/app-shell/right-pane/view-models';
  import {
    firstIncompleteMilestoneIndex as getFirstIncompleteMilestoneIndex,
    isMilestoneComplete as isMentorMilestoneComplete,
    milestoneKey
  } from '$lib/mentor/view-model';
  import {
    interruptRuntimeSession,
    sendRuntimeEof,
    sendRuntimeInputLine
  } from '$lib/runtime/actions';
  import { RIGHT_PANE_TABS } from './right-pane-config';
  import './right-pane/panels.css';
  import ConsolePanel from './right-pane/ConsolePanel.svelte';
  import VisualizerPanel from './right-pane/VisualizerPanel.svelte';
  import AnalysisPanel from './right-pane/AnalysisPanel.svelte';
  import MentorPanel from './right-pane/MentorPanel.svelte';

  export let traceSteps: TraceStep[] = [];
  export let currentStep = 0;
  export let isTracing = false;
  export let traceErr: string | null = null;
  export let traceNotice: string | null = null;

  const dispatch = createEventDispatcher<{
    trace: void;
  }>();

  let prevMentorProblemId: string | null = null;
  let analysisEditorCode = '';
  let analysisRefreshTimer: number | null = null;
  let recommendedProblems: PracticeRecommendation[] = [];
  const intentExplainer = createIntentExplainerController();
  let intentExplainerState: IntentExplainerViewModel = {
    result: null,
    loading: false,
    error: null,
    sourceLabel: 'Local classifier'
  };

  const unsubscribeIntentExplainer = intentExplainer.subscribe((state) => {
    intentExplainerState = state;
  });

  onDestroy(() => {
    unsubscribeIntentExplainer();
    intentExplainer.destroy();
    if (analysisRefreshTimer !== null) {
      clearTimeout(analysisRefreshTimer);
    }
  });

  $: shouldComputeVisualizerViewModel = $rightPaneTab === 'visualizer';
  $: shouldComputeAnalysisState = $rightPaneTab === 'analysis' || $rightPaneTab === 'mentor';
  $: if (!shouldComputeAnalysisState) {
    if (analysisRefreshTimer !== null) {
      clearTimeout(analysisRefreshTimer);
      analysisRefreshTimer = null;
    }
    analysisEditorCode = $editorCode;
    intentExplainer.destroy();
  } else if (!browser || analysisEditorCode === '' || analysisEditorCode === $editorCode) {
    analysisEditorCode = $editorCode;
  } else {
    const nextCode = $editorCode;
    if (analysisRefreshTimer !== null) {
      clearTimeout(analysisRefreshTimer);
    }
    analysisRefreshTimer = window.setTimeout(() => {
      analysisEditorCode = nextCode;
      analysisRefreshTimer = null;
    }, 180);
  }
  $: if ($rightPaneTab === 'analysis') {
    intentExplainer.refresh(analysisEditorCode);
  }
  $: canSendToStdin = Boolean($runSessionId);
  $: output = $runConsoleTranscript
    ? $runConsoleTranscript
    : $lastExecutionResult
      ? $lastExecutionResult.stdout + $lastExecutionResult.stderr
      : $lastCompileResult
        ? $lastCompileResult.output || $lastCompileResult.errors.join('\n')
        : '';
  $: clampedTraceStepIndex =
    traceSteps.length === 0 ? 0 : Math.min(Math.max(currentStep, 0), traceSteps.length - 1);
  $: currentTraceStepData = traceSteps[clampedTraceStepIndex] || null;
  $: unifiedAnalysis = shouldComputeAnalysisState
    ? analyzeUnifiedProgram(analysisEditorCode, traceSteps)
    : null;
  $: consoleViewModel = buildConsoleViewModel({
    output,
    pendingRunInputEcho: $pendingRunInputEcho,
    lastCompileResult: $lastCompileResult,
    lastExecutionResult: $lastExecutionResult,
    canSendToStdin,
    workspaceError: $errorMessage
  });
  $: visualizerViewModel = shouldComputeVisualizerViewModel
    ? buildVisualizerViewModel({
        editorCode: $editorCode,
        runConsoleTranscript: $runConsoleTranscript,
        lastExecutionResult: $lastExecutionResult,
        lastCompileResult: $lastCompileResult,
        lastRunInputTranscript: $lastRunInputTranscript,
        pendingRunInputEcho: $pendingRunInputEcho,
        traceSteps,
        currentTraceStepData,
        isTracing,
        traceErr,
        traceNotice
      })
    : null;
  $: analysisViewModel =
    $rightPaneTab === 'analysis' && unifiedAnalysis
      ? buildAnalysisViewModel({
          editorCode: analysisEditorCode,
          analysis: unifiedAnalysis,
          intentExplainer: intentExplainerState
        })
      : null;
  $: mentorViewModel =
    $rightPaneTab === 'mentor' && unifiedAnalysis
      ? buildMentorPanelViewModel({
          analysis: unifiedAnalysis,
          userProfile: $userProfile,
          mentorSelectionMode: $mentorSelectionMode,
          selectedPracticeProblemId: $selectedPracticeProblemId,
          activeMilestoneIndex: $activeMilestoneIndex,
          milestoneProgress: $milestoneProgress
        })
      : null;
  $: recommendedProblems = analysisViewModel?.recommendedProblems ?? unifiedAnalysis?.recommendedPractice ?? [];
  $: guidedMentorSelection = mentorViewModel?.personalizedMentorQueue[0] ?? null;

  $: if (recommendedProblems.length === 0 && $selectedPracticeProblemId !== null) {
    selectedPracticeProblemId.set(null);
    activeMilestoneIndex.set(0);
  } else if (
    $mentorSelectionMode === 'manual' &&
    recommendedProblems.length > 0 &&
    !recommendedProblems.some((recommendation) => recommendation.id === $selectedPracticeProblemId)
  ) {
    const fallbackRecommendation = guidedMentorSelection?.recommendation ?? recommendedProblems[0];
    selectedPracticeProblemId.set(fallbackRecommendation.id);
    activeMilestoneIndex.set(
      getFirstIncompleteMilestoneIndex($milestoneProgress, fallbackRecommendation)
    );
  }

  $: if (mentorViewModel?.selectedMentorProblem?.id !== prevMentorProblemId) {
    prevMentorProblemId = mentorViewModel?.selectedMentorProblem?.id ?? null;
    if (mentorViewModel?.selectedMentorProblem) {
      activeMilestoneIndex.set(
        getFirstIncompleteMilestoneIndex($milestoneProgress, mentorViewModel.selectedMentorProblem)
      );
    } else {
      activeMilestoneIndex.set(0);
    }
  }

  function activateMentorPlan(recommendation: (typeof recommendedProblems)[number]) {
    mentorSelectionMode.set('manual');
    selectedPracticeProblemId.set(recommendation.id);
    activeMilestoneIndex.set(getFirstIncompleteMilestoneIndex($milestoneProgress, recommendation));
    rightPaneTab.set('mentor');
  }

  function activateGuidedMentorPlan() {
    mentorSelectionMode.set('guided');
    if (guidedMentorSelection?.recommendation) {
      activeMilestoneIndex.set(
        getFirstIncompleteMilestoneIndex($milestoneProgress, guidedMentorSelection.recommendation)
      );
    }
    rightPaneTab.set('mentor');
  }

  function activateManualMentorPlan(recommendation: (typeof recommendedProblems)[number] | null) {
    if (!recommendation) return;
    mentorSelectionMode.set('manual');
    selectedPracticeProblemId.set(recommendation.id);
    activeMilestoneIndex.set(getFirstIncompleteMilestoneIndex($milestoneProgress, recommendation));
    rightPaneTab.set('mentor');
  }

  function focusMilestone(milestoneIndex: number) {
    activeMilestoneIndex.set(milestoneIndex);
  }

  function toggleMentorMilestone(
    recommendation: (typeof recommendedProblems)[number],
    milestoneIndex: number
  ) {
    const key = milestoneKey(recommendation.id, milestoneIndex);
    const nextCompleted = !Boolean($milestoneProgress[key]);

    milestoneProgress.update((current) => ({
      ...current,
      [key]: nextCompleted
    }));

    if (nextCompleted) {
      const nextIncomplete = recommendation.milestones.findIndex(
        (_milestone, nextIndex) =>
          nextIndex > milestoneIndex &&
          !Boolean($milestoneProgress[milestoneKey(recommendation.id, nextIndex)])
      );
      activeMilestoneIndex.set(nextIncomplete >= 0 ? nextIncomplete : milestoneIndex);
      return;
    }

    activeMilestoneIndex.set(milestoneIndex);
  }

  function isMilestoneComplete(problemId: string, milestoneIndex: number): boolean {
    return isMentorMilestoneComplete($milestoneProgress, problemId, milestoneIndex);
  }

  function firstIncompleteMilestoneIndex(
    recommendation: (typeof recommendedProblems)[number]
  ): number {
    return getFirstIncompleteMilestoneIndex($milestoneProgress, recommendation);
  }

  function triggerTrace() {
    dispatch('trace');
  }
</script>

<div class="right-pane">
  <div class="tab-bar">
    {#each RIGHT_PANE_TABS as tab}
      <button
        class="tab-btn"
        class:active={$rightPaneTab === tab.id}
        style="--tab-color: {tab.color}"
        on:click={() => rightPaneTab.set(tab.id)}
      >
        <span class="tab-icon">
          <svelte:component this={tab.Icon} size={14} />
        </span>
        <span class="tab-label">{tab.label}</span>
      </button>
    {/each}
  </div>

  <div class="content-area">
    {#if $rightPaneTab === 'console'}
      <ConsolePanel
        viewModel={consoleViewModel}
        onSendInputLine={sendRuntimeInputLine}
        onInterrupt={interruptRuntimeSession}
        onEof={sendRuntimeEof}
      />
    {/if}

    {#if $rightPaneTab === 'visualizer'}
      {#if visualizerViewModel}
        <VisualizerPanel viewModel={visualizerViewModel} onTrace={triggerTrace} />
      {/if}
    {/if}

    {#if $rightPaneTab === 'analysis'}
      {#if analysisViewModel}
        <AnalysisPanel
          viewModel={analysisViewModel}
          onActivateGuidedMentorPlan={activateGuidedMentorPlan}
          onActivateMentorPlan={activateMentorPlan}
        />
      {/if}
    {/if}

    {#if $rightPaneTab === 'mentor'}
      {#if mentorViewModel}
        <MentorPanel
          viewModel={mentorViewModel}
          onActivateGuidedMentorPlan={activateGuidedMentorPlan}
          onActivateManualMentorPlan={activateManualMentorPlan}
          onFocusMilestone={focusMilestone}
          onToggleMentorMilestone={toggleMentorMilestone}
          isMilestoneComplete={isMilestoneComplete}
          firstIncompleteMilestoneIndex={firstIncompleteMilestoneIndex}
        />
      {/if}
    {/if}
  </div>
</div>
