# Scheduled Publishing Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface an actionable GitHub Actions failure when a scheduled post fails to publish or was triggered more than 20 minutes late.

**Architecture:** The scheduler continues to write its authoritative status back to `scheduled-posts.json`, then exits non-zero only after those statuses are durable. The workflow deliberately continues past that publisher failure to commit the status, and finally fails the run; GitHub's existing workflow-failure notification is the no-secret alert channel. A separate cron-job.org HTTP failure notification is documented as the independent detector for the only case GitHub cannot observe: no external dispatch at all.

**Tech Stack:** Node.js 22, `node:test`, GitHub Actions, cron-job.org configuration.

## Global Constraints

- Do not modify queued content, platform credentials, or publication payloads.
- Preserve the scheduler's existing behavior: each due post is attempted once and gets `published` or `failed` persisted.
- Treat a post as overdue when it starts processing 20 minutes or more after `scheduledAt` (two 10-minute external-dispatch periods).
- Do not add external notification secrets; workflow failure is the configured in-repo alert signal.
- Document that cron-job.org must notify on a failed GitHub dispatch request to cover an absent external trigger.

---

### Task 1: Add a failing late-or-failed scheduler alert test

**Files:**
- Modify: `social-publisher/test/publish-scheduled-posts.test.js`
- Test: `social-publisher/test/publish-scheduled-posts.test.js`

**Interfaces:**
- Consumes: direct CLI execution of `scripts/publish-scheduled-posts.js` with `SCHEDULE_FILE` and publisher secrets supplied by the test.
- Produces: an assertion that a failed post or a post due at least 20 minutes ago makes the scheduler exit non-zero *after* writing its resulting status.

- [ ] **Step 1: Write the failing tests**

Add fixtures that run a queued Facebook post with a mock Graph API error, and a queued Facebook post whose `scheduledAt` is 20 minutes before a fixed execution time. Assert the resulting schedule is saved with `failed` or `published` respectively and that the child process exits with status 1.

- [ ] **Step 2: Run the focused test file and verify RED**

Run: `npm test -- publish-scheduled-posts.test.js`

Expected: the new assertions fail because the scheduler currently exits successfully after recording a failed or late post.

### Task 2: Persist status, then make alert-worthy runs fail

**Files:**
- Modify: `social-publisher/scripts/publish-scheduled-posts.js`
- Test: `social-publisher/test/publish-scheduled-posts.test.js`

**Interfaces:**
- Consumes: `PUBLISH_OVERDUE_AFTER_MINUTES`, defaulting to `20`; a due post's `scheduledAt`; post results after publication.
- Produces: `main()` saves schedule status first and returns an alert summary; CLI sets exit code 1 when the summary contains a failed or overdue post.

- [ ] **Step 1: Implement the minimal alert summary**

Calculate lateness at the single captured scheduler time, collect post IDs that failed or reached the 20-minute threshold, save the schedule if a due post was processed, print a concise alert line, and set non-zero CLI exit after saving.

- [ ] **Step 2: Run the focused test file and verify GREEN**

Run: `npm test -- publish-scheduled-posts.test.js`

Expected: all tests pass.

### Task 3: Preserve schedule commits and expose the GitHub Actions alert

**Files:**
- Modify: `.github/workflows/social-publisher.yml`
- Modify: `social-publisher/README.md`

**Interfaces:**
- Consumes: the publisher step's `outcome` after `continue-on-error: true`.
- Produces: `scheduled-posts.json` is committed even for alert-worthy runs, then the workflow exits non-zero; documentation specifies the 20-minute threshold and cron-job.org HTTP-failure notification requirement.

- [ ] **Step 1: Add a workflow failure gate after the status commit**

Give the publisher step ID `publish`, set `continue-on-error: true`, leave the existing status commit immediately afterward, then add a shell step that fails when `steps.publish.outcome` is `failure`.

- [ ] **Step 2: Document the two independent alert paths**

Document (1) GitHub Actions failure for a publish failure or 20-minute late processing, and (2) cron-job.org notifications for a failed dispatch request; state that the latter must be enabled by the cron-job.org account owner.

- [ ] **Step 3: Run full verification**

Run: `npm test && npm run check && npm run check:schedule-sync && git diff --check`

Expected: all tests and checks pass; no schedule content is modified.

### Task 4: Commit, push, and record dispatch completion

**Files:**
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-13 排程未發提醒機制.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/README.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/_index/rongxin-shenyu.md`

- [ ] **Step 1: Commit and push only implementation files**

Run focused and full verification immediately before staging `social-publisher/scripts/publish-scheduled-posts.js`, `social-publisher/test/publish-scheduled-posts.test.js`, `.github/workflows/social-publisher.yml`, and `social-publisher/README.md`.

- [ ] **Step 2: Write the vault execution record and completion report**

Include raw verification output, the 20-minute rationale, GitHub-run alert behavior, and the outstanding owner action to enable cron-job.org request-failure notifications.

- [ ] **Step 3: Commit only the four vault tracking files**

Commit the assignment update, execution log, project README, and project index without including unrelated vault work.

## Review

- Spec coverage: publish failures are surfaced after state persistence; late invocation is defined and surfaced; a completely missing external dispatch is assigned to cron-job.org, the only independent observer.
- No placeholders: every implementation, test, workflow, documentation, and closing file is named with a verifiable command.
- Scope: no post content or credential values are read, changed, or exposed.
