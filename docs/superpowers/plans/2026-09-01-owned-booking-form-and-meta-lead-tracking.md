# Owned Booking Form and Meta Lead Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-stage booking intake on `rongxinshenyu.com`, keep submissions in the existing Google spreadsheet, notify the owner, and deduplicate browser/server Meta `Lead` events for Pixel `4400969670158242`.

**Architecture:** GitHub Pages serves a static booking page, a thank-you page, and small browser modules. The booking form posts into a hidden iframe backed by a spreadsheet-bound Google Apps Script web app, so errors preserve the current DOM values without putting sensitive answers in browser storage. Apps Script validates and stores the response, sends a minimal notification and CAPI event, then reports status to the parent page with a tightly validated `postMessage` contract.

**Tech Stack:** Static HTML/CSS, browser ES modules, Node.js built-in test runner, Google Apps Script V8, Google Sheets/Mail/UrlFetch services, Meta Conversions API, GitHub Pages.

---

## Scope And File Map

Create:

- `scripts/booking-core.mjs` — pure browser-side validation, tracking-cookie parsing, event IDs, and message trust checks.
- `scripts/booking-page.mjs` — booking-page DOM state, hidden-iframe submission, timeout/retry, and success redirect.
- `scripts/thank-you-page.mjs` — one-shot browser `Lead` dispatch.
- `scripts/configure-booking-endpoint.mjs` — validates the deployed Apps Script URL and generates the public endpoint module.
- `scripts/booking-config.mjs` — generated, checked-in public Apps Script endpoint; contains no secret.
- `booking.html` — first-stage intake and safety gate.
- `thank-you.html` — submission confirmation and browser Pixel event surface.
- `test/booking-core.test.mjs` — pure frontend tests.
- `test/booking-apps-script.test.mjs` — Apps Script validation, orchestration, safe bridge, and CAPI payload tests through `node:vm`.
- `test/booking-site.test.mjs` — static integration checks for pages, CTAs, sitemap, Pixel IDs, and secret leakage.
- `apps-script/booking-intake/Code.gs` — spreadsheet-bound web app.
- `apps-script/booking-intake/appsscript.json` — explicit Apps Script scopes/runtime.
- `apps-script/booking-intake/README.md` — deployment, Script Properties, rollback, and verification instructions.

Modify:

- `styles.css` — booking, safety, error, loading, and thank-you states.
- `index.html` — switch primary intake links and update privacy wording.
- `articles/career-transition.html` — point booking CTAs to the owned form.
- `articles/workplace-confusion.html` — point booking CTAs to the owned form.
- `sitemap.xml` — add `/booking.html`; keep `/thank-you.html` out because it is `noindex`.
- `README.md` — document the two-stage booking flow and verification commands.
- `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/README.md` — record the live booking/CAPI state after verification.
- `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md` — add the completion evidence in the report section without disturbing unrelated assignments.

Do not modify `social-publisher/scheduled-posts.json`, advertising budgets, campaigns, existing payment settings, or the second-stage Google Form questions.

### Task 1: Frontend Core Contract

**Files:**

- Create: `scripts/booking-core.mjs`
- Create: `test/booking-core.test.mjs`

- [ ] **Step 1: Write failing tests for normalization, validation, tracking identifiers, and trusted replies**

```js
// test/booking-core.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFbc,
  createEventId,
  getCookie,
  isTrustedReply,
  normalizeEmail,
  validateBooking
} from "../scripts/booking-core.mjs";

const valid = {
  displayName: "小榮",
  email: "USER@Example.com ",
  stuckText: "我在工作與家人期待之間反覆拉扯，不知道下一步怎麼選。",
  topic: "行動",
  goals: ["釐清方向"],
  availability: ["平日晚上"],
  adultConfirmed: true,
  taiwanConfirmed: true,
  consentConfirmed: true
};

test("normalizes email before storage and hashing", () => {
  assert.equal(normalizeEmail(" USER@Example.com "), "user@example.com");
});

test("accepts the approved first-stage payload", () => {
  assert.deepEqual(validateBooking(valid), {});
});

test("rejects unknown choices and a short description", () => {
  const errors = validateBooking({ ...valid, stuckText: "太短", topic: "診斷" });
  assert.equal(errors.stuckText, "請至少輸入 20 個字，讓我們能初步理解你的狀態。");
  assert.equal(errors.topic, "請選擇一個主要卡點。");
});

test("reads fbp and builds fbc only from a valid fbclid", () => {
  assert.equal(getCookie("_fbp", "a=1; _fbp=fb.1.10.20"), "fb.1.10.20");
  assert.equal(buildFbc("https://rongxinshenyu.com/booking.html?fbclid=abc_DEF-12", 1700000000000), "fb.1.1700000000.abc_DEF-12");
  assert.equal(buildFbc("https://rongxinshenyu.com/booking.html?fbclid=%3Cbad%3E", 1700000000000), "");
});

test("creates a namespaced UUID event id", () => {
  assert.equal(createEventId({ randomUUID: () => "00000000-0000-4000-8000-000000000000" }), "lead_00000000-0000-4000-8000-000000000000");
});

test("trusts only the active iframe, Apps Script origin, and pending event", () => {
  const frame = {};
  const base = {
    source: frame,
    origin: "https://n-abcd.script.googleusercontent.com",
    data: { type: "rongxin-booking", eventId: "lead_1", ok: true }
  };
  assert.equal(isTrustedReply(base, { iframeWindow: frame, eventId: "lead_1" }), true);
  assert.equal(isTrustedReply({ ...base, source: {} }, { iframeWindow: frame, eventId: "lead_1" }), false);
  assert.equal(isTrustedReply({ ...base, origin: "https://evil.example" }, { iframeWindow: frame, eventId: "lead_1" }), false);
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `node --test test/booking-core.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/booking-core.mjs`.

- [ ] **Step 3: Implement the pure frontend contract**

```js
// scripts/booking-core.mjs
export const TOPICS = new Set(["心態", "關係", "行動", "資源", "不確定", "其他"]);
export const GOALS = new Set(["被理解", "釐清方向", "具體行動", "溝通策略", "資源盤點", "情緒安定"]);
export const AVAILABILITY = new Set(["平日上午", "平日下午", "平日晚上", "週末上午", "週末下午", "目前先不預約"]);

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateBooking(input) {
  const errors = {};
  const name = String(input.displayName || "").trim();
  const email = normalizeEmail(input.email);
  const stuck = String(input.stuckText || "").trim();
  if (name.length < 1 || name.length > 50) errors.displayName = "請輸入 1–50 個字的稱呼。";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "請輸入可正常收信的 Email。";
  if (stuck.length < 20) errors.stuckText = "請至少輸入 20 個字，讓我們能初步理解你的狀態。";
  if (stuck.length > 1500) errors.stuckText = "內容請控制在 1500 個字以內。";
  if (!TOPICS.has(input.topic)) errors.topic = "請選擇一個主要卡點。";
  if (!Array.isArray(input.goals) || input.goals.length < 1 || input.goals.some((value) => !GOALS.has(value))) errors.goals = "請至少選擇一項希望帶走的結果。";
  if (!Array.isArray(input.availability) || input.availability.length < 1 || input.availability.some((value) => !AVAILABILITY.has(value))) errors.availability = "請至少選擇一個方便時段。";
  if (input.adultConfirmed !== true) errors.adultConfirmed = "本服務目前僅接受年滿 18 歲者。";
  if (input.taiwanConfirmed !== true) errors.taiwanConfirmed = "服務進行時需位於台灣。";
  if (input.consentConfirmed !== true) errors.consentConfirmed = "送出前請閱讀並同意個資告知與服務界線。";
  return errors;
}

