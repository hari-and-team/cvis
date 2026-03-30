<script lang="ts">
  import { ArrowRight, CheckCircle2, Circle, Lightbulb, Target } from 'lucide-svelte';
  import type { MentorViewModel } from '$lib/mentor/view-model';
  import { inertialScroll } from '$lib/shared/inertial-scroll';

  export let viewModel: MentorViewModel;
  export let onActivateGuidedMentorPlan: () => void;
  export let onActivateManualMentorPlan: (recommendation: any) => void;
  export let onFocusMilestone: (index: number) => void;
  export let onToggleMentorMilestone: (recommendation: any, milestoneIndex: number) => void;
  export let isMilestoneComplete: (problemId: string, milestoneIndex: number) => boolean;
  export let firstIncompleteMilestoneIndex: (recommendation: any) => number;

  $: selectedMentorProblem = viewModel.selectedMentorProblem;
  $: mentorCompletionPercent = viewModel.mentorCompletionPercent;
  $: mentorSelectionMode = viewModel.mentorSelectionMode;
  $: mentorSelectionSummary = viewModel.mentorSelectionSummary;
  $: mentorCompletedCount = viewModel.mentorCompletedCount;
  $: mentorTotalCount = viewModel.mentorTotalCount;
  $: mentorCurrentMilestoneIndex = viewModel.mentorCurrentMilestoneIndex;
  $: mentorCurrentMilestone = viewModel.mentorCurrentMilestone;
  $: personalizedMentorQueue = viewModel.personalizedMentorQueue;
  $: recommendedProblemsCount = viewModel.recommendedProblemsCount;
  $: mentorHintCards = viewModel.mentorHintCards;
  $: userProfile = viewModel.userProfile;
  $: guidedMentorRecommendationId = viewModel.guidedMentorRecommendationId;

  function difficultyClass(difficulty: string): string {
    if (difficulty === 'Hard') return 'difficulty-hard';
    if (difficulty === 'Medium') return 'difficulty-medium';
    return 'difficulty-easy';
  }
</script>

