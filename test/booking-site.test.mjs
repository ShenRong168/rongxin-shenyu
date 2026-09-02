import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const cssToken = (styles, name) => styles.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((part) => Number.parseInt(part, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function anchors(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => ({
    attributes: match[1],
    text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }));
}

function attribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2];
}

function trackedPixelIds(html) {
  const scriptIds = [...html.matchAll(/fbq\s*\(\s*(["'])init\1\s*,\s*(["'])(\d{10,})\2/gi)].map((match) => match[3]);
  const imageIds = [...html.matchAll(/facebook\.com\/tr\?[^"']*?\bid=(\d{10,})/gi)].map((match) => match[1]);
  return [...scriptIds, ...imageIds];
}

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
    assert.match(booking, new RegExp(`(?:<label[^>]*>[\\s\\S]*?name="${name}"|<label[^>]*for="${name}"|<fieldset[^>]*aria-describedby="${name}-error")`));
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

test("booking focus rings use the high-contrast moss token on light surfaces", async () => {
  const styles = await read("styles.css");
  assert.match(
    styles,
    /\.intake-form :focus-visible,[\s\S]*?\.thank-you-panel a:focus-visible\s*{[\s\S]*?outline:\s*3px solid var\(--moss\)/
  );
  for (const surface of [cssToken(styles, "paper"), cssToken(styles, "cream")]) {
    assert.ok(contrast(cssToken(styles, "moss"), surface) >= 3, "focus ring must contrast at least 3:1 with light surfaces");
  }
});

test("confirmation rows preserve native checkbox geometry", async () => {
  const styles = await read("styles.css");
  assert.match(styles, /\.intake-form \.check-row\s*{[^}]*display:\s*flex/);
  assert.match(styles, /\.intake-form \.check-row > input\[type="checkbox"\]\s*{[^}]*width:\s*auto/);
});

test("consent copy uses an associated label without nesting interactive links", async () => {
  const booking = await read("booking.html");
  const styles = await read("styles.css");
  const labelBlocks = [...booking.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map((match) => match[0]);
  for (const label of labelBlocks) assert.doesNotMatch(label, /<a\b/);
  assert.match(booking, /<input(?=[^>]*id="consentConfirmed")(?=[^>]*name="consentConfirmed")(?=[^>]*aria-describedby="consentConfirmed-error")[^>]*>/);
  assert.match(booking, /<label[^>]*for="consentConfirmed"[^>]*>/);
  assert.match(styles, /\.consent-copy a\s*{[^}]*text-decoration:\s*underline/);
});

test("form control boundaries and page kickers meet contrast floors", async () => {
  const styles = await read("styles.css");
  assert.match(styles, /\.intake-form input\[type="text"\],[^{]*\.intake-form textarea\s*{[^}]*border:\s*1px solid var\(--sage\)/);
  assert.ok(contrast(cssToken(styles, "sage"), cssToken(styles, "cream")) >= 3, "control boundary must contrast at least 3:1");
  assert.match(styles, /\.booking-page \.section-kicker,\s*\.thank-you-page \.section-kicker\s*{[^}]*color:\s*var\(--moss\)/);
  for (const surface of [cssToken(styles, "paper"), cssToken(styles, "cream")]) {
    assert.ok(contrast(cssToken(styles, "moss"), surface) >= 4.5, "booking kicker must contrast at least 4.5:1");
  }
});

test("all public intake CTAs route through the owned booking page", async () => {
  const home = await read("index.html");
  const career = await read("articles/career-transition.html");
  const workplace = await read("articles/workplace-confusion.html");
  const expectations = [
    [home, "/booking.html", 5],
    [career, "../booking.html", 2],
    [workplace, "../booking.html", 2]
  ];
  for (const [html, expectedHref, expectedCount] of expectations) {
    const intakeAnchors = anchors(html).filter(({ text }) => /人生除錯(?:前置)?盤點/.test(text));
    assert.equal(intakeAnchors.length, expectedCount);
    for (const { attributes } of intakeAnchors) {
      assert.equal(attribute(attributes, "href"), expectedHref);
      assert.doesNotMatch(attributes, /\b(?:target|rel|onclick)\s*=/i);
    }
  }
  for (const html of [home, career, workplace]) {
    assert.doesNotMatch(html, /docs\.google\.com\/forms/);
    assert.doesNotMatch(html, /fbq\s*\(\s*(["'])track\1\s*,\s*(["'])Schedule\2/i);
  }
  const booking = await read("booking.html");
  const bookingFallbacks = anchors(booking).filter(({ attributes }) =>
    /^https:\/\/docs\.google\.com\/forms\//.test(attribute(attributes, "href") || "")
  );
  assert.equal(bookingFallbacks.length, 1);
  assert.equal(attribute(bookingFallbacks[0].attributes, "id"), "booking-fallback");
  assert.match(bookingFallbacks[0].attributes, /\bhidden(?:\s|$)/i);
  assert.doesNotMatch(await read("thank-you.html"), /docs\.google\.com\/forms/);
});

test("sitemap publishes booking but not thank-you", async () => {
  const sitemap = await read("sitemap.xml");
  assert.match(sitemap, /https:\/\/rongxinshenyu\.com\/booking\.html/);
  assert.doesNotMatch(sitemap, /thank-you\.html/);
  assert.match(sitemap, /<loc>https:\/\/rongxinshenyu\.com\/<\/loc>\s*<lastmod>2026-09-02<\/lastmod>/);
});

test("all tracked public pages use only the current Pixel", async () => {
  for (const path of ["index.html", "booking.html", "thank-you.html", "articles/career-transition.html", "articles/workplace-confusion.html"]) {
    const html = await read(path);
    const pixelIds = trackedPixelIds(html);
    assert.ok(pixelIds.length >= 2, `${path} must contain script and noscript Pixel IDs`);
    assert.deepEqual([...new Set(pixelIds)], ["4400969670158242"]);
  }
});

test("privacy disclosure names Lead deduplication data and excludes intake answers", async () => {
  const home = await read("index.html");
  assert.match(home, /隨機事件識別碼（用於瀏覽器與伺服器事件去重）/);
  assert.match(home, /不會收到你填寫的卡點敘述、主要分類、期待結果、方便時段或安全分流內容/);
});

test("README documents the custom-domain flow and safe verification prerequisites", async () => {
  const readme = await read("README.md");
  assert.match(readme, /Public URL:\s*\n\s*`https:\/\/rongxinshenyu\.com\/`/);
  assert.match(readme, /Google Form fallback link is retained only in `booking\.html`/);
  assert.match(readme, /Before running the configuration check[^\n]*`social-publisher\/\.env\.example`[^\n]*`social-publisher\/\.env`/i);
  assert.match(readme, /Run each command separately and stop if any command exits non-zero\./);
  const verification = readme.slice(readme.indexOf("### Booking Verification"));
  const commands = [...verification.matchAll(/```bash\s*\n([\s\S]*?)```/g)].map((match) => match[1].trim());
  assert.deepEqual(commands, [
    "node --test test/booking-core.test.mjs test/configure-booking-endpoint.test.mjs test/booking-apps-script.test.mjs test/booking-site.test.mjs",
    "npm --prefix social-publisher test",
    "npm --prefix social-publisher run check",
    "git diff --check"
  ]);
});