export function getCookie(name, cookieString = "") {
  const prefix = `${name}=`;
  const part = String(cookieString).split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

export function buildFbc(url, now = Date.now()) {
  const fbclid = new URL(url).searchParams.get("fbclid") || "";
  return /^[A-Za-z0-9_-]{1,250}$/.test(fbclid) ? `fb.1.${Math.floor(now / 1000)}.${fbclid}` : "";
}

export function createEventId(cryptoApi = globalThis.crypto) {
  return `lead_${cryptoApi.randomUUID()}`;
}

export function isTrustedReply(event, pending) {
  let hostname = "";
  try { hostname = new URL(event.origin).hostname; } catch { return false; }
  return event.source === pending.iframeWindow
    && (hostname === "script.google.com" || hostname.endsWith(".script.googleusercontent.com"))
    && event.data?.type === "rongxin-booking"
    && event.data?.eventId === pending.eventId
    && typeof event.data?.ok === "boolean";
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `node --test test/booking-core.test.mjs`

Expected: 6 tests PASS, 0 FAIL.

- [ ] **Step 5: Commit the frontend contract**

```bash
git add scripts/booking-core.mjs test/booking-core.test.mjs
git commit -m "Add booking form validation contract"
```

### Task 2: Apps Script Validation And Safe Meta Payload

**Files:**

- Create: `apps-script/booking-intake/Code.gs`
- Create: `test/booking-apps-script.test.mjs`

- [ ] **Step 1: Write failing tests for server validation and sensitive-field exclusion**

```js
// test/booking-apps-script.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../apps-script/booking-intake/Code.gs", import.meta.url), "utf8");
const sandbox = {
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    computeDigest(_algorithm, value) { return [...createHash("sha256").update(value).digest()]; }
  }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const valid = {
  eventId: "lead_00000000-0000-4000-8000-000000000000",
  sourceUrl: "https://rongxinshenyu.com/booking.html",
  displayName: "小榮",
  email: "USER@example.com ",
  stuckText: "我在工作與家人期待之間反覆拉扯，不知道下一步怎麼選。",
  topic: "行動",
  goals: ["釐清方向"],
  availability: ["平日晚上"],
  adultConfirmed: "true",
  taiwanConfirmed: "true",
  consentConfirmed: "true",
  consentVersion: "2026-09-01",
  startedAt: "1700000000000",
  submittedAt: "1700000010000",
  website: "",
  fbp: "fb.1.10.20",
  fbc: "fb.1.1700000000.abc"
};

test("validates and normalizes the approved server payload", () => {
  const result = sandbox.validateSubmission_(valid);
  assert.equal(result.email, "user@example.com");
  assert.equal(result.topic, "行動");
});

test("rejects bots and invalid enumerations", () => {
  assert.throws(() => sandbox.validateSubmission_({ ...valid, website: "spam" }), /invalid submission/i);
  assert.throws(() => sandbox.validateSubmission_({ ...valid, topic: "診斷" }), /主要卡點/);
});

test("builds a Lead event without form answers", () => {
  const input = sandbox.validateSubmission_(valid);
  const payload = sandbox.buildMetaPayload_(input, { pixelId: "4400969670158242", testEventCode: "TEST123" }, 1700000020);
  const serialized = JSON.stringify(payload);
  assert.equal(payload.data[0].event_name, "Lead");
  assert.equal(payload.data[0].event_id, valid.eventId);
  assert.equal(payload.test_event_code, "TEST123");
  assert.equal(serialized.includes(input.stuckText), false);
  assert.equal(serialized.includes(input.topic), false);
  assert.equal(payload.data[0].user_data.em[0], createHash("sha256").update("user@example.com").digest("hex"));
});
```

- [ ] **Step 2: Run the test and verify the missing file failure**

Run: `node --test test/booking-apps-script.test.mjs`

Expected: FAIL with `ENOENT` for `apps-script/booking-intake/Code.gs`.

- [ ] **Step 3: Implement server normalization, validation, hashing, and CAPI payload shaping**

```js
// apps-script/booking-intake/Code.gs
var TOPICS_ = ["心態", "關係", "行動", "資源", "不確定", "其他"];
var GOALS_ = ["被理解", "釐清方向", "具體行動", "溝通策略", "資源盤點", "情緒安定"];
var AVAILABILITY_ = ["平日上午", "平日下午", "平日晚上", "週末上午", "週末下午", "目前先不預約"];
var SHEET_NAME_ = "官網初步盤點";
var HEADERS_ = ["建立時間", "event_id", "來源頁面", "稱呼", "Email", "目前卡點", "主要分類", "期待結果", "可聯絡／對談時段", "成人確認", "台灣確認", "同意版本", "審核狀態", "Meta CAPI 狀態", "管理備註"];

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function asArray_(value) {
  if (Array.isArray(value)) return value.map(String);
  return value == null || value === "" ? [] : [String(value)];
}

function requireChoice_(value, allowed, label) {
  if (allowed.indexOf(value) === -1) throw new Error(label + "不正確");
  return value;
}

function requireChoices_(values, allowed, label) {
  var normalized = asArray_(values);
  if (!normalized.length || normalized.some(function (value) { return allowed.indexOf(value) === -1; })) throw new Error(label + "不正確");
  return normalized;
}

function validateSubmission_(raw) {
  if (String(raw.website || "") !== "") throw new Error("Invalid submission");
  var startedAt = Number(raw.startedAt);
  var submittedAt = Number(raw.submittedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(submittedAt) || submittedAt - startedAt < 3000 || submittedAt - startedAt > 86400000) throw new Error("Invalid submission timing");
  var displayName = String(raw.displayName || "").trim();
  var email = normalizeEmail_(raw.email);
  var stuckText = String(raw.stuckText || "").trim();
  if (displayName.length < 1 || displayName.length > 50) throw new Error("稱呼長度不正確");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email 格式不正確");
  if (stuckText.length < 20 || stuckText.length > 1500) throw new Error("目前卡點長度不正確");
  if (!/^lead_[0-9a-f-]{36}$/i.test(String(raw.eventId || ""))) throw new Error("event_id 不正確");
  if (!/^https:\/\/rongxinshenyu\.com\/booking\.html(?:[?#]|$)/.test(String(raw.sourceUrl || ""))) throw new Error("來源頁面不正確");
  if (String(raw.consentVersion || "") !== "2026-09-01") throw new Error("同意版本不正確");
  if (raw.adultConfirmed !== "true" || raw.taiwanConfirmed !== "true" || raw.consentConfirmed !== "true") throw new Error("必要確認未完成");
  return {
    eventId: String(raw.eventId),
    sourceUrl: String(raw.sourceUrl || "").slice(0, 500),
    displayName: displayName,
    email: email,
    stuckText: stuckText,
    topic: requireChoice_(String(raw.topic || ""), TOPICS_, "主要卡點"),
    goals: requireChoices_(raw.goals, GOALS_, "期待結果"),
    availability: requireChoices_(raw.availability, AVAILABILITY_, "方便時段"),
    consentVersion: String(raw.consentVersion),
    fbp: /^fb\.1\.\d+\.\d+$/.test(String(raw.fbp || "")) ? String(raw.fbp) : "",
    fbc: /^fb\.1\.\d+\.[A-Za-z0-9_-]+$/.test(String(raw.fbc || "")) ? String(raw.fbc) : ""
  };
}

function sha256Hex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value).map(function (byte) {
    var unsigned = byte < 0 ? byte + 256 : byte;
    return ("0" + unsigned.toString(16)).slice(-2);
  }).join("");
}

function buildMetaPayload_(input, config, eventTime) {
  var userData = { em: [sha256Hex_(input.email)] };
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  var payload = { data: [{
    event_name: "Lead",
    event_time: eventTime,
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.sourceUrl,
    user_data: userData
  }] };
  if (config.testEventCode) payload.test_event_code = config.testEventCode;
  return payload;
}
```

- [ ] **Step 4: Run both test files**

Run: `node --test test/booking-core.test.mjs test/booking-apps-script.test.mjs`

Expected: 9 tests PASS, 0 FAIL.

- [ ] **Step 5: Commit the server contract**

```bash
git add apps-script/booking-intake/Code.gs test/booking-apps-script.test.mjs
git commit -m "Add booking intake server contract"
```

### Task 3: Apps Script Persistence, Idempotency, Notification, And Bridge

**Files:**

- Modify: `apps-script/booking-intake/Code.gs`
- Modify: `test/booking-apps-script.test.mjs`

- [ ] **Step 1: Add failing orchestration and bridge tests**

Add tests that inject a fake dependency object and assert these exact outcomes:

```js
test("stores one row, notifies once, and records CAPI success", () => {
  const calls = [];
  const deps = {
    store: (input) => { calls.push(["store", input.eventId]); return { duplicate: false, rowNumber: 2 }; },
    sendLead: () => ({ status: "sent", responseCode: 200 }),
    updateCapiStatus: (row, status) => calls.push(["status", row, status]),
    notify: (input) => calls.push(["notify", input.eventId])
  };
  const result = sandbox.processSubmission_(sandbox.validateSubmission_(valid), deps);
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(calls.filter(([name]) => name === "store").length, 1);
  assert.deepEqual(calls.at(-1), ["notify", valid.eventId]);
});

test("returns success for a duplicate without writing or sending", () => {
  let touched = false;
  const deps = {
    store: () => ({ duplicate: true, rowNumber: 2 }),
    sendLead: () => { touched = true; },
    updateCapiStatus: () => { touched = true; },
    notify: () => { touched = true; }
  };
  const result = sandbox.processSubmission_(sandbox.validateSubmission_(valid), deps);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, duplicate: true, eventId: valid.eventId });
  assert.equal(touched, false);
});

test("CAPI failure does not erase a stored lead", () => {
  const statuses = [];
  const deps = {
    store: () => ({ duplicate: false, rowNumber: 3 }),
    sendLead: () => { throw new Error("Meta unavailable"); },
    updateCapiStatus: (_row, status) => statuses.push(status),
    notify: () => undefined
  };
  const result = sandbox.processSubmission_(sandbox.validateSubmission_(valid), deps);
  assert.equal(result.ok, true);
  assert.equal(statuses[0], "failed: Meta unavailable");
});

test("bridge contains no submitted email or narrative", () => {
  const html = sandbox.renderBridge_({ ok: true, eventId: valid.eventId }, "https://rongxinshenyu.com");
  assert.match(html, /rongxin-booking/);
  assert.equal(html.includes(valid.email), false);
  assert.equal(html.includes(valid.stuckText), false);
});
```

- [ ] **Step 2: Run the Apps Script tests and verify missing-function failures**

Run: `node --test test/booking-apps-script.test.mjs`

Expected: FAIL because `processSubmission_` and `renderBridge_` are not defined.

- [ ] **Step 3: Add the orchestration boundary**

```js
function rowFor_(input, capiStatus) {
  return [new Date(), input.eventId, input.sourceUrl, input.displayName, input.email, input.stuckText, input.topic, input.goals.join("、"), input.availability.join("、"), "是", "是", input.consentVersion, "待審核", capiStatus, ""];
}

function processSubmission_(input, deps) {
  var stored = deps.store(input);
  if (stored.duplicate) return { ok: true, duplicate: true, eventId: input.eventId };
  var rowNumber = stored.rowNumber;
  var capiStatus;
  try {
    var meta = deps.sendLead(input);
    capiStatus = meta.status + ": " + meta.responseCode;
  } catch (error) {
    capiStatus = "failed: " + error.message;
  }
  try { deps.updateCapiStatus(rowNumber, capiStatus); } catch (error) { console.error("Booking status update failed", error); }
  try { deps.notify(input); } catch (error) { console.error("Booking notification failed", error); }
  return { ok: true, duplicate: false, eventId: input.eventId };
}

function renderBridge_(result, origin) {
  var safe = JSON.stringify({ type: "rongxin-booking", ok: Boolean(result.ok), eventId: String(result.eventId || ""), message: String(result.message || "") }).replace(/</g, "\\u003c");
  return "<!doctype html><meta charset=\"utf-8\"><script>window.parent.postMessage(" + safe + "," + JSON.stringify(origin) + ");<\/script>";
}
```

- [ ] **Step 4: Add Google service adapters and `doPost(e)`**

Add these adapters and `doPost(e)` to `Code.gs`:

```js
function doPost(e) {
  var config = loadConfig_();
  var eventId = String(e && e.parameter && e.parameter.eventId || "");
  try {
    var input = validateSubmission_(parseRequest_(e));
    var result = processSubmission_(input, createDependencies_(config));
    return HtmlService.createHtmlOutput(renderBridge_(result, config.allowedOrigin)).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    console.error("Booking submission failed", error);
    var failure = { ok: false, eventId: eventId, message: "目前無法送出，請稍後重試。" };
    return HtmlService.createHtmlOutput(renderBridge_(failure, config.allowedOrigin)).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

function parseRequest_(e) {
  var p = e.parameter || {};
  var ps = e.parameters || {};
  return {
    eventId: p.eventId,
    sourceUrl: p.sourceUrl,
    displayName: p.displayName,
    email: p.email,
    stuckText: p.stuckText,
    topic: p.topic,
    goals: ps.goals || [],
    availability: ps.availability || [],
    adultConfirmed: p.adultConfirmed,
    taiwanConfirmed: p.taiwanConfirmed,
    consentConfirmed: p.consentConfirmed,
    consentVersion: p.consentVersion,
    startedAt: p.startedAt,
    submittedAt: p.submittedAt,
    website: p.website,
    fbp: p.fbp,
    fbc: p.fbc
  };
}

function requiredProperty_(properties, name) {
  var value = String(properties.getProperty(name) || "").trim();
  if (!value) throw new Error("Missing Script Property: " + name);
  return value;
}

function loadConfig_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: requiredProperty_(properties, "SPREADSHEET_ID"),
    adminEmail: requiredProperty_(properties, "ADMIN_EMAIL"),
    allowedOrigin: requiredProperty_(properties, "ALLOWED_ORIGIN"),
    pixelId: requiredProperty_(properties, "META_PIXEL_ID"),
    graphVersion: requiredProperty_(properties, "META_GRAPH_VERSION"),
    capiToken: String(properties.getProperty("META_CAPI_TOKEN") || "").trim(),
    testEventCode: String(properties.getProperty("META_TEST_EVENT_CODE") || "").trim()
  };
}

function getSheet_(spreadsheetId) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = spreadsheet.getSheetByName(SHEET_NAME_);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME_);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, HEADERS_.length).setValues([HEADERS_]);
  return sheet;
}

function findEventRow_(sheet, eventId) {
  if (sheet.getLastRow() < 2) return 0;
  var match = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).createTextFinder(eventId).matchEntireCell(true).findNext();
  return match ? match.getRow() : 0;
}

function storeInput_(sheet, input) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var existing = findEventRow_(sheet, input.eventId);
    if (existing) return { duplicate: true, rowNumber: existing };
    rateLimit_(input.email);
    var rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, HEADERS_.length).setValues([rowFor_(input, "pending")]);
    return { duplicate: false, rowNumber: rowNumber };
  } finally {
    lock.releaseLock();
  }
}

function updateCapiStatus_(sheet, rowNumber, status) {
  sheet.getRange(rowNumber, 14).setValue(status);
}

function rateLimit_(email) {
  var cache = CacheService.getScriptCache();
  var key = "booking-rate-" + sha256Hex_(email);
  var count = Number(cache.get(key) || "0");
  if (count >= 5) throw new Error("Submission rate limit exceeded");
  cache.put(key, String(count + 1), 3600);
}

function sendLead_(input, config) {
  if (!config.capiToken) return { status: "not_configured", responseCode: 0 };
  var url = "https://graph.facebook.com/" + encodeURIComponent(config.graphVersion) + "/" + encodeURIComponent(config.pixelId) + "/events";
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + config.capiToken },
    payload: JSON.stringify(buildMetaPayload_(input, config, Math.floor(Date.now() / 1000))),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error("Meta CAPI HTTP " + code);
  var body;
  try { body = JSON.parse(response.getContentText() || "{}"); } catch (error) { throw new Error("Meta CAPI invalid response"); }
  if (Number(body.events_received) !== 1) throw new Error("Meta CAPI did not accept event");
  return { status: "sent", responseCode: code };
}

function notify_(input, config) {
  var spreadsheetUrl = "https://docs.google.com/spreadsheets/d/" + config.spreadsheetId + "/edit";
  MailApp.sendEmail({
    to: config.adminEmail,
    subject: "榮心紳語｜新的官網初步盤點",
    body: [
      "建立時間：" + new Date().toISOString(),
      "稱呼：" + input.displayName,
      "Email：" + input.email,
      "event_id：" + input.eventId,
      "試算表：" + spreadsheetUrl
    ].join("\n")
  });
}

function createDependencies_(config) {
  var sheet = getSheet_(config.spreadsheetId);
  return {
    store: function (input) { return storeInput_(sheet, input); },
    sendLead: function (input) { return sendLead_(input, config); },
    updateCapiStatus: function (row, status) { updateCapiStatus_(sheet, row, status); },
    notify: function (input) { notify_(input, config); }
  };
}
```

The `sendLead_` adapter posts only `buildMetaPayload_` output. It never passes `stuckText`, `topic`, `goals`, or `availability` to Meta.

- [ ] **Step 5: Run the Apps Script tests**

Run: `node --test test/booking-apps-script.test.mjs`

Expected: 7 tests PASS, 0 FAIL.

- [ ] **Step 6: Commit the Apps Script behavior**

```bash
git add apps-script/booking-intake/Code.gs test/booking-apps-script.test.mjs
git commit -m "Implement booking intake Apps Script flow"
```

### Task 4: Apps Script Manifest, Deployment Guide, And Test Deployment

**Files:**

- Create: `apps-script/booking-intake/appsscript.json`
- Create: `apps-script/booking-intake/README.md`

- [ ] **Step 1: Add the explicit Apps Script manifest**

```json
{
  "timeZone": "Asia/Taipei",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/script.storage"
  ]
}
```

- [ ] **Step 2: Document the exact Script Properties and deployment settings**

Create `apps-script/booking-intake/README.md` with this exact content:

```markdown
# 官網第一階段盤點 Apps Script

這個 spreadsheet-bound Apps Script 接收 `https://rongxinshenyu.com/booking.html` 的表單，寫入同一份試算表的「官網初步盤點」，寄出管理通知，並將不含敘述答案的 `Lead` 傳往 Meta CAPI。

## Script Properties

在 Apps Script「專案設定 → 指令碼屬性」建立：

- `SPREADSHEET_ID`：從既有回覆試算表網址 `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit` 複製中間那段實際 ID；不要把實際 ID 寫入 Git。
- `ALLOWED_ORIGIN`：`https://rongxinshenyu.com`
- `ADMIN_EMAIL`：`anchen918@gmail.com`
- `META_PIXEL_ID`：`4400969670158242`
- `META_GRAPH_VERSION`：`v22.0`
- `META_CAPI_TOKEN`：由帳號擁有者從 Meta Events Manager 產生後，直接貼在 Script Properties；不得貼進聊天、終端、Git 或試算表。
- `META_TEST_EVENT_CODE`：僅在 Meta「測試事件」驗收期間暫時設定，驗收後刪除。

## 部署

1. 從既有回覆試算表開啟「擴充功能 → Apps Script」。
2. 將 repo 的 `Code.gs` 與 `appsscript.json` 複製進專案並儲存。
3. 建立新版本，選「部署 → 新增部署 → 網頁應用程式」。
4. 執行身分選部署者，存取權選「任何人」。
5. 完成 Google 授權，記錄正式 `/exec` URL；網站不得使用 `/dev` URL。
6. 每次改碼都建立新版本，再編輯既有部署指向新版本，避免公開 URL 改變。

## 驗證

1. 先設定 `META_TEST_EVENT_CODE`。
2. 用稱呼 `測試－官網Lead驗收` 送出一筆非敏感測試資料。
3. 確認「官網初步盤點」只有一列、通知信沒有卡點敘述、CAPI 狀態為 `sent: 200`。
4. 在 Meta 測試事件確認 browser/server `Lead` 的 `event_id` 相同且已去重。
5. 刪除該測試列與 `META_TEST_EVENT_CODE`，保留正式 deployment 與 `META_CAPI_TOKEN`。

## 回復

- Apps Script 暫時失效時，先使用 booking page 顯示的完整 Google 表單備援；原 Google 表單與回覆表不得刪除。
- 要取消網站切換時，只 revert booking release commit 並重新部署 GitHub Pages。
- Apps Script 需要回復時，把既有 deployment 改回前一個已驗證版本。
- 不得自行重新啟用舊 Pixel `853091474317806` 的觸發器；若要恢復舊追蹤，必須另做追蹤決策與驗證。
```

- [ ] **Step 3: Verify documentation contains no token value**

Run: `rg -n "META_CAPI_TOKEN=.+|access_token=[A-Za-z0-9]" apps-script/booking-intake`

Expected: no output.

- [ ] **Step 4: Commit the deployment package**

```bash
git add apps-script/booking-intake/appsscript.json apps-script/booking-intake/README.md
git commit -m "Document booking intake deployment"
```

- [ ] **Step 5: User checkpoint — create the spreadsheet-bound script and deploy it**

Open the existing response spreadsheet, create or open its Apps Script project, replace `Code.gs`, enable the manifest file, set all non-secret Script Properties, and deploy a versioned web app. The user completes Google authorization. Record only the public `/exec` URL in the terminal variable `BOOKING_WEB_APP_URL`; do not print or store the CAPI token.

Run after copying the public URL:

```bash
case "$BOOKING_WEB_APP_URL" in
  https://script.google.com/macros/s/*/exec) echo "Apps Script URL accepted" ;;
  *) echo "Invalid Apps Script deployment URL"; exit 1 ;;
esac
```

Expected: `Apps Script URL accepted`.

### Task 5: Endpoint Configuration Generator

**Files:**

- Create: `scripts/configure-booking-endpoint.mjs`
- Create: `test/configure-booking-endpoint.test.mjs`
- Create: `scripts/booking-config.mjs` through the generator

- [ ] **Step 1: Write a failing generator test**

```js
// test/configure-booking-endpoint.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeBookingConfig } from "../scripts/configure-booking-endpoint.mjs";

test("writes an importable config only for a deployed Apps Script exec URL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "booking-config-"));
  const path = join(dir, "booking-config.mjs");
  const endpoint = "https://script.google.com/macros/s/ABC123/exec";
  await writeBookingConfig(endpoint, path);
  assert.equal(await readFile(path, "utf8"), `export const BOOKING_ENDPOINT = ${JSON.stringify(endpoint)};\n`);
  await assert.rejects(() => writeBookingConfig("https://example.com/exec", path), /Invalid Apps Script/);
});
```

- [ ] **Step 2: Run the generator test and verify it fails**

Run: `node --test test/configure-booking-endpoint.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the generator**

