# Instagram Carousel Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backward-compatible Instagram image carousel publishing to scheduled posts and the local publisher UI without changing existing schedule records or publishing a live test post.

**Architecture:** A focused `instagram-images.js` module owns input parsing and URL validation. `meta-service.js` owns the Meta container lifecycle, while the scheduler and Express UI only translate their inputs into the shared `publishInstagram()` contract. Single-image behavior remains the fallback path.

**Tech Stack:** Node.js ESM, Node built-in test runner, Express 4, Meta Graph API v22.0, `URLSearchParams`, GitHub Actions, GitHub Pages.

## Global Constraints

- Preserve all 42 existing records in `social-publisher/scheduled-posts.json` byte-for-byte; baseline SHA-256 is `97c871c8b9fad06bbbc4a910072f6edb334fca7eeacc789873cf7416a5bff5d6`.
- Keep existing `imageUrl` single-image publishing backward compatible.
- Accept 2 to 10 HTTP(S) image URLs for a carousel; one `imageUrls` entry uses the single-image flow.
- When both fields are populated, non-empty `imageUrls` takes precedence over `imageUrl`.
- Use `media_type=CAROUSEL` when creating the Instagram parent container.
- Do not implement Facebook, Threads, video, or mixed-media carousels.
- Dry-run must never call Meta, and safe live-API verification must create containers only without calling `/media_publish`.
- Do not modify, stage, or remove unrelated untracked files under `_creator/`, `assets/`, `scripts/`, or `tmp/`.
- Do not switch the current manually managed IG Persona 2 workflow to automatic scheduling.

## File Map

- Create `social-publisher/src/instagram-images.js`: pure parsing, precedence, count, and URL validation.
- Create `social-publisher/test/instagram-images.test.js`: unit tests for that input contract.
- Modify `social-publisher/src/meta-service.js`: create single or carousel containers and publish the completed parent.
- Modify `social-publisher/test/meta-service.test.js`: verify request order, form fields, legacy behavior, and failure stops.
- Modify `social-publisher/scripts/publish-scheduled-posts.js`: pass `imageUrls` into Instagram and make payload construction import-safe for tests.
- Create `social-publisher/test/publish-scheduled-posts.test.js`: verify schedule-to-Instagram payload translation.
- Modify `social-publisher/src/server.js`: parse the multiline field, include it in IG payloads, and render carousel previews.
- Modify `social-publisher/README.md`: document the schema and local UI behavior.
- Update Obsidian handoff files only after code, tests, safe verification, and push succeed.

---

### Task 1: Instagram Image Input Contract

**Files:**
- Create: `social-publisher/src/instagram-images.js`
- Create: `social-publisher/test/instagram-images.test.js`

**Interfaces:**
- Produces: `parseImageUrlsInput(value: unknown): string[]`
- Produces: `normalizeInstagramImageUrls({ imageUrl?: string, imageUrls?: string[] }): string[]`
- Consumes: standard `URL`; no network or project state.

- [ ] **Step 1: Write failing tests for precedence, parsing, and validation**

Create `social-publisher/test/instagram-images.test.js` with:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInstagramImageUrls,
  parseImageUrlsInput
} from "../src/instagram-images.js";

test("parseImageUrlsInput trims blank lines and preserves order", () => {
  assert.deepEqual(
    parseImageUrlsInput(" https://example.com/one.png\n\nhttps://example.com/two.png "),
    ["https://example.com/one.png", "https://example.com/two.png"]
  );
});

test("normalizeInstagramImageUrls prefers a non-empty imageUrls array", () => {
  assert.deepEqual(
    normalizeInstagramImageUrls({
      imageUrl: "https://example.com/legacy.png",
      imageUrls: ["https://example.com/one.png", "https://example.com/two.png"]
    }),
    ["https://example.com/one.png", "https://example.com/two.png"]
  );
});

