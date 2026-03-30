<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { UserProfile, UserRole } from '$lib/types';

  export let open = false;
  export let existingProfile: UserProfile | null = null;

  const dispatch = createEventDispatcher<{
    save: { profile: UserProfile };
    cancel: void;
  }>();

  const ROLE_OPTIONS: Array<{ value: UserRole; label: string; hint: string }> = [
    { value: 'student', label: 'Student', hint: 'Learning with guided checkpoints and practice plans.' },
    { value: 'mentor', label: 'Mentor', hint: 'Reviewing learner progress and shaping problem paths.' },
    { value: 'staff', label: 'Staff', hint: 'Managing curriculum, support, and platform setup.' }
  ];

  let displayName = '';
  let role: UserRole = 'student';
  let learningGoal = '';
  let leetCodeInput = '';
  let profileError = '';
  let initializedForProfileId = '';

  $: profileIdentity = existingProfile
    ? `${existingProfile.displayName}:${existingProfile.updatedAt}`
    : open
      ? 'new-profile'
      : 'closed';

  $: if (open && profileIdentity !== initializedForProfileId) {
    initializedForProfileId = profileIdentity;
    displayName = existingProfile?.displayName ?? '';
    role = existingProfile?.role ?? 'student';
    learningGoal = existingProfile?.learningGoal ?? '';
    leetCodeInput = existingProfile?.leetCode?.profileUrl ?? existingProfile?.leetCode?.username ?? '';
    profileError = '';
  }

  function normalizeLeetCodeProfile(input: string): UserProfile['leetCode'] {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const sanitized = trimmed
      .replace(/^https?:\/\/leetcode\.com\/u\//i, '')
      .replace(/^https?:\/\/www\.leetcode\.com\/u\//i, '')
      .replace(/^https?:\/\/leetcode\.com\//i, '')
      .replace(/^https?:\/\/www\.leetcode\.com\//i, '')
      .replace(/^u\//i, '')
      .replace(/^profile\//i, '')
      .replace(/\/+$/g, '');

    const username = sanitized.split(/[/?#]/)[0]?.trim();
    if (!username || !/^[A-Za-z0-9_-]{2,40}$/.test(username)) {
      throw new Error('Enter a valid LeetCode username or profile URL.');
    }

    return {
      username,
      profileUrl: `https://leetcode.com/u/${username}/`
    };
  }

  function handleSave() {
    const normalizedName = displayName.trim();
    if (!normalizedName) {
      profileError = 'Display name is required.';
      return;
    }

    let leetCode = null;
    try {
      leetCode = normalizeLeetCodeProfile(leetCodeInput);
    } catch (err) {
      profileError = err instanceof Error ? err.message : 'Invalid LeetCode profile.';
      return;
    }

    const timestamp = Date.now();
    const profile: UserProfile = {
      displayName: normalizedName,
      role,
      learningGoal: learningGoal.trim(),
      leetCode,
      createdAt: existingProfile?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    dispatch('save', { profile });
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

{#if open}
  <div class="onboarding-backdrop" role="presentation">
    <div
      class="onboarding-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div class="onboarding-header">
        <div>
          <div class="onboarding-kicker">First-Time Setup</div>
          <h2 id="onboarding-title">
            {existingProfile ? 'Update your learning profile' : 'Create your local account'}
          </h2>
          <p>
            Set how you want to use the workspace, link LeetCode if you have it, and we will shape
            onboarding and mentor guidance around that profile.
          </p>
        </div>
      </div>

      <div class="onboarding-grid">
        <label class="field">
          <span class="field-label">Display name</span>
          <input bind:value={displayName} class="field-input" maxlength="48" placeholder="Karthi" />
        </label>

        <label class="field">
          <span class="field-label">Primary goal</span>
          <input
            bind:value={learningGoal}
            class="field-input"
            maxlength="120"
            placeholder="DSA prep, mentoring, interview drills, class support..."
          />
        </label>
      </div>

      <div class="role-grid">
        {#each ROLE_OPTIONS as option}
          <button
            type="button"
            class="role-card"
            class:role-card-active={role === option.value}
            on:click={() => (role = option.value)}
          >
            <span class="role-label">{option.label}</span>
            <span class="role-hint">{option.hint}</span>
          </button>
        {/each}
      </div>

      <label class="field">
        <span class="field-label">LeetCode username or profile URL</span>
        <input
          bind:value={leetCodeInput}
          class="field-input"
          placeholder="leetcode.com/u/your-name or just your-name"
        />
      </label>

      <div class="onboarding-note">
        Linking LeetCode is optional. When present, mentor plans can jump directly into your external problem workflow.
      </div>

      {#if profileError}
        <div class="onboarding-error">{profileError}</div>
      {/if}

      <div class="onboarding-actions">
        {#if existingProfile}
          <button type="button" class="action-btn action-btn-secondary" on:click={handleCancel}>
            Cancel
          </button>
        {/if}
        <button type="button" class="action-btn action-btn-primary" on:click={handleSave}>
          {existingProfile ? 'Save profile' : 'Create account'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .onboarding-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(13, 15, 19, 0.76);
    backdrop-filter: blur(8px);
  }

  .onboarding-modal {
    width: min(720px, 100%);
    max-height: min(92vh, 860px);
    overflow: auto;
    border-radius: var(--radius-panel);
    border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--selection-accent) 8%, transparent), transparent 32%),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--bg-card) 97%, transparent) 0%,
        color-mix(in srgb, var(--bg-deep) 92%, var(--bg-card)) 100%
      );
    box-shadow: var(--shadow-lift);
    padding: 24px;
    color: var(--text-bright);
  }

  .onboarding-header h2 {
    margin: 6px 0 8px;
    font-size: 26px;
    line-height: 1.1;
  }

  .onboarding-header p {
    margin: 0;
    color: color-mix(in srgb, var(--text-mid) 82%, var(--text-dim));
    font-size: 14px;
    line-height: 1.6;
  }

  .onboarding-kicker {
    color: color-mix(in srgb, var(--lavender) 64%, var(--purple));
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .onboarding-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
  }

  .field-label {
    color: color-mix(in srgb, var(--text-bright) 84%, var(--text-dim));
    font-size: 12px;
    font-weight: 700;
  }

  .field-input {
    border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--bg-deep) 96%, transparent);
    color: var(--text-bright);
    padding: 12px 14px;
    font-size: 13px;
    outline: none;
  }

  .field-input:focus {
    border-color: color-mix(in srgb, var(--selection-accent) 42%, var(--border));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--selection-accent) 12%, transparent);
  }

  .role-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;
  }

  .role-card {
    border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--bg-raised) 90%, transparent);
    padding: 14px;
    text-align: left;
    cursor: pointer;
    color: var(--text-bright);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .role-card-active {
    border-color: color-mix(in srgb, var(--selection-accent) 34%, var(--border));
    background: color-mix(in srgb, var(--selection-accent) 8%, var(--bg-raised));
  }

  .role-label {
    font-size: 13px;
    font-weight: 700;
  }

  .role-hint {
    color: color-mix(in srgb, var(--text-mid) 80%, var(--text-dim));
    font-size: 11px;
    line-height: 1.6;
  }

  .onboarding-note {
    margin-top: 14px;
    color: color-mix(in srgb, var(--text-mid) 84%, var(--text-dim));
    font-size: 11px;
    line-height: 1.6;
  }

  .onboarding-error {
    margin-top: 14px;
    border: 1px solid color-mix(in srgb, var(--red) 36%, var(--border));
    background: color-mix(in srgb, var(--red) 10%, var(--bg-raised));
    color: color-mix(in srgb, var(--red) 68%, white 32%);
    border-radius: var(--radius-card);
    padding: 10px 12px;
    font-size: 12px;
  }

  .onboarding-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
  }

  .action-btn {
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    padding: 10px 16px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .action-btn-primary {
    background: color-mix(in srgb, var(--selection-accent) 12%, var(--bg-raised));
    border-color: color-mix(in srgb, var(--selection-accent) 26%, var(--border));
    color: var(--text-bright);
  }

  .action-btn-secondary {
    background: color-mix(in srgb, var(--bg-raised) 92%, transparent);
    border-color: color-mix(in srgb, var(--border) 88%, transparent);
    color: var(--text-bright);
  }

  @media (max-width: 720px) {
    .onboarding-grid,
    .role-grid {
      grid-template-columns: 1fr;
    }

    .onboarding-modal {
      padding: 18px;
    }
  }
</style>