```js
// scripts/configure-booking-endpoint.mjs
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function writeBookingConfig(endpoint, outputPath = fileURLToPath(new URL("./booking-config.mjs", import.meta.url))) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) throw new Error("Invalid Apps Script deployment URL");
  await writeFile(outputPath, `export const BOOKING_ENDPOINT = ${JSON.stringify(endpoint)};\n`, "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeBookingConfig(process.argv[2] || "");
}
```

- [ ] **Step 4: Generate the concrete public endpoint module**

Run: `node scripts/configure-booking-endpoint.mjs "$BOOKING_WEB_APP_URL"`

Expected: `scripts/booking-config.mjs` contains one exported HTTPS `/exec` URL and no token.

- [ ] **Step 5: Run and commit the generator test and generated config**

Run: `node --test test/configure-booking-endpoint.test.mjs`

Expected: 1 test PASS, 0 FAIL.

```bash
git add scripts/configure-booking-endpoint.mjs scripts/booking-config.mjs test/configure-booking-endpoint.test.mjs
git commit -m "Configure booking form endpoint"
```

### Task 6: Owned Booking Page And Submission Controller

**Files:**

- Create: `booking.html`
- Create: `scripts/booking-page.mjs`
- Create: `test/booking-site.test.mjs`

- [ ] **Step 1: Write failing static checks for the approved fields and safety gate**