test("normalizeInstagramImageUrls falls back to imageUrl", () => {
  assert.deepEqual(
    normalizeInstagramImageUrls({ imageUrl: "https://example.com/legacy.png", imageUrls: [] }),
    ["https://example.com/legacy.png"]
  );
});

test("normalizeInstagramImageUrls rejects invalid inputs before publishing", () => {
  assert.throws(() => normalizeInstagramImageUrls({}), /requires at least one image URL/);
  assert.throws(
    () => normalizeInstagramImageUrls({ imageUrls: "https://example.com/one.png" }),
    /imageUrls must be an array/
  );
  assert.throws(
    () => normalizeInstagramImageUrls({ imageUrls: ["ftp://example.com/one.png"] }),
    /must use http or https/
  );
  assert.throws(
    () => normalizeInstagramImageUrls({ imageUrls: Array(11).fill("https://example.com/a.png") }),
    /supports at most 10 images/
  );
});
```

- [ ] **Step 2: Run the focused tests and confirm the missing-module failure**

Run:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
npm test -- test/instagram-images.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/instagram-images.js`.

- [ ] **Step 3: Implement the pure parsing and validation module**

Create `social-publisher/src/instagram-images.js` with:

```js
const maxInstagramCarouselImages = 10;

export function parseImageUrlsInput(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeInstagramImageUrls({ imageUrl = "", imageUrls } = {}) {
  if (imageUrls !== undefined && !Array.isArray(imageUrls)) {
    throw new Error("Instagram imageUrls must be an array.");
  }

  const candidates = imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : [];
  if (!candidates.length) {
    throw new Error("Instagram publishing requires at least one image URL.");
  }
  if (candidates.length > maxInstagramCarouselImages) {
    throw new Error(`Instagram supports at most ${maxInstagramCarouselImages} images.`);
  }

  return candidates.map((value, index) => normalizeHttpUrl(value, index));
}

function normalizeHttpUrl(value, index) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Instagram image ${index + 1} must be a non-empty URL.`);
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`Instagram image ${index + 1} must be a valid URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Instagram image ${index + 1} must use http or https.`);
  }

  return parsed.toString();
}
```

- [ ] **Step 4: Run the focused tests and the existing suite**

Run:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
npm test -- test/instagram-images.test.js
npm test
```

Expected: 4 new tests PASS; the existing Instagram single-image test also PASS.

