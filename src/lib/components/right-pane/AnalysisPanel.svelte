<script lang="ts">
  import type { AnalysisViewModel } from '$lib/app-shell/right-pane/view-models';
  import { inertialScroll } from '$lib/shared/inertial-scroll';

  export let viewModel: AnalysisViewModel;
  export let onActivateGuidedMentorPlan: () => void;
  export let onActivateMentorPlan: (recommendation: any) => void;

  $: report = viewModel.report;
  $: dominantAnalysisSection = viewModel.dominantAnalysisSection;
  $: mainAnalysisSection = viewModel.mainAnalysisSection;
  $: identityEvidence = viewModel.identityEvidence;
  $: improvementItems = viewModel.improvementItems;
  $: practiceSummary = viewModel.practiceSummary;
  $: complexityFocusLabel = mainAnalysisSection ? 'main()' : viewModel.focusSectionLabel ?? 'Focus block';
  $: complexityFocusTime = mainAnalysisSection
    ? mainAnalysisSection.estimatedTimeComplexity
    : dominantAnalysisSection?.estimatedTimeComplexity ?? report.timeComplexity;
  $: complexityFocusSpace = mainAnalysisSection
    ? mainAnalysisSection.estimatedSpaceComplexity
    : dominantAnalysisSection?.estimatedSpaceComplexity ?? report.spaceComplexity;

  function findingSeverityLabel(value: 'info' | 'watch' | 'risk'): string {
    if (value === 'info') return 'Info';
    if (value === 'watch') return 'Watch';
    return 'Risk';
  }

  function difficultyClass(difficulty: string): string {
    if (difficulty === 'Hard') return 'difficulty-hard';
    if (difficulty === 'Medium') return 'difficulty-medium';
    return 'difficulty-easy';
  }
</script>