```js
// test/booking-site.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("booking page exposes only approved first-stage fields", async () => {
  const html = await read("booking.html");
  for (const name of ["displayName", "email", "stuckText", "topic", "goals", "availability", "adultConfirmed", "taiwanConfirmed", "consentConfirmed"]) assert.match(html, new RegExp(`name=["']${name}["']`));
  for (const rejected of ["emergencyContact", "recordingConsent", "phone", "city"]) assert.doesNotMatch(html, new RegExp(`name=["']${rejected}["']`));
  assert.match(html, /id="safety-gate"/);
  assert.match(html, /119/);
  assert.match(html, /110/);
  assert.match(html, /1925/);
  assert.match(html, /target="booking-response"/);
});
```

- [ ] **Step 2: Run the static test and verify the missing page failure**

Run: `node --test test/booking-site.test.mjs`

Expected: FAIL with `ENOENT` for `booking.html`.

- [ ] **Step 3: Create `booking.html` with the existing site header, Pixel `4400969670158242`, and exact form contract**

Create `booking.html` by joining the following exact document prefix, main contract, and suffix. This retains the existing fonts, favicon, Pixel, site header, and footer without the homepage FAQ JSON-LD.

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>人生除錯前置盤點｜榮心紳語</title>
    <meta name="description" content="用 3–5 分鐘整理目前卡住的地方，由榮心紳語人工確認是否適合安排一對一人生除錯對談。" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://rongxinshenyu.com/booking.html" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="zh_TW" />
    <meta property="og:title" content="人生除錯前置盤點｜榮心紳語" />
    <meta property="og:description" content="用 3–5 分鐘整理目前卡住的地方，由榮心紳語人工確認是否適合安排一對一人生除錯對談。" />
    <meta property="og:url" content="https://rongxinshenyu.com/booking.html" />
    <meta property="og:image" content="https://rongxinshenyu.com/assets/og-home.jpg" />
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="styles.css" />
    <!-- Meta Pixel Code -->
    <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '4400969670158242');
    fbq('track', 'PageView');
    </script>
    <noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=4400969670158242&ev=PageView&noscript=1" /></noscript>
    <!-- End Meta Pixel Code -->
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/" aria-label="榮心紳語首頁">
        <img class="brand-mark" src="assets/logo-mark.svg" alt="" />
        <span><strong>榮心紳語</strong><small>Inner Dialogue Studio</small></span>
      </a>
      <nav class="nav" aria-label="主要導覽">
        <a href="/#services">服務</a><a href="/#audience">適合對象</a><a href="/#forms">盤點</a><a href="/#boundaries">界線</a><a href="/#privacy">個資</a><a href="/#terms">預約須知</a><a href="/#articles">文章</a><a href="/#faq">FAQ</a>
      </nav>
      <a class="nav-cta" href="/booking.html" aria-current="page">人生除錯盤點</a>
    </header>
```