- [ ] **Step 5: Commit the input contract**

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu
git add social-publisher/src/instagram-images.js social-publisher/test/instagram-images.test.js
git commit -m "feat: validate Instagram carousel images"
```

---

### Task 2: Meta Carousel Container Lifecycle

**Files:**
- Modify: `social-publisher/src/meta-service.js:188-248`
- Modify: `social-publisher/test/meta-service.test.js`

**Interfaces:**
- Consumes: `normalizeInstagramImageUrls()` from Task 1.
- Produces: `createInstagramMediaContainer(args): Promise<{ id: string }>` without publishing.
- Preserves: `publishInstagram(args): Promise<{ id: string }>` as the public publishing entry point.

- [ ] **Step 1: Add a failing full-sequence carousel test**

Extend `social-publisher/test/meta-service.test.js` so mocked calls retain `options.body`, then add a test that returns `child_1`, `child_2`, and `parent_1`. Assert this exact sequence:

```js
test("publishInstagram creates and publishes an ordered image carousel", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let mediaCreateCount = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), method: options.method || "GET", body: options.body };
    calls.push(call);

    if (call.url.endsWith("/ig_1/media")) {
      mediaCreateCount += 1;
      return jsonResponse({ id: ["child_1", "child_2", "parent_1"][mediaCreateCount - 1] });
    }
    if (/\/(child_1|child_2|parent_1)\?/.test(call.url)) {
      return jsonResponse({ status_code: "FINISHED" });
    }
    if (call.url.endsWith("/ig_1/media_publish")) {
      return jsonResponse({ id: "carousel_media_1" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await publishInstagram({
    instagramUserId: "ig_1",
    pageAccessToken: "page_token",
    caption: "carousel caption",
    imageUrls: ["https://example.com/one.png", "https://example.com/two.png"],
    containerPollOptions: { attempts: 1, delayMs: 0 }
  });

  assert.deepEqual(result, { id: "carousel_media_1" });
  assert.equal(calls.length, 7);
  assert.equal(calls[0].body.get("is_carousel_item"), "true");
  assert.equal(calls[2].body.get("is_carousel_item"), "true");
  assert.equal(calls[4].body.get("media_type"), "CAROUSEL");
  assert.equal(calls[4].body.get("children"), "child_1,child_2");
  assert.equal(calls[4].body.get("caption"), "carousel caption");
  assert.equal(calls[6].body.get("creation_id"), "parent_1");
});
```

Add the failure-stop test:

```js
test("publishInstagram stops when a carousel child fails", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body };
    calls.push(call);
    if (call.url.endsWith("/ig_1/media")) return jsonResponse({ id: "child_1" });
    if (call.url.includes("/child_1?")) return jsonResponse({ status_code: "ERROR" });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await assert.rejects(
    publishInstagram({
      instagramUserId: "ig_1",
      pageAccessToken: "page_token",
      caption: "caption",
      imageUrls: ["https://example.com/one.png", "https://example.com/two.png"],
      containerPollOptions: { attempts: 1, delayMs: 0 }
    }),
    /Instagram carousel item 1 failed/
  );

  assert.equal(calls.filter((call) => call.url.endsWith("/ig_1/media")).length, 1);
  assert.equal(calls.some((call) => call.url.endsWith("/ig_1/media_publish")), false);
});
```

- [ ] **Step 2: Run the Meta service tests and confirm carousel failure**

Run:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
npm test -- test/meta-service.test.js
```

Expected: existing single-image test PASS; new carousel tests FAIL because `imageUrls` is not handled.

- [ ] **Step 3: Split container creation from publication and add carousel flow**

Import the validator:

```js
import { normalizeInstagramImageUrls } from "./instagram-images.js";
```

Replace the current inline single-container block with these responsibilities:

```js
export async function createInstagramMediaContainer({
  instagramUserId,
  pageAccessToken,
  caption,
  imageUrl,
  imageUrls,
  containerPollOptions
}) {
  const normalizedUrls = normalizeInstagramImageUrls({ imageUrl, imageUrls });

  if (normalizedUrls.length === 1) {
    return createReadyInstagramContainer({
      instagramUserId,
      pageAccessToken,
      values: { image_url: normalizedUrls[0], caption },
      containerPollOptions
    });
  }

  const childIds = [];
  for (const [index, childImageUrl] of normalizedUrls.entries()) {
    try {
      const child = await createReadyInstagramContainer({
        instagramUserId,
        pageAccessToken,
        values: { image_url: childImageUrl, is_carousel_item: true },
        containerPollOptions
      });
      childIds.push(child.id);
    } catch (error) {
      throw new Error(`Instagram carousel item ${index + 1} failed: ${error.message}`, {
        cause: error
      });
    }
  }

  return createReadyInstagramContainer({
    instagramUserId,
    pageAccessToken,
    values: { media_type: "CAROUSEL", children: childIds.join(","), caption },
    containerPollOptions
  });
}

async function createReadyInstagramContainer({
  instagramUserId,
  pageAccessToken,
  values,
  containerPollOptions
}) {
  const container = await fetchJson(`${facebookGraphBase}/${instagramUserId}/media`, {
    method: "POST",
    body: formBody({ ...values, access_token: pageAccessToken })
  });

  await waitForInstagramContainer({
    containerId: container.id,
    pageAccessToken,
    ...containerPollOptions
  });
  return container;
}
```

Keep `publishInstagram()` as:

