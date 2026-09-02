import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

let thankYouImportId = 0;

async function runThankYouModule(windowApi) {
  const previousWindow = globalThis.window;
  globalThis.window = windowApi;
  try {
    const moduleUrl = new URL("../scripts/thank-you-page.mjs", import.meta.url);
    moduleUrl.searchParams.set("test", String(++thankYouImportId));
    await import(moduleUrl.href);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test("booking page exposes only approved first-stage fields", async () => {
  const html = await read("booking.html");
  for (const name of ["displayName", "email", "stuckText", "topic", "goals", "availability", "adultConfirmed", "taiwanConfirmed", "consentConfirmed"]) assert.match(html, new RegExp(`name=["']${name}["']`));
  for (const rejected of ["emergencyContact", "recordingConsent", "phone", "city"]) assert.doesNotMatch(html, new RegExp(`name=["']${rejected}["']`));
  assert.match(html, /id="safety-gate"/);
  assert.match(html, /119/);
  assert.match(html, /110/);
  assert.match(html, /1925/);
  assert.match(html, /target="booking-response"/);
  assert.match(html, /<input(?=[^>]*name="email")(?=[^>]*maxlength="254")[^>]*>/);
});

test("thank-you page is noindex and owns the one-shot Lead module", async () => {
  const html = await read("thank-you.html");
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\s*\/>/);
  assert.match(html, /4400969670158242/);
  assert.match(html, /<script type="module" src="scripts\/thank-you-page\.mjs"><\/script>/);
});

test("thank-you module consumes the event marker, tracks once, and cleans the URL", async () => {
  const values = new Map([["rongxin:lead:lead_1", "confirmed"]]);
  const calls = [];
  const replacements = [];
  const windowApi = {
    location: { search: "?event_id=lead_1" },
    sessionStorage: {
      getItem: (key) => values.get(key) || null,
      removeItem: (key) => values.delete(key)
    },
    fbq: (...args) => calls.push(args),
    history: { replaceState: (...args) => replacements.push(args) }
  };

  await runThankYouModule(windowApi);
  await runThankYouModule(windowApi);

  assert.deepEqual(calls, [["track", "Lead", {}, { eventID: "lead_1" }]]);
  assert.equal(values.has("rongxin:lead:lead_1"), false);
  assert.deepEqual(replacements, [
    [{}, "", "/thank-you.html"],
    [{}, "", "/thank-you.html"]
  ]);
});

test("thank-you module still cleans the URL when session storage is blocked", async () => {
  const replacements = [];
  const windowApi = {
    location: { search: "?event_id=lead_blocked" },
    get sessionStorage() {
      throw new DOMException("Blocked", "SecurityError");
    },
    fbq: () => assert.fail("Lead must not fire without a consumed marker"),
    history: { replaceState: (...args) => replacements.push(args) }
  };

  await assert.doesNotReject(runThankYouModule(windowApi));
  assert.deepEqual(replacements, [[{}, "", "/thank-you.html"]]);
});

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

test("booking safety states remain visually exclusive", async () => {
  const styles = await read("styles.css");
  assert.match(styles, /\.intake-form\[hidden\],\s*\.crisis-panel\[hidden\]\s*{[\s\S]*?display:\s*none/);
});

test("safety choices use the booking page visual language", async () => {
  const styles = await read("styles.css");
  assert.ok(styles.includes(".intake-card [data-safety]"));
});

test("crisis action remains readable and keyboard-visible on its light panel", async () => {
  const styles = await read("styles.css");
  assert.ok(styles.includes(".crisis-panel .button"));
  assert.ok(styles.includes(".crisis-panel a:focus-visible"));
});