Use this exact main contract:

```html
<main id="top" class="booking-page">
  <section class="booking-intro section-heading">
    <p class="section-kicker">First Check-in</p>
    <h1>先把現在卡住的地方，放到桌面上。</h1>
    <p>這份第一階段盤點約 3–5 分鐘。送出後會由榮心紳語人工確認是否適合安排服務。</p>
  </section>
  <section id="safety-gate" class="intake-card" aria-labelledby="safety-title">
    <h2 id="safety-title">先確認現在是否需要立即協助</h2>
    <p>你目前是否有立即自傷、他傷風險或急性精神危機？</p>
    <div class="choice-grid">
      <button type="button" data-safety="clear">目前沒有立即危險</button>
      <button type="button" data-safety="urgent">目前有立即危險或不確定</button>
    </div>
  </section>
  <section id="crisis-resources" class="crisis-panel" hidden aria-live="polite">
    <h2>現在先不要填表單，請優先取得即時協助。</h2>
    <p>如有立即危險，請撥打 119 或 110，或直接前往就近急診；需要即時情緒支持時，可撥打 1925 安心專線。</p>
    <a class="button secondary" href="/">返回首頁</a>
  </section>
  <form id="booking-form" class="intake-form" method="post" target="booking-response" hidden novalidate>
    <input type="hidden" name="eventId">
    <input type="hidden" name="sourceUrl">
    <input type="hidden" name="consentVersion" value="2026-09-01">
    <input type="hidden" name="startedAt">
    <input type="hidden" name="submittedAt">
    <input type="hidden" name="fbp">
    <input type="hidden" name="fbc">
    <div class="honeypot" aria-hidden="true"><label>網站<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <fieldset><legend>目前狀態</legend>
      <label>姓名或希望被稱呼的名字<input name="displayName" maxlength="50" autocomplete="name" aria-describedby="displayName-error" required></label><p id="displayName-error" class="field-error"></p>
      <label>正式聯絡 Email<input name="email" type="email" autocomplete="email" aria-describedby="email-error" required></label><p id="email-error" class="field-error"></p>
      <label>目前最卡住的事情<textarea name="stuckText" minlength="20" maxlength="1500" rows="7" aria-describedby="stuckText-error" required></textarea></label><p id="stuckText-error" class="field-error"></p>
      <fieldset aria-describedby="topic-error"><legend>主要卡點</legend><div class="choice-grid">
        <label><input type="radio" name="topic" value="心態">心態</label>
        <label><input type="radio" name="topic" value="關係">關係</label>
        <label><input type="radio" name="topic" value="行動">行動</label>
        <label><input type="radio" name="topic" value="資源">資源</label>
        <label><input type="radio" name="topic" value="不確定">不確定</label>
        <label><input type="radio" name="topic" value="其他">其他</label>
      </div></fieldset><p id="topic-error" class="field-error"></p>
      <fieldset aria-describedby="goals-error"><legend>希望對談後帶走什麼</legend><div class="choice-grid">
        <label><input type="checkbox" name="goals" value="被理解">被理解</label>
        <label><input type="checkbox" name="goals" value="釐清方向">釐清方向</label>
        <label><input type="checkbox" name="goals" value="具體行動">具體行動</label>
        <label><input type="checkbox" name="goals" value="溝通策略">溝通策略</label>
        <label><input type="checkbox" name="goals" value="資源盤點">資源盤點</label>
        <label><input type="checkbox" name="goals" value="情緒安定">情緒安定</label>
      </div></fieldset><p id="goals-error" class="field-error"></p>
      <fieldset aria-describedby="availability-error"><legend>方便聯絡或對談的時段</legend><div class="choice-grid">
        <label><input type="checkbox" name="availability" value="平日上午">平日上午</label>
        <label><input type="checkbox" name="availability" value="平日下午">平日下午</label>
        <label><input type="checkbox" name="availability" value="平日晚上">平日晚上</label>
        <label><input type="checkbox" name="availability" value="週末上午">週末上午</label>
        <label><input type="checkbox" name="availability" value="週末下午">週末下午</label>
        <label><input type="checkbox" name="availability" value="目前先不預約">目前先不預約</label>
      </div></fieldset><p id="availability-error" class="field-error"></p>
    </fieldset>
    <fieldset><legend>聯絡與同意</legend>
      <label class="check-row"><input type="checkbox" name="adultConfirmed" value="true" aria-describedby="adultConfirmed-error">我確認已年滿 18 歲</label><p id="adultConfirmed-error" class="field-error"></p>
      <label class="check-row"><input type="checkbox" name="taiwanConfirmed" value="true" aria-describedby="taiwanConfirmed-error">我確認服務進行時位於台灣</label><p id="taiwanConfirmed-error" class="field-error"></p>
      <label class="check-row"><input type="checkbox" name="consentConfirmed" value="true" aria-describedby="consentConfirmed-error">我已閱讀並同意<a href="/#privacy" target="_blank">個資告知</a>與<a href="/#boundaries" target="_blank">服務界線</a></label><p id="consentConfirmed-error" class="field-error"></p>
    </fieldset>
    <div id="submit-status" class="submit-status" aria-live="polite"></div>
    <button id="submit-booking" class="button primary" type="submit">送出第一階段盤點</button>
    <a id="booking-fallback" class="fallback-link" href="https://docs.google.com/forms/d/e/1FAIpQLScDKOIf3FDNYADlFw9NmwU3QrhE8OCjTOAWDUGwEU3OKyBEKg/viewform" hidden>改填完整 Google 表單</a>
  </form>
  <iframe name="booking-response" title="表單送出結果" hidden></iframe>
</main>
<script type="module" src="scripts/booking-page.mjs"></script>
```

Append this exact document suffix:

```html
    <footer class="footer">
      <div><strong>榮心紳語</strong><p>溫柔而清明的對談，陪你練習把心放回自己身上。</p></div>
      <div class="footer-links">
        <a href="mailto:anchen918@gmail.com" onclick="if(window.fbq){fbq('track','Contact');}">anchen918@gmail.com</a>
        <a href="/booking.html">人生除錯盤點</a>
      </div>
    </footer>
  </body>
</html>
```

- [ ] **Step 4: Implement the page controller**

Create the controller with this exact state machine:

```js
// scripts/booking-page.mjs
import { BOOKING_ENDPOINT } from "./booking-config.mjs";
import { buildFbc, createEventId, getCookie, isTrustedReply, normalizeEmail, validateBooking } from "./booking-core.mjs";

const form = document.querySelector("#booking-form");
const frame = document.querySelector('iframe[name="booking-response"]');
const submit = document.querySelector("#submit-booking");
const status = document.querySelector("#submit-status");
const fallback = document.querySelector("#booking-fallback");
const crisis = document.querySelector("#crisis-resources");
let eventId = "";
let pending = null;
let timeoutId = 0;

form.action = BOOKING_ENDPOINT;

for (const button of document.querySelectorAll("[data-safety]")) {
  button.addEventListener("click", () => {
    const clear = button.dataset.safety === "clear";
    form.hidden = !clear;
    crisis.hidden = clear;
    if (clear) form.elements.startedAt.value = String(Date.now());
  });
}

function checked(name) {
  return [...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value);
}

function currentInput() {
  return {
    displayName: form.elements.displayName.value,
    email: normalizeEmail(form.elements.email.value),
    stuckText: form.elements.stuckText.value,
    topic: form.elements.topic.value,
    goals: checked("goals"),
    availability: checked("availability"),
    adultConfirmed: form.elements.adultConfirmed.checked,
    taiwanConfirmed: form.elements.taiwanConfirmed.checked,
    consentConfirmed: form.elements.consentConfirmed.checked
  };
}

function showErrors(errors) {
  for (const node of form.querySelectorAll(".field-error")) node.textContent = "";
  for (const [name, message] of Object.entries(errors)) document.querySelector(`#${name}-error`).textContent = message;
  const first = Object.keys(errors)[0];
  if (first) form.elements[first]?.focus();
}

