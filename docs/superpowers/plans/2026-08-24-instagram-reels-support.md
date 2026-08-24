# Instagram Reels Publishing Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated Instagram Reels publishing from a public `videoUrl` across Meta containers, scheduled publishing, and the local dry-run interface.

**Architecture:** A focused Instagram media normalizer produces one image, carousel, or Reel descriptor. Both entry points validate before any platform request, while the existing Instagram container/publish lifecycle dispatches by descriptor kind and applies media-specific poll defaults.

**Tech Stack:** Node.js ES modules, native `node:test`, Express, Meta Graph API form requests.

## Global Constraints

- `imageUrl`, non-empty `imageUrls`, and `videoUrl` are mutually exclusive.
- Reel containers use `media_type=REELS`, `video_url`, and `caption`.
- Reel polling defaults are 60 attempts and 5000 ms; explicit caller overrides remain supported.
- Facebook and Threads do not receive or publish `videoUrl`.
- Do not modify `scheduled-posts.json`.
- Do not make real Meta API calls or publish a live post.

---

### Task 1: Normalize Instagram Media Inputs

**Files:**
- Create: `social-publisher/src/instagram-media.js`
- Create: `social-publisher/test/instagram-media.test.js`

**Interfaces:**
- Consumes: `normalizeInstagramImageUrls({ imageUrl, imageUrls })`.
- Produces: `normalizeInstagramMediaInput({ imageUrl, imageUrls, videoUrl })` returning a normalized `kind` descriptor.

- [ ] Write failing tests for a valid Reel, HTTP(S) validation, missing media, and every pair of conflicting sources.
- [ ] Run `node --test test/instagram-media.test.js` and confirm failure because the module does not exist.
- [ ] Implement minimal normalization and URL validation.
- [ ] Run the focused test and all tests.
- [ ] Commit `feat: validate Instagram Reel media input`.

### Task 2: Create And Publish Reel Containers

**Files:**
- Modify: `social-publisher/src/meta-service.js`
- Modify: `social-publisher/test/meta-service.test.js`

**Interfaces:**
- Consumes: `normalizeInstagramMediaInput()`.
- Produces: Reel container creation through existing `createInstagramMediaContainer()` and `publishInstagram()`.

- [ ] Write failing tests for `media_type=REELS`, `video_url`, caption, wider Reel poll defaults, explicit overrides, and no publish when container processing fails.
- [ ] Run focused tests and confirm the expected failures.
- [ ] Dispatch image, carousel, and Reel descriptors inside `createInstagramMediaContainer()`; merge media-specific defaults before polling.
- [ ] Run focused and full tests.
- [ ] Commit `feat: publish Instagram Reels`.

### Task 3: Forward Reels Through Scheduled Publishing

**Files:**
- Modify: `social-publisher/scripts/publish-scheduled-posts.js`
- Modify: `social-publisher/test/publish-scheduled-posts.test.js`

**Interfaces:**
- Consumes: normalized Instagram media descriptors.
- Produces: `buildInstagramPublishPayload()` with `videoUrl` for Reel posts and no video fields for other platforms.

- [ ] Write failing tests for Reel payload forwarding, source conflicts, invalid video URL, and mixed-platform rejection before mocked fetch.
- [ ] Run focused tests and confirm failures.
- [ ] Normalize in `buildInstagramPublishPayload()` and reuse the payload before the platform loop.
- [ ] Run focused and full tests.
- [ ] Commit `feat: schedule Instagram Reels`.

### Task 4: Add Local Reel Dry-Run And Preview

**Files:**
- Modify: `social-publisher/src/server.js`
- Modify: `social-publisher/test/server.test.js`
- Modify: `social-publisher/README.md`

**Interfaces:**
- Consumes: `normalizeInstagramMediaInput()` and form field `videoUrl`.
- Produces: normalized dry-run/live Instagram payload, publish-log `videoUrl`, and Reel schedule preview.

- [ ] Extend the server integration test to require the Reel URL field, normalized Reel dry-run payload, log persistence, schedule Reel label, source-conflict rejection before fetch, and Facebook/Threads isolation.
- [ ] Run the server test and confirm failure.
- [ ] Add the form field, payload handling, logging, preview, and documentation.
- [ ] Run focused and full tests.
- [ ] Commit `feat: add Instagram Reel controls`.

### Task 5: Verify, Review, Merge, And Hand Off

**Files:**
- Modify: `rongxin-shenyu/todo/assignments.md`
- Create: `rongxin-shenyu/logs/2026-08-24 IG Reels發布支援.md`
- Modify: `rongxin-shenyu/README.md`
- Modify: `_index/rongxin-shenyu.md`

**Interfaces:**
- Consumes: merged test and Git evidence.
- Produces: pushed `main` and durable Obsidian handoff.

- [ ] Run `npm test`, config check using the existing local `.env` without printing values, `npm run check:schedule-sync`, and `git diff --check`.
- [ ] Confirm `scheduled-posts.json` has the same SHA-256 and post count as the baseline.
- [ ] Review the complete branch, fix any important findings, merge to `main`, rerun tests, and push.
- [ ] Mark the assignment complete, add newest-first `2026-08-24 Codex IG Reels 支援` report, write the log, update project README/index, and mark live Meta publication `待確認`.
- [ ] Commit only intended vault files; preserve unrelated vault changes.