<div class="analysis-panel">
  <div class="analysis-scroll" use:inertialScroll>
    <section class="panel-intro-card panel-intro-card-analysis">
      <div class="panel-intro-header">
        <div class="panel-intro-copy">
          <span class="panel-intro-kicker">Analysis</span>
          <span class="panel-intro-title">Code Review</span>
          <span class="panel-intro-subtitle">
            See the DSA type, complexity, weak spots, and next improvement in one calm view.
          </span>
        </div>
        {#if practiceSummary.recommendation}
          <div class="panel-intro-actions">
            <button
              type="button"
              class="panel-action-btn panel-action-btn-primary"
              on:click={onActivateGuidedMentorPlan}
            >
              Refresh best next step
            </button>
          </div>
        {/if}
      </div>
    </section>

    <section class="analysis-card analysis-summary-card">
      <div class="analysis-header">
        <span class="analysis-title">Identity</span>
        <span class="analysis-meta">{viewModel.confidencePercent}% confidence</span>
      </div>
      <div class="analysis-primary-label">{viewModel.primaryTypeLabel}</div>
      <div class="analysis-summary-text">{viewModel.identityExplanation}</div>

      <div class="analysis-inline-metrics">
        {#if viewModel.implementationStyle}
          <div class="analysis-inline-metric">
            <span class="analysis-inline-label">Implementation</span>
            <span class="analysis-inline-value">{viewModel.implementationStyle}</span>
          </div>
        {/if}
        {#if viewModel.accessPattern}
          <div class="analysis-inline-metric">
            <span class="analysis-inline-label">Pattern</span>
            <span class="analysis-inline-value">{viewModel.accessPattern}</span>
          </div>
        {/if}
        {#if viewModel.focusSectionLabel}
          <div class="analysis-inline-metric">
            <span class="analysis-inline-label">Strongest signal</span>
            <span class="analysis-inline-value">{viewModel.focusSectionLabel}</span>
          </div>
        {/if}
      </div>

      {#if identityEvidence.length > 0}
        <div class="analysis-signal-row analysis-signal-row-strong">
          {#each identityEvidence as signal}
            <span class="analysis-signal analysis-signal-strong">{signal}</span>
          {/each}
        </div>
      {/if}
    </section>

    <section class="analysis-card">
      <div class="analysis-header">
        <span class="analysis-title">Complexity</span>
        <span class="analysis-meta">{complexityFocusLabel}</span>
      </div>
      <div class="complexity-grid">
        <div class="complexity-card">
          <span class="complexity-label">Overall Time</span>
          <span class="complexity-value">{report.timeComplexity}</span>
        </div>
        <div class="complexity-card">
          <span class="complexity-label">Overall Space</span>
          <span class="complexity-value">{report.spaceComplexity}</span>
        </div>
        <div class="complexity-card">
          <span class="complexity-label">{complexityFocusLabel} Time</span>
          <span class="complexity-value">{complexityFocusTime}</span>
        </div>
        <div class="complexity-card">
          <span class="complexity-label">{complexityFocusLabel} Space</span>
          <span class="complexity-value">{complexityFocusSpace}</span>
        </div>
      </div>
      {#if dominantAnalysisSection?.notes?.[0]}
        <div class="analysis-summary-hint analysis-summary-hint-block">
          {dominantAnalysisSection.notes[0]}
        </div>
      {/if}
    </section>

    <section class="analysis-card">
      <div class="analysis-header">
        <span class="analysis-title">Improve</span>
        <span class="analysis-meta">{improvementItems.length} focus areas</span>
      </div>
      {#if improvementItems.length > 0}
        <div class="improvement-list">
          {#each improvementItems as item}
            <article class="improvement-item">
              <div class="section-top">
                <span class="section-name">{item.title}</span>
                <span class="analysis-badge analysis-badge-{item.severity}">
                  {findingSeverityLabel(item.severity)}
                </span>
              </div>
              {#if item.location}
                <div class="analysis-subtitle">{item.location}</div>
              {/if}
              <div class="improvement-recommendation">{item.recommendation}</div>
              <div class="improvement-detail">{item.detail}</div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="analysis-empty-copy">
          No urgent cleanup stands out yet. Keep the current structure readable and keep testing edge cases.
        </div>
      {/if}
    </section>

    <section class="analysis-card analysis-practice-card">
      <div class="analysis-header">
        <span class="analysis-title">Practice</span>
        <span class="analysis-meta">{practiceSummary.queueCount} picks</span>
      </div>

      {#if practiceSummary.recommendation}
        <div class="practice-top">
          <div class="practice-copy">
            <div class="practice-title-row">
              <div class="analysis-primary-label practice-title">{practiceSummary.recommendation.title}</div>
              <span class="difficulty-pill {difficultyClass(practiceSummary.recommendation.difficulty)}">
                {practiceSummary.recommendation.difficulty}
              </span>
            </div>
            <div class="recommendation-category">{practiceSummary.recommendation.category}</div>
            <div class="analysis-summary-text">{practiceSummary.recommendation.reason}</div>
          </div>
        </div>

        <div class="practice-progress-row">
          <span class="practice-progress-pill">{practiceSummary.completionPercent}% complete</span>
          <span class="practice-progress-text">{practiceSummary.selectionSummary}</span>
        </div>

        {#if practiceSummary.currentMilestone}
          <div class="analysis-summary-hint analysis-summary-hint-block">
            Current step: {practiceSummary.currentMilestone}
          </div>
        {/if}

        {#if practiceSummary.hint}
          <div class="analysis-note practice-note">{practiceSummary.hint}</div>
        {/if}

        <div class="recommendation-actions">
          <a
            href={practiceSummary.recommendation.url}
            target="_blank"
            rel="noreferrer"
            class="recommendation-action recommendation-action-link"
          >
            Open problem
          </a>
          <button
            type="button"
            class="recommendation-action recommendation-action-secondary"
            on:click={onActivateGuidedMentorPlan}
          >
            Use best next pick
          </button>
        </div>

        {#if practiceSummary.alternateRecommendations.length > 0}
          <div class="analysis-evidence-label">Other good next picks</div>
          <div class="practice-option-row">
            {#each practiceSummary.alternateRecommendations as recommendation}
              <button
                type="button"
                class="practice-option-btn"
                on:click={() => onActivateMentorPlan(recommendation)}
              >
                {recommendation.title}
              </button>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="analysis-empty-copy">
          Add a little more code or trace the program once to unlock a better next-practice recommendation.
        </div>
      {/if}
    </section>
  </div>
</div>