function unlock(message) {
  clearTimeout(timeoutId);
  pending = null;
  submit.disabled = false;
  submit.textContent = "重新送出第一階段盤點";
  status.textContent = message;
  fallback.hidden = false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = currentInput();
  const errors = validateBooking(input);
  showErrors(errors);
  if (Object.keys(errors).length) return;
  if (!eventId) eventId = createEventId();
  form.elements.eventId.value = eventId;
  form.elements.sourceUrl.value = window.location.href;
  form.elements.submittedAt.value = String(Date.now());
  form.elements.fbp.value = getCookie("_fbp", document.cookie);
  form.elements.fbc.value = getCookie("_fbc", document.cookie) || buildFbc(window.location.href);
  submit.disabled = true;
  submit.textContent = "送出中…";
  status.textContent = "正在安全送出，請不要關閉頁面。";
  fallback.hidden = true;
  pending = { iframeWindow: frame.contentWindow, eventId };
  timeoutId = window.setTimeout(() => unlock("連線逾時，內容仍保留在畫面中，請重試或使用備援表單。"), 15000);
  HTMLFormElement.prototype.submit.call(form);
});

window.addEventListener("message", (event) => {
  if (!pending || !isTrustedReply(event, pending)) return;
  clearTimeout(timeoutId);
  if (!event.data.ok) {
    unlock(event.data.message || "目前無法送出，請稍後重試。");
    return;
  }
  window.sessionStorage.setItem(`rongxin:lead:${eventId}`, "confirmed");
  window.location.assign(`/thank-you.html?event_id=${encodeURIComponent(eventId)}`);
});
```

- [ ] **Step 5: Run the core and page tests**

Run: `node --test test/booking-core.test.mjs test/booking-site.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit the owned booking page**

```bash
git add booking.html scripts/booking-page.mjs test/booking-site.test.mjs
git commit -m "Add owned first-stage booking page"
```

### Task 7: One-Shot Thank-You Pixel Event

**Files:**

- Create: `thank-you.html`
- Create: `scripts/thank-you-page.mjs`
- Modify: `test/booking-core.test.mjs`
- Modify: `test/booking-site.test.mjs`

- [ ] **Step 1: Add failing tests for the one-shot marker**

Add `consumeLeadMarker` to the import list in `test/booking-core.test.mjs`, then append:

```js
test("consumes a confirmed lead marker exactly once", () => {
  const values = new Map([["rongxin:lead:lead_1", "confirmed"]]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => values.delete(key)
  };
  assert.equal(consumeLeadMarker(storage, "lead_1"), true);
  assert.equal(values.has("rongxin:lead:lead_1"), false);
  assert.equal(consumeLeadMarker(storage, "lead_1"), false);
});
```

Append this exact test to `test/booking-site.test.mjs`:

```js
test("thank-you page is noindex and owns the one-shot Lead module", async () => {
  const html = await read("thank-you.html");
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\s*\/>/);
  assert.match(html, /4400969670158242/);
  assert.match(html, /<script type="module" src="scripts\/thank-you-page\.mjs"><\/script>/);
});
```

- [ ] **Step 2: Run tests and verify the missing export/page failures**

Run: `node --test test/booking-core.test.mjs test/booking-site.test.mjs`

Expected: FAIL for missing `consumeLeadMarker` and `thank-you.html`.

- [ ] **Step 3: Implement and use the one-shot marker**

```js
// append to scripts/booking-core.mjs
export function consumeLeadMarker(storage, eventId) {
  if (!eventId || storage.getItem(`rongxin:lead:${eventId}`) !== "confirmed") return false;
  storage.removeItem(`rongxin:lead:${eventId}`);
  return true;
}
```

```js
// scripts/thank-you-page.mjs
import { consumeLeadMarker } from "./booking-core.mjs";

const eventId = new URLSearchParams(window.location.search).get("event_id") || "";
if (consumeLeadMarker(window.sessionStorage, eventId) && typeof window.fbq === "function") {
  window.fbq("track", "Lead", {}, { eventID: eventId });
}
window.history.replaceState({}, "", "/thank-you.html");
```

Create `thank-you.html` with this exact complete document:

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>已收到第一階段盤點｜榮心紳語</title>
    <meta name="description" content="榮心紳語已收到你的第一階段盤點，將由人工閱讀後以 Email 回覆下一步。" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="canonical" href="https://rongxinshenyu.com/thank-you.html" />
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="styles.css" />
    <!-- Meta Pixel Code -->
    <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '4400969670158242');
    fbq('track', 'PageView');
    </script>
    <noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=4400969670158242&ev=PageView&noscript=1" /></noscript>
    <!-- End Meta Pixel Code -->
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/" aria-label="榮心紳語首頁">
        <img class="brand-mark" src="assets/logo-mark.svg" alt="" />
        <span><strong>榮心紳語</strong><small>Inner Dialogue Studio</small></span>
      </a>
      <nav class="nav" aria-label="主要導覽"><a href="/#services">服務</a><a href="/#boundaries">界線</a><a href="/#privacy">個資</a><a href="/#faq">FAQ</a></nav>
      <a class="nav-cta" href="/booking.html">人生除錯盤點</a>
    </header>
    <main id="top" class="thank-you-page">
      <section class="thank-you-panel" aria-labelledby="thank-you-title">
        <p class="section-kicker">Received</p>
        <h1 id="thank-you-title">我們已收到你的第一階段盤點。</h1>
        <p>這份內容會由榮心紳語人工閱讀，再透過你留下的 Email 回覆是否適合安排服務與下一步。</p>
        <p>如果你現在出現立即自傷、他傷風險或急性精神危機，請不要等待回信；請撥打 119、110、1925，或直接前往就近急診。</p>
        <a class="button primary" href="/">返回榮心紳語首頁</a>
      </section>
    </main>
    <footer class="footer">
      <div><strong>榮心紳語</strong><p>溫柔而清明的對談，陪你練習把心放回自己身上。</p></div>
      <div class="footer-links"><a href="mailto:anchen918@gmail.com" onclick="if(window.fbq){fbq('track','Contact');}">anchen918@gmail.com</a><a href="/">返回首頁</a></div>
    </footer>
    <script type="module" src="scripts/thank-you-page.mjs"></script>
  </body>
</html>
```

Do not include the second-stage Google Form, price, payment, booking calendar, or advertising CTA on this page.

- [ ] **Step 4: Run tests and commit**

Run: `node --test test/booking-core.test.mjs test/booking-site.test.mjs`

Expected: all tests PASS.

```bash
git add scripts/booking-core.mjs scripts/thank-you-page.mjs booking.html thank-you.html test/booking-core.test.mjs test/booking-site.test.mjs
git commit -m "Track confirmed booking leads once"
```

### Task 8: Accessible Responsive Styling

**Files:**

- Modify: `styles.css`
- Modify: `booking.html`
- Modify: `thank-you.html`

- [ ] **Step 1: Add a failing static accessibility assertion**

Append this exact test to `test/booking-site.test.mjs`:

```js
test("booking and thank-you pages expose accessible structure", async () => {
  const booking = await read("booking.html");
  const thankYou = await read("thank-you.html");
  const styles = await read("styles.css");
  const labelled = [
    "displayName", "email", "stuckText", "topic", "goals",
    "availability", "adultConfirmed", "taiwanConfirmed", "consentConfirmed"
  ];
  for (const name of labelled) {
    assert.match(booking, new RegExp(`(?:<label[^>]*>[\\s\\S]*?name="${name}"|<fieldset[^>]*aria-describedby="${name}-error")`));
    assert.match(booking, new RegExp(`id="${name}-error" class="field-error"`));
    assert.match(booking, new RegExp(`aria-describedby="${name}-error"`));
  }
  assert.match(booking, /id="submit-status"[^>]*aria-live="polite"/);
  assert.equal([...booking.matchAll(/<h1(?:\s|>)/g)].length, 1);
  assert.equal([...thankYou.matchAll(/<h1(?:\s|>)/g)].length, 1);
  for (const selector of [".choice-grid", ".field-error", ".crisis-panel", ":focus-visible", "@media (max-width: 540px)"]) {
    assert.ok(styles.includes(selector), `styles.css must include ${selector}`);
  }
});
```

- [ ] **Step 2: Run the static test and verify it fails before attributes/styles are complete**

Run: `node --test test/booking-site.test.mjs`

Expected: FAIL because the booking-specific accessible/focus styles do not exist yet.

- [ ] **Step 3: Add focused form styles using existing tokens**

Append these focused rules, then adjust only numeric spacing values if the browser inspection proves a concrete overflow:

```css
.booking-page,
.thank-you-page {
  min-height: 70vh;
  padding: 72px clamp(18px, 5vw, 70px);
  background: var(--paper);
}