```js
export async function publishInstagram(args) {
  const container = await createInstagramMediaContainer(args);
  return fetchJson(`${facebookGraphBase}/${args.instagramUserId}/media_publish`, {
    method: "POST",
    body: formBody({
      creation_id: container.id,
      access_token: args.pageAccessToken
    })
  });
}
```

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
npm test -- test/meta-service.test.js
npm test
```

Expected: single-image, ordered carousel, and failure-stop tests PASS.

- [ ] **Step 5: Commit the Meta lifecycle**

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu
git add social-publisher/src/meta-service.js social-publisher/test/meta-service.test.js
git commit -m "feat: publish Instagram image carousels"
```

---

### Task 3: Scheduled Post Wiring

**Files:**
- Modify: `social-publisher/scripts/publish-scheduled-posts.js:1-130`
- Create: `social-publisher/test/publish-scheduled-posts.test.js`

**Interfaces:**
- Consumes: `post.imageUrl`, optional `post.imageUrls`, and environment IDs/tokens.
- Produces: `buildInstagramPublishPayload(post, env)` for testable payload construction.
- Passes the payload to `publishInstagram()` without changing Facebook or Threads behavior.

- [ ] **Step 1: Write a failing scheduler payload test**

Create `social-publisher/test/publish-scheduled-posts.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildInstagramPublishPayload } from "../scripts/publish-scheduled-posts.js";

const env = {
  INSTAGRAM_USER_ID: "ig_1",
  META_PAGE_ACCESS_TOKEN: "page_token"
};

test("buildInstagramPublishPayload forwards carousel images", () => {
  assert.deepEqual(
    buildInstagramPublishPayload(
      {
        message: "caption",
        imageUrl: "https://example.com/legacy.png",
        imageUrls: ["https://example.com/one.png", "https://example.com/two.png"]
      },
      env
    ),
    {
      instagramUserId: "ig_1",
      pageAccessToken: "page_token",
      caption: "caption",
      imageUrl: "https://example.com/legacy.png",
      imageUrls: ["https://example.com/one.png", "https://example.com/two.png"]
    }
  );
});

test("buildInstagramPublishPayload preserves legacy single-image posts", () => {
  assert.equal(
    buildInstagramPublishPayload(
      { message: "caption", imageUrl: "https://example.com/legacy.png" },
      env
    ).imageUrl,
    "https://example.com/legacy.png"
  );
});
```

- [ ] **Step 2: Run the focused test and confirm import/export failure**

Run:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
npm test -- test/publish-scheduled-posts.test.js
```

Expected: FAIL because the script does not export `buildInstagramPublishPayload` and executes `main()` on import.

- [ ] **Step 3: Make the scheduler import-safe and forward `imageUrls`**

Add `pathToFileURL` from `node:url`, allow `requireEnv(name, env = process.env)`, and export:

```js
export function buildInstagramPublishPayload(post, env = process.env) {
  return {
    instagramUserId: requireEnv("INSTAGRAM_USER_ID", env),
    pageAccessToken: requireEnv("META_PAGE_ACCESS_TOKEN", env),
    caption: post.message,
    imageUrl: post.imageUrl || "",
    imageUrls: post.imageUrls
  };
}
```

Use `publishInstagram(buildInstagramPublishPayload(post))` in the Instagram branch. Export `main()` and replace unconditional execution with:

```js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run scheduler and full tests**

Run:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
npm test -- test/publish-scheduled-posts.test.js
npm test
```

Expected: both scheduler tests PASS; no import-time attempt to read secrets or publish.

- [ ] **Step 5: Confirm the schedule file hash did not change**

Run:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu
shasum -a 256 social-publisher/scheduled-posts.json
```

Expected SHA-256: `97c871c8b9fad06bbbc4a910072f6edb334fca7eeacc789873cf7416a5bff5d6`.