<div class="analysis-panel mentor-panel">
  <div class="analysis-scroll" use:inertialScroll>
    <section class="panel-intro-card panel-intro-card-mentor">
      <div class="panel-intro-header">
        <div class="panel-intro-copy">
          <span class="panel-intro-kicker">Mentor</span>
          <span class="panel-intro-title">Guided Practice</span>
          <span class="panel-intro-subtitle">
            Turn the strongest recommendation into a paced problem queue with milestone nudges.
          </span>
        </div>
        <div class="panel-intro-actions">
          <button
            type="button"
            class="panel-action-btn"
            class:panel-action-btn-active={mentorSelectionMode === 'guided'}
            on:click={onActivateGuidedMentorPlan}
          >
            AI-guided queue
          </button>
          {#if selectedMentorProblem}
            <button
              type="button"
              class="panel-action-btn"
              class:panel-action-btn-active={mentorSelectionMode === 'manual'}
              on:click={() => onActivateManualMentorPlan(selectedMentorProblem)}
            >
              Manual choice
            </button>
          {/if}
        </div>
      </div>
    </section>

    {#if selectedMentorProblem}
      <section class="analysis-card mentor-summary-card">
        <div class="analysis-header">
          <span class="analysis-title">AI Mentor</span>
          <span class="analysis-meta">{mentorCompletionPercent}% complete</span>
        </div>

        <div class="mentor-summary-top">
          <div class="mentor-summary-copy">
            <div class="analysis-primary-label">{selectedMentorProblem.title}</div>
            <div class="recommendation-category">{selectedMentorProblem.category}</div>
            <div class="mentor-summary-text">{selectedMentorProblem.reason}</div>
            <div class="mentor-selection-summary">{mentorSelectionSummary}</div>
          </div>
          <span class="difficulty-pill {difficultyClass(selectedMentorProblem.difficulty)}">
            {selectedMentorProblem.difficulty}
          </span>
        </div>

        <div class="mentor-progress-bar" aria-hidden="true">
          <span style="width: {mentorCompletionPercent}%;"></span>
        </div>

        <div class="mentor-progress-meta">
          <span>{mentorCompletedCount} of {mentorTotalCount} milestones checked</span>
          <span>Current focus: step {mentorCurrentMilestoneIndex + 1}</span>
        </div>

        <div class="mentor-action-row">
          <a
            href={selectedMentorProblem.url}
            target="_blank"
            rel="noreferrer"
            class="recommendation-action recommendation-action-link"
          >
            Open problem <ArrowRight size={12} />
          </a>
          <button
            type="button"
            class="recommendation-action"
            on:click={() => onFocusMilestone(firstIncompleteMilestoneIndex(selectedMentorProblem))}
          >
            Jump to next incomplete
          </button>
        </div>
      </section>

      {#if userProfile?.leetCode}
        <section class="analysis-card">
          <div class="analysis-header">
            <span class="analysis-title">LeetCode Integration</span>
            <span class="analysis-meta">@{userProfile.leetCode.username}</span>
          </div>
          <div class="mentor-summary-text">
            Your account is linked, so mentor recommendations can flow straight into your LeetCode routine.
          </div>
          <div class="mentor-action-row">
            <a
              href={userProfile.leetCode.profileUrl}
              target="_blank"
              rel="noreferrer"
              class="recommendation-action recommendation-action-link"
            >
              Open LeetCode profile <ArrowRight size={12} />
            </a>
          </div>
        </section>
      {/if}

      <section class="analysis-card">
        <div class="analysis-header">
          <span class="analysis-title">Problem Queue</span>
          <span class="analysis-meta">{recommendedProblemsCount} picks</span>
        </div>
        <div class="mentor-problem-list">
          {#each personalizedMentorQueue as entry}
            {@const recommendation = entry.recommendation}
            <button
              type="button"
              class="mentor-problem-item"
              class:mentor-problem-active={selectedMentorProblem.id === recommendation.id}
              on:click={() => onActivateManualMentorPlan(recommendation)}
            >
              <div class="mentor-problem-top">
                <span class="mentor-problem-title">{recommendation.title}</span>
                <span class="difficulty-pill {difficultyClass(recommendation.difficulty)}">
                  {recommendation.difficulty}
                </span>
              </div>
              <div class="recommendation-category">{recommendation.category}</div>
              <div class="mentor-problem-reason">{recommendation.reason}</div>
              <div class="mentor-problem-hint">{entry.notes[0]}</div>
              {#if guidedMentorRecommendationId === recommendation.id}
                <span class="mentor-focus-pill mentor-queue-pill">AI pick</span>
              {/if}
            </button>
          {/each}
        </div>
      </section>

      <section class="analysis-card">
        <div class="analysis-header">
          <span class="analysis-title">Milestone Plan</span>
          <span class="analysis-meta">{mentorTotalCount} checkpoints</span>
        </div>
        <div class="mentor-milestone-list">
          {#each selectedMentorProblem.milestones as milestone, milestoneIndex}
            <article
              class="mentor-milestone-item"
              class:mentor-milestone-active={mentorCurrentMilestoneIndex === milestoneIndex}
            >
              <button
                type="button"
                class="mentor-milestone-toggle"
                aria-label={isMilestoneComplete(selectedMentorProblem.id, milestoneIndex) ? 'Mark milestone incomplete' : 'Mark milestone complete'}
                on:click={() => onToggleMentorMilestone(selectedMentorProblem, milestoneIndex)}
              >
                {#if isMilestoneComplete(selectedMentorProblem.id, milestoneIndex)}
                  <CheckCircle2 size={16} />
                {:else}
                  <Circle size={16} />
                {/if}
              </button>

              <button
                type="button"
                class="mentor-milestone-copy"
                on:click={() => onFocusMilestone(milestoneIndex)}
              >
                <span class="mentor-milestone-step">Step {milestoneIndex + 1}</span>
                <span class="mentor-milestone-text">{milestone}</span>
              </button>

              {#if mentorCurrentMilestoneIndex === milestoneIndex}
                <span class="mentor-focus-pill">Focus</span>
              {/if}
            </article>
          {/each}
        </div>
      </section>

      <section class="analysis-card">
        <div class="analysis-header">
          <span class="analysis-title">Mentor Nudges</span>
          <span class="analysis-meta">small, guided, deeper</span>
        </div>

        {#if mentorCurrentMilestone}
          <div class="mentor-current-milestone">
            <Target size={14} />
            <span>{mentorCurrentMilestone}</span>
          </div>
        {/if}

        <div class="mentor-hint-grid">
          {#each mentorHintCards as hint}
            <article class="mentor-hint-card">
              <div class="mentor-hint-title">
                <Lightbulb size={13} />
                <span>{hint.title}</span>
              </div>
              <div class="mentor-hint-body">{hint.body}</div>
            </article>
          {/each}
        </div>
      </section>
    {:else}
      <div class="empty-visualizer mentor-empty">
        <div class="viz-icon-wrapper">
          <Target size={48} class="viz-icon" />
          <div class="viz-icon-pulse"></div>
        </div>
        <div class="viz-title">Mentor plan will appear here</div>
        <div class="viz-description">
          Analyze or trace code first so the mentor can turn the strongest recommendation into a guided checkpoint list.
        </div>
      </div>
    {/if}
  </div>
</div>