.booking-intro,
.intake-card,
.intake-form,
.crisis-panel,
.thank-you-panel {
  width: min(100%, 760px);
  margin-inline: auto;
}

.intake-card,
.intake-form,
.crisis-panel,
.thank-you-panel {
  margin-top: 28px;
  padding: clamp(24px, 5vw, 44px);
  background: var(--cream);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(23, 62, 53, 0.08);
}

.intake-form,
.intake-form fieldset {
  display: grid;
  gap: 18px;
}

.intake-form fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.intake-form > fieldset + fieldset {
  margin-top: 18px;
  padding-top: 28px;
  border-top: 1px solid var(--line);
}

.intake-form legend {
  margin-bottom: 10px;
  font-family: "Noto Serif TC", serif;
  font-size: 24px;
  font-weight: 700;
}

.intake-form label {
  display: grid;
  gap: 8px;
  font-weight: 700;
}

.intake-form input[type="text"],
.intake-form input[type="email"],
.intake-form input:not([type]),
.intake-form textarea {
  width: 100%;
  padding: 13px 14px;
  color: var(--ink);
  background: #fffdf8;
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
}

.intake-form textarea {
  resize: vertical;
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.choice-grid label,
.check-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: #fffdf8;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-weight: 500;
}

.choice-grid input,
.check-row input {
  flex: 0 0 auto;
  margin-top: 4px;
}

.field-error {
  min-height: 1.4em;
  margin: -10px 0 0;
  color: #8b1e1e;
  font-size: 14px;
}

.submit-status {
  min-height: 1.5em;
  color: var(--muted);
}

.fallback-link {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 4px;
}

.crisis-panel {
  border-color: #8b1e1e;
}

.honeypot {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.intake-form :focus-visible,
.intake-card button:focus-visible,
.thank-you-panel a:focus-visible {
  outline: 3px solid var(--gold);
  outline-offset: 3px;
}

#submit-booking:disabled {
  cursor: wait;
  opacity: 0.72;
}

@media (max-width: 540px) {
  .booking-page,
  .thank-you-page {
    padding: 44px 18px;
  }

  .choice-grid {
    grid-template-columns: 1fr;
  }

  #submit-booking,
  .fallback-link,
  .thank-you-panel .button {
    width: 100%;
    text-align: center;
  }
}
```

- [ ] **Step 4: Run the static test and a local browser inspection**

Run: `node --test test/booking-site.test.mjs`

Expected: PASS.

Run: `python3 -m http.server 8080`

Inspect `http://127.0.0.1:8080/booking.html` and `/thank-you.html` at approximately 390×844 and 1440×900. Verify no horizontal scroll, all controls are reachable by keyboard, the crisis state hides the form, and the form state displays without contacting the live endpoint during inspection.

- [ ] **Step 5: Commit the visual layer**

```bash
git add styles.css booking.html thank-you.html test/booking-site.test.mjs
git commit -m "Style booking and thank-you pages"
```

### Task 9: Site-Wide Cutover And Privacy Copy

**Files:**

- Modify: `index.html:112-128,220-239,276-286,322-350,475-483`
- Modify: `articles/career-transition.html`
- Modify: `articles/workplace-confusion.html`
- Modify: `sitemap.xml`
- Modify: `README.md`
- Modify: `test/booking-site.test.mjs`

- [ ] **Step 1: Add failing integration assertions**

Append these exact tests to `test/booking-site.test.mjs`:

```js
test("all public intake CTAs route through the owned booking page", async () => {
  const home = await read("index.html");
  const career = await read("articles/career-transition.html");
  const workplace = await read("articles/workplace-confusion.html");
  assert.equal([...home.matchAll(/href="\/booking\.html"/g)].length, 5);
  assert.equal([...career.matchAll(/href="\.\.\/booking\.html"/g)].length, 2);
  assert.equal([...workplace.matchAll(/href="\.\.\/booking\.html"/g)].length, 2);
  for (const html of [home, career, workplace]) {
    assert.doesNotMatch(html, /docs\.google\.com\/forms/);
    assert.doesNotMatch(html, /fbq\('track','Schedule'\)/);
  }
  const booking = await read("booking.html");
  assert.equal([...booking.matchAll(/docs\.google\.com\/forms/g)].length, 1);
});

test("sitemap publishes booking but not thank-you", async () => {
  const sitemap = await read("sitemap.xml");
  assert.match(sitemap, /https:\/\/rongxinshenyu\.com\/booking\.html/);
  assert.doesNotMatch(sitemap, /thank-you\.html/);
});

test("all tracked public pages use only the current Pixel", async () => {
  for (const path of ["index.html", "booking.html", "thank-you.html", "articles/career-transition.html", "articles/workplace-confusion.html"]) {
    const html = await read(path);
    const pixelIds = [...html.matchAll(/(?:fbq\('init', '|tr\?id=)(\d{10,})/g)].map((match) => match[1]);
    assert.ok(pixelIds.length >= 2, `${path} must contain script and noscript Pixel IDs`);
    assert.deepEqual([...new Set(pixelIds)], ["4400969670158242"]);
  }
});
```

- [ ] **Step 2: Run the integration test and verify current links fail**

Run: `node --test test/booking-site.test.mjs`

Expected: FAIL because homepage/article CTAs still point to `#booking` or the external Google Form and the sitemap lacks the booking page.

- [ ] **Step 3: Replace the public intake routes**

Apply this exact replacement map:

```text
index.html href="#booking" (all 3 occurrences) -> href="/booking.html"
index.html href="https://docs.google.com/forms/d/e/1FAIpQLScDKOIf3FDNYADlFw9NmwU3QrhE8OCjTOAWDUGwEU3OKyBEKg/viewform" (both occurrences) -> href="/booking.html"
index.html remove target="_blank", rel="noreferrer", and onclick="if(window.fbq){fbq('track','Schedule');}" from those two anchors
articles/career-transition.html href="../#booking" (both occurrences) -> href="../booking.html"
articles/workplace-confusion.html href="../#booking" (both occurrences) -> href="../booking.html"
```

Keep the external Google Form URL only as the hidden failure fallback inside `booking.html`.

- [ ] **Step 4: Update privacy wording**

Replace the existing「網站流量分析」paragraph with this exact disclosure while keeping the existing retention, contact, rights, and service-boundary language:

```html
<p>本網站使用 Meta Pixel 與 Conversions API 進行流量及轉換成效分析。使用者成功送出第一階段盤點時，Meta 只會收到事件名稱與時間、來源網址、可用的瀏覽器識別資料，以及經單向雜湊處理的 Email；不會收到你填寫的卡點敘述、主要分類、期待結果、方便時段或安全分流內容。第一階段回答會儲存在 Google 試算表供榮心紳語進行人工評估。若你使用瀏覽器追蹤保護或廣告攔截工具，可能阻擋瀏覽器端統計，但不影響表單送出。</p>
```

- [ ] **Step 5: Update sitemap and README**

Insert this exact entry immediately after the homepage entry in `sitemap.xml`:

```xml
  <url>
    <loc>https://rongxinshenyu.com/booking.html</loc>
    <lastmod>2026-09-01</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
```

Append this exact section to the root `README.md`:

````markdown
## Booking Flow

- Stage 1: `https://rongxinshenyu.com/booking.html` collects the approved short intake, writes「官網初步盤點」through `apps-script/booking-intake/Code.gs`, sends the owner a minimal Email, and reports deduplicated browser/server Meta `Lead` events.
- Stage 2: after manual review, the existing full Google Form collects phone, city, emergency contact, and recording consent. The same form is the Stage 1 failure fallback and is not removed.
- Public Apps Script endpoint: generated in `scripts/booking-config.mjs`; CAPI token and spreadsheet ID remain only in Apps Script Properties.

### Booking Verification

```bash
node --test test/booking-core.test.mjs test/configure-booking-endpoint.test.mjs test/booking-apps-script.test.mjs test/booking-site.test.mjs
npm --prefix social-publisher test
npm --prefix social-publisher run check
git diff --check
```
````

Run all four commands exactly as documented:

```bash
node --test test/booking-core.test.mjs test/configure-booking-endpoint.test.mjs test/booking-apps-script.test.mjs test/booking-site.test.mjs
npm --prefix social-publisher test
npm --prefix social-publisher run check
git diff --check
```