- [ ] **Step 6: Commit scheduler wiring**

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu
git add social-publisher/scripts/publish-scheduled-posts.js social-publisher/test/publish-scheduled-posts.test.js
git commit -m "feat: pass carousel images from scheduled posts"
```

---

### Task 4: Local Publisher UI and Documentation

**Files:**
- Modify: `social-publisher/src/server.js:1-235,451-473,564-593`
- Modify: `social-publisher/README.md:152-176,230-260`

**Interfaces:**
- Consumes: `parseImageUrlsInput()` from Task 1.
- Sends: `imageUrls: string[]` only to Instagram payloads.
- Renders: first carousel image as preview plus `輪播 N 張` metadata.

- [ ] **Step 1: Wire multiline input into the Instagram request path**

Import `parseImageUrlsInput`, then parse the new form field:

```js
const imageUrl = String(req.body.imageUrl || "").trim();
const imageUrls = parseImageUrlsInput(req.body.imageUrls);
```

Include `imageUrls` in both Instagram Dry-run payloads and the real Instagram payload. Keep Facebook and Threads payloads on `imageUrl` only. Include `imageUrls` in `appendPublishLog()` so local records show what was submitted.

- [ ] **Step 2: Add the multiline form control**

Place this immediately after the existing single-image URL input:

```html
<label for="imageUrls">IG 輪播圖片 URL（每行一個，2–10 張；填寫後優先於單圖）</label>
<textarea id="imageUrls" name="imageUrls" rows="5" placeholder="https://.../slide-1.png&#10;https://.../slide-2.png"></textarea>
```

Dry-run remains checked by default.

- [ ] **Step 3: Render carousel schedule previews without validating on page load**

Add a tolerant display helper:

```js
function scheduledImageUrls(post) {
  if (Array.isArray(post.imageUrls) && post.imageUrls.length) return post.imageUrls;
  return post.imageUrl ? [post.imageUrl] : [];
}
```

In `renderScheduleItem(post)`, use the first URL for the thumbnail and render `輪播 ${urls.length} 張` when `urls.length > 1`. Do not call the strict publishing validator while rendering old schedule data.

- [ ] **Step 4: Update README schema and usage documentation**

Add `imageUrls` to the JSON example and state:

- `imageUrls` is optional and Instagram-only.
- 2–10 URLs publish a carousel in array order.
- One URL uses the single-image path.
- Non-empty `imageUrls` overrides `imageUrl` for Instagram.
- All URLs must be publicly reachable HTTP(S) images.
- Facebook and Threads continue using only `imageUrl`.

- [ ] **Step 5: Run tests and a local Dry-run smoke test**

Run all tests:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
npm test
```

Then launch the server on an alternate port with a temporary store:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
PORT=3101 TOKEN_STORE_PATH=/tmp/rongxin-carousel-dry-run-tokens.json npm start
```

In another command, submit a Dry-run:

```bash
curl -fsS -X POST http://localhost:3101/publish \
  --data-urlencode 'platforms=instagram' \
  --data-urlencode 'message=Carousel dry run' \
  --data-urlencode $'imageUrls=https://example.com/one.png\nhttps://example.com/two.png' \
  --data-urlencode 'dryRun=on'
```

Expected: HTTP 200 HTML containing both image URLs and `dryRun`; no Meta request and no public post.

- [ ] **Step 6: Commit UI and docs**

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu
git add social-publisher/src/server.js social-publisher/README.md
git commit -m "feat: add Instagram carousel controls"
```

---

### Task 5: Verification, Push, and Obsidian Handoff

**Files:**
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-08-07 IG輪播發布支援.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/README.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/_index/rongxin-shenyu.md`

**Interfaces:**
- Consumes: passing tests, Git commit IDs, GitHub Pages HTTP results, and safe container ID.
- Produces: pushed code plus a durable cross-agent handoff with explicit remaining limitations.

- [ ] **Step 1: Run final local verification**

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
npm test
cd /Volumes/fast/CODEX/rongxin-shenyu
git diff --check
shasum -a 256 social-publisher/scheduled-posts.json
```

Expected: all tests PASS, no whitespace errors, and schedule SHA-256 remains `97c871c8b9fad06bbbc4a910072f6edb334fca7eeacc789873cf7416a5bff5d6`.

