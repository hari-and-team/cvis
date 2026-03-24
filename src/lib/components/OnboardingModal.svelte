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
    background: rgba(14, 17, 22, 0.72);
    backdrop-filter: blur(10px);
  }

  .onboarding-modal {
    width: min(720px, 100%);
    max-height: min(92vh, 860px);
    overflow: auto;
    border-radius: 18px;
    border: 1px solid rgba(97, 175, 239, 0.16);
    background:
      radial-gradient(circle at top right, rgba(97, 175, 239, 0.12), transparent 34%),
      linear-gradient(180deg, rgba(33, 37, 43, 0.98), rgba(40, 44, 52, 0.98));
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
    padding: 24px;
    color: #e5e5e5;
  }

  .onboarding-header h2 {
    margin: 6px 0 8px;
    font-size: 26px;
    line-height: 1.1;
  }

  .onboarding-header p {
    margin: 0;
    color: rgba(229, 229, 229, 0.78);
    font-size: 14px;
    line-height: 1.6;
  }

  .onboarding-kicker {
    color: #61afef;
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
    color: rgba(229, 229, 229, 0.82);
    font-size: 12px;
    font-weight: 700;
  }

  .field-input {
    border: 1px solid rgba(92, 99, 112, 0.6);
    border-radius: 12px;
    background: rgba(12, 14, 18, 0.42);
    color: #f3f6fb;
    padding: 12px 14px;
    font-size: 13px;
    outline: none;
  }

  .field-input:focus {
    border-color: rgba(97, 175, 239, 0.72);
    box-shadow: 0 0 0 3px rgba(97, 175, 239, 0.14);
  }

  .role-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;
  }

  .role-card {
    border: 1px solid rgba(92, 99, 112, 0.58);
    border-radius: 14px;
    background: rgba(18, 21, 27, 0.56);
    padding: 14px;
    text-align: left;
    cursor: pointer;
    color: #e5e5e5;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .role-card-active {
    border-color: rgba(209, 154, 102, 0.78);
    background: rgba(209, 154, 102, 0.12);
  }

  .role-label {
    font-size: 13px;
    font-weight: 700;
  }

  .role-hint {
    color: rgba(229, 229, 229, 0.72);
    font-size: 11px;
    line-height: 1.6;
  }

  .onboarding-note {
    margin-top: 14px;
    color: rgba(171, 178, 191, 0.86);
    font-size: 11px;
    line-height: 1.6;
  }

  .onboarding-error {
    margin-top: 14px;
    border: 1px solid rgba(224, 108, 117, 0.38);
    background: rgba(224, 108, 117, 0.12);
    color: #f5b1b6;
    border-radius: 12px;
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
    border: none;
    border-radius: 999px;
    padding: 10px 16px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .action-btn-primary {
    background: linear-gradient(135deg, #61afef, #7ec8f6);
    color: #0f141c;
  }

  .action-btn-secondary {
    background: rgba(92, 99, 112, 0.26);
    color: #e5e5e5;
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