- [ ] **Step 6: Run integration tests and commit**

Run: `node --test test/booking-site.test.mjs`

Expected: all site integration tests PASS.

```bash
git add index.html articles/career-transition.html articles/workplace-confusion.html sitemap.xml README.md test/booking-site.test.mjs
git commit -m "Route booking traffic through owned intake"
```

### Task 10: Full Local Verification And Secret Audit

**Files:**

- Test only; modify files only when a failing check identifies a defect.

- [ ] **Step 1: Run all booking tests**

Run: `node --test test/booking-core.test.mjs test/configure-booking-endpoint.test.mjs test/booking-apps-script.test.mjs test/booking-site.test.mjs`

Expected: all tests PASS, 0 FAIL.

- [ ] **Step 2: Re-run the unrelated publisher suite to catch regressions**

Run: `npm --prefix social-publisher test`

Expected: the existing suite passes with no new failures.

Run: `npm --prefix social-publisher run check`

Expected: configuration check succeeds using the existing local environment; do not print secret values.

- [ ] **Step 3: Audit public files and git diff**

Run: `rg -n "853091474317806|META_CAPI_TOKEN=.+|access_token=[A-Za-z0-9]" --glob '*.html' --glob '*.js' --glob '*.mjs' --glob '*.gs' --glob '*.json' --glob '*.xml' --glob '!social-publisher/data/**' .`

Expected: no old Pixel in public/runtime files and no token value anywhere tracked.

Run: `git diff --check && git status --short`

Expected: no whitespace errors. Compare the status with the execution-start snapshot: task files are the only new differences, while every pre-existing unrelated modification remains unstaged and unchanged.

- [ ] **Step 4: Commit any verification fixes as one focused commit**

```bash
git add booking.html thank-you.html scripts/booking-core.mjs scripts/booking-page.mjs scripts/thank-you-page.mjs apps-script/booking-intake test styles.css index.html articles sitemap.xml README.md
git commit -m "Harden booking intake verification"
```

Skip this commit when Step 1–3 require no fixes.

### Task 11: Production Cutover With User Authorization

**Files:**

- Cloud configuration plus the already committed site; no secret files.

- [ ] **Step 1: User stores the new CAPI token without sharing it**

In Meta Events Manager, select Pixel `4400969670158242`, generate a Conversions API access token, and paste it directly into Apps Script property `META_CAPI_TOKEN`. If using Test Events, also set the temporary `META_TEST_EVENT_CODE` shown by Meta. Do not paste either value into chat, terminal output, Git, or the spreadsheet.

- [ ] **Step 2: User disables the obsolete trigger**

In the old Google Form Apps Script project, disable the installed form-submit trigger that sends `CompleteRegistration` to Pixel `853091474317806`. Do not delete the Google Form or its response sheet.

- [ ] **Step 3: Update the versioned Apps Script deployment**

Create a new Apps Script version and edit the existing deployment to use it. Verify the public URL still matches `scripts/booking-config.mjs`.

- [ ] **Step 4: Cutover checkpoint before GitHub Pages deployment**

Show the user the local booking and thank-you pages and the list of modified public routes. Proceed only after the user confirms the Apps Script deployment, Script Properties, and old-trigger disablement are complete.

- [ ] **Step 5: Integrate onto `main`, push it, and wait for GitHub Pages**

If implementation ran on a feature branch or worktree, use the required branch-finishing workflow to integrate the verified commits onto `main` first. In the deployment checkout, run:

```bash
test "$(git branch --show-current)" = "main"
git push origin main
```

Expected: the branch check and push succeed; GitHub Pages deploys the same `main` commit to `https://rongxinshenyu.com/`.

- [ ] **Step 6: Verify public routes**

Run:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://rongxinshenyu.com/booking.html
curl -fsS -o /dev/null -w '%{http_code}\n' https://rongxinshenyu.com/thank-you.html
```

Expected: `200` for both.

### Task 12: End-To-End Lead Verification And Closeout

**Files:**

- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/README.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-01 官網預約表單與Meta Lead追蹤.md`

- [ ] **Step 1: Submit one clearly marked test intake**

Use display name `測試－官網Lead驗收`, a controlled Email, a non-sensitive 20+ character test narrative, one approved topic, goal, and availability. Confirm the safety gate is clear and submit once.

- [ ] **Step 2: Verify operational results**

Confirm:

- one and only one row appears in「官網初步盤點」;
- the notification Email arrives without the narrative;
- the thank-you page appears;
- refreshing or reopening the thank-you URL does not send a second browser event;
- Meta Test Events shows browser and server `Lead` with the same `event_id` and deduplicates them;
- Apps Script CAPI status is `sent: 200`.

- [ ] **Step 3: Remove only the test row and temporary test-event property**

Delete the row whose display name is exactly `測試－官網Lead驗收`. Remove `META_TEST_EVENT_CODE` from Script Properties. Do not delete the sheet, production deployment, CAPI token, or Google Form.

- [ ] **Step 4: Record evidence and update project state**

Create the execution log with these exact headings and evidence sources; paste only the actual non-secret outputs obtained in Tasks 10–12:

```markdown
# 2026-09-01 官網預約表單與 Meta Lead 追蹤

## 發布結果

- 公開表單：https://rongxinshenyu.com/booking.html
- 感謝頁：https://rongxinshenyu.com/thank-you.html
- 網站 commit：使用 `git rev-parse HEAD` 的單行輸出
- Apps Script deployment version：使用 Apps Script「管理部署作業」顯示的版本號

## 自動驗收

- Booking tests：貼上 Node test runner 的 tests/pass/fail 總計
- Social publisher tests：貼上 npm test 的 pass/fail 總計
- Configuration check：貼上不含秘密值的成功訊息
- Secret audit：`no matches`
- Public HTTP：貼上兩個 curl 回傳的 `200`

## 端到端驗收

- 試算表：同一 `event_id` 僅一列
- 通知信：已收到，且沒有卡點敘述
- 感謝頁：成功顯示；重新整理與直接開啟沒有第二筆 browser Lead
- Meta Test Events：browser/server `Lead` 的 `event_id` 相同，結果為 deduplicated
- Apps Script CAPI 狀態：`sent: 200`
- 清理：已刪除稱呼 `測試－官網Lead驗收` 的測試列與 `META_TEST_EVENT_CODE`

## 限制與後續

- 第一階段仍由人工審核；電話、縣市、緊急聯絡人與錄音同意留在第二階段 Google 表單。
- 本次未建立廣告、未調整預算、未變更付款或預約成立規則。
```

Append this exact completion block to the report section of `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`:

```markdown
### 官網預約表單與 Meta Lead 追蹤

- 任務：把第一階段人生除錯盤點移到自有網域，沿用 Google 試算表人工審核，建立 browser/server Meta Lead 去重。
- 產出檔案：網站 repo 的 `booking.html`、`thank-you.html`、`scripts/booking-*.mjs`、`apps-script/booking-intake/` 與對應測試。
- 驗收：本機測試、公開 HTTP、試算表、通知信與 Meta Test Events 全數通過。
- 發布：https://rongxinshenyu.com/booking.html
- 狀態：✅ 完成
- 待確認：無
- 下一步：真實名單持續人工審核；需要投放時再建立廣告，不在本次範圍。
- 紀錄：[[2026-09-01 官網預約表單與Meta Lead追蹤]]
```

In `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/README.md`, replace the obsolete statement that the current dataset has no CAPI with this exact state:

```markdown
- 官網第一階段盤點已改由 `https://rongxinshenyu.com/booking.html` 接收，資料寫入既有 Google 試算表後人工審核；完整 Google 表單保留為第二階段與故障備援。
- Meta dataset `4400969670158242` 已使用 browser Pixel 與 Apps Script CAPI 回報同一 `event_id` 的 `Lead`，並經 Meta Test Events 驗證去重；CAPI token 僅存於 Apps Script Properties。
```

- [ ] **Step 5: Commit the vault closeout separately**

```bash
cd /Volumes/fast/Obsidian/ai-notes
git add rongxin-shenyu/README.md rongxin-shenyu/todo/assignments.md 'rongxin-shenyu/logs/2026-09-01 官網預約表單與Meta Lead追蹤.md'
git commit -m "Record owned booking and Meta lead tracking launch"
```

- [ ] **Step 6: Final verification summary**

Report the public booking URL, website commit, Apps Script deployment status, browser/server Lead deduplication, test totals, and any remaining limitation. Do not include the CAPI token, test Email, Google Sheet ID, or submitted narrative.