- [ ] **Step 2: Push existing asset commits and implementation commits**

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu
git push origin main
git fetch origin
git log --oneline origin/main..HEAD
```

Expected: push succeeds and the final log command has no output.

- [ ] **Step 3: Verify all five public image URLs**

Check these exact public assets:

```text
https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene1-look-up.png
https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene2-crouch.png
https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene3-shoulders.png
https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene4-view.png
https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/otouto-screen-vs-listen.png
```

Run:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene1-look-up.png
curl -fsS -o /dev/null -w '%{http_code}\n' https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene2-crouch.png
curl -fsS -o /dev/null -w '%{http_code}\n' https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene3-shoulders.png
curl -fsS -o /dev/null -w '%{http_code}\n' https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene4-view.png
curl -fsS -o /dev/null -w '%{http_code}\n' https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/otouto-screen-vs-listen.png
```

Expected: five `200` responses.

- [ ] **Step 4: Create a real carousel container without publishing it**

From `social-publisher/`, run this Node ESM command. It imports `createInstagramMediaContainer()`, loads `.env` through `dotenv/config`, and passes the four public Father’s Day URLs:

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
node --input-type=module -e '
import "dotenv/config";
const { createInstagramMediaContainer } = await import("./src/meta-service.js");
const instagramUserId = process.env.INSTAGRAM_USER_ID;
const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
if (!instagramUserId || !pageAccessToken) {
  throw new Error("Missing INSTAGRAM_USER_ID or META_PAGE_ACCESS_TOKEN");
}
const container = await createInstagramMediaContainer({
  instagramUserId,
  pageAccessToken,
  caption: "IG carousel container verification - not published",
  imageUrls: [
    "https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene1-look-up.png",
    "https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene2-crouch.png",
    "https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene3-shoulders.png",
    "https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/papaday-scene4-view.png"
  ]
});
console.log(JSON.stringify({ containerId: container.id, published: false }));
'
```

Expected: JSON containing a non-empty `containerId` and `"published":false`. The command must not call `publishInstagram()` or `/media_publish`. If required secrets are absent, record `待確認：缺少本機 Meta 憑證，未執行 container 實測` rather than exposing or requesting token values in chat.

- [ ] **Step 5: Update the assignment and project indexes**

In `assignments.md`:

- Change the 2026-08-07 IG carousel task from `[ ]` to `[x]` only after verification.
- Record implementation commit IDs, test count, safe container ID or credential blocker, the unchanged schedule hash, five Pages HTTP results, and that Facebook/Threads multi-image plus live publishing remain out of scope.
- Add a newest-first `2026-08-07 Codex IG 輪播支援` entry under `回報區`.

Create the log with `Summary`, `Context`, `Current Status`, `Decisions`, `Verification`, `Open Questions`, and `Links`. Add one concise status bullet and the log link to both project indexes. Do not update `_index/master-index.md` because the project itself remains active and this is not a project-level state change.

- [ ] **Step 6: Commit the clean vault handoff**

First verify the vault status. If unrelated changes appeared during implementation, stage only the four handoff files. If the vault remains clean except for this task, commit:

```bash
cd /Volumes/fast/Obsidian/ai-notes
git add rongxin-shenyu/todo/assignments.md \
  'rongxin-shenyu/logs/2026-08-07 IG輪播發布支援.md' \
  rongxin-shenyu/README.md \
  _index/rongxin-shenyu.md
git commit -m "docs: record Instagram carousel support"
```

- [ ] **Step 7: Final status check**

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu
git status --short --branch
git log -6 --oneline
cd /Volumes/fast/Obsidian/ai-notes
git status --short --branch
```

Expected: project branch matches `origin/main` except for the pre-existing unrelated untracked files; vault has no uncommitted handoff changes. Report the live publication limitation clearly: container creation was safe-tested, but no carousel was publicly posted.
