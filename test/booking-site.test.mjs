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

function readTag(source, start) {
  if (source[start] !== "<" || source.startsWith("<!--", start)) return null;
  let index = start + 1;
  const closing = source[index] === "/";
  if (closing) index += 1;
  if (!/[a-z]/i.test(source[index] || "")) return null;

  const nameStart = index;
  while (index < source.length && /[a-z0-9:-]/i.test(source[index])) index += 1;
  const nameEnd = index;
  if (!/[\s/>]/.test(source[index] || "")) return null;
  let quote = null;
  while (index < source.length) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      const attributes = source.slice(nameEnd, index);
      return {
        attributes,
        closing,
        end: index + 1,
        name: source.slice(nameStart, nameEnd).toLowerCase(),
        selfClosing: attributes.trimEnd().endsWith("/"),
        start
      };
    }
    index += 1;
  }
  return null;
}

function skipComment(source, start) {
  const end = source.indexOf("-->", start + 4);
  return end === -1 ? source.length : end + 3;
}

function skipRawTextElement(source, openingTag) {
  const lowerSource = source.toLowerCase();
  const needle = `</${openingTag.name}`;
  let candidate = lowerSource.indexOf(needle, openingTag.end);
  while (candidate !== -1) {
    const boundary = lowerSource[candidate + needle.length] || "";
    const closingTag = /[\s/>]/.test(boundary) ? readTag(source, candidate) : null;
    if (closingTag?.closing && closingTag.name === openingTag.name) return closingTag.end;
    candidate = lowerSource.indexOf(needle, candidate + needle.length);
  }
  return source.length;
}

const RAW_OR_RCDATA_CONTAINERS = new Set(["script", "style", "textarea", "title", "noscript"]);
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function skipTemplateSubtree(source, openingTag) {
  let depth = 1;
  let index = openingTag.end;
  while (index < source.length) {
    const tagStart = source.indexOf("<", index);
    if (tagStart === -1) return source.length;
    if (source.startsWith("<!--", tagStart)) {
      index = skipComment(source, tagStart);
      continue;
    }
    const tag = readTag(source, tagStart);
    if (!tag) {
      index = tagStart + 1;
      continue;
    }
    if (!tag.closing && !tag.selfClosing && RAW_OR_RCDATA_CONTAINERS.has(tag.name)) {
      index = skipRawTextElement(source, tag);
      continue;
    }
    if (tag.name === "template") {
      if (tag.closing) depth -= 1;
      else if (!tag.selfClosing) depth += 1;
      if (depth === 0) return tag.end;
    }
    index = tag.end;
  }
  return source.length;
}

function tagHidesContent(tag) {
  const attributes = tokenizeAttributes(tag.attributes);
  return attributes.has("hidden")
    || attributes.has("inert")
    || String(attributes.get("aria-hidden") || "").trim().toLowerCase() === "true";
}

function popElement(stack, name) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].name === name) return stack.splice(index);
  }
  return [];
}

function visibleText(fragment) {
  let result = "";
  let index = 0;
  let hiddenDepth = 0;
  const elementStack = [];
  while (index < fragment.length) {
    const tagStart = fragment.indexOf("<", index);
    if (tagStart === -1) {
      if (hiddenDepth === 0) result += fragment.slice(index);
      break;
    }
    if (hiddenDepth === 0) result += fragment.slice(index, tagStart);
    if (fragment.startsWith("<!--", tagStart)) {
      index = skipComment(fragment, tagStart);
      continue;
    }
    const tag = readTag(fragment, tagStart);
    if (!tag) {
      if (hiddenDepth === 0) result += "<";
      index = tagStart + 1;
      continue;
    }
    if (!tag.closing && !tag.selfClosing && tag.name === "template") {
      index = skipTemplateSubtree(fragment, tag);
      continue;
    }
    if (!tag.closing && !tag.selfClosing && RAW_OR_RCDATA_CONTAINERS.has(tag.name)) {
      index = skipRawTextElement(fragment, tag);
      continue;
    }
    if (tag.closing) {
      const removed = popElement(elementStack, tag.name);
      hiddenDepth -= removed.filter(({ hidden }) => hidden).length;
    } else if (!tag.selfClosing && !VOID_ELEMENTS.has(tag.name)) {
      const hidden = tagHidesContent(tag);
      elementStack.push({ hidden, name: tag.name });
      if (hidden) hiddenDepth += 1;
    }
    index = tag.end;
  }
  return result.replace(/\s+/g, " ").trim();
}

function anchors(html) {
  const found = [];
  const openAnchors = [];
  const elementStack = [];
  let hiddenDepth = 0;
  let index = 0;
  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) break;
    if (html.startsWith("<!--", tagStart)) {
      index = skipComment(html, tagStart);
      continue;
    }
    const tag = readTag(html, tagStart);
    if (!tag) {
      index = tagStart + 1;
      continue;
    }
    if (!tag.closing && !tag.selfClosing && tag.name === "template") {
      index = skipTemplateSubtree(html, tag);
      continue;
    }
    if (!tag.closing && !tag.selfClosing && RAW_OR_RCDATA_CONTAINERS.has(tag.name)) {
      index = skipRawTextElement(html, tag);
      continue;
    }
    if (tag.closing) {
      if (tag.name === "a") {
        const openingTag = openAnchors.pop();
        if (openingTag) {
          found.push({
            attributes: openingTag.attributes,
            start: openingTag.start,
            text: openingTag.hidden ? "" : visibleText(html.slice(openingTag.end, tag.start))
          });
        }
      }
      const removed = popElement(elementStack, tag.name);
      hiddenDepth -= removed.filter(({ hidden }) => hidden).length;
    } else if (!tag.selfClosing) {
      const hidden = tagHidesContent(tag);
      if (tag.name === "a") openAnchors.push({ ...tag, hidden: hidden || hiddenDepth > 0 });
      if (!VOID_ELEMENTS.has(tag.name)) {
        elementStack.push({ hidden, name: tag.name });
        if (hidden) hiddenDepth += 1;
      }
    }
    index = tag.end;
  }
  return found.sort((left, right) => left.start - right.start);
}

function tokenizeAttributes(source) {
  const tokens = new Map();
  let index = 0;
  const isWhitespace = (character) => /\s/.test(character);

  while (index < source.length) {
    while (index < source.length && isWhitespace(source[index])) index += 1;
    if (index >= source.length || source[index] === "/") break;

    const nameStart = index;
    while (index < source.length && !/[\s=/>]/.test(source[index])) index += 1;
    if (index === nameStart) {
      index += 1;
      continue;
    }
    const name = source.slice(nameStart, index).toLowerCase();
    while (index < source.length && isWhitespace(source[index])) index += 1;

    let value = null;
    if (source[index] === "=") {
      index += 1;
      while (index < source.length && isWhitespace(source[index])) index += 1;
      const quote = source[index] === '"' || source[index] === "'" ? source[index++] : null;
      const valueStart = index;
      if (quote) {
        while (index < source.length && source[index] !== quote) index += 1;
        value = source.slice(valueStart, index);
        if (source[index] === quote) index += 1;
      } else {
        while (index < source.length && !/[\s>]/.test(source[index])) index += 1;
        value = source.slice(valueStart, index);
      }
    }
    if (!tokens.has(name)) tokens.set(name, value);
  }

  return tokens;
}

function attribute(attributes, name) {
  const value = tokenizeAttributes(attributes).get(name.toLowerCase());
  return value === null ? "" : value;
}

function hasBooleanAttribute(attributes, name) {
  return tokenizeAttributes(attributes).has(name.toLowerCase());
}

function trackedPixelIds(html) {
  const scriptIds = [...html.matchAll(/fbq\s*\(\s*(["'])init\1\s*,\s*(["'])(\d{10,})\2/gi)].map((match) => match[3]);
  const imageIds = [...html.matchAll(/facebook\.com\/tr\?[^"']*?\bid=(\d{10,})/gi)].map((match) => match[1]);
  return [...scriptIds, ...imageIds];
}

function assertSingleGoogleFormsFallback(html) {
  assert.equal(
    [...html.matchAll(/docs\.google\.com\/forms/gi)].length,
    1,
    "booking.html must contain exactly one Google Forms occurrence"
  );
  const bookingFallbacks = anchors(html).filter(({ attributes }) =>
    /^https:\/\/docs\.google\.com\/forms\//i.test(attribute(attributes, "href") || "")
  );
  assert.equal(bookingFallbacks.length, 1);
  assert.equal(attribute(bookingFallbacks[0].attributes, "id"), "booking-fallback");
  assert.equal(hasBooleanAttribute(bookingFallbacks[0].attributes, "hidden"), true);
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
  assert.match(html, /<script type="module" src="scripts\/booking-page\.mjs\?v=20260903-2"><\/script>/);
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
      for (const forbidden of ["target", "rel", "onclick"]) {
        assert.equal(tokenizeAttributes(attributes).has(forbidden), false);
      }
    }
  }
  for (const html of [home, career, workplace]) {
    assert.doesNotMatch(html, /docs\.google\.com\/forms/);
    assert.doesNotMatch(html, /fbq\s*\(\s*(["'])track\1\s*,\s*(["'])Schedule\2/i);
  }
  const booking = await read("booking.html");
  assertSingleGoogleFormsFallback(booking);
  assert.doesNotMatch(await read("thank-you.html"), /docs\.google\.com\/forms/);
});

test("Google Forms fallback audit rejects leftovers outside the fallback anchor", () => {
  const fixture = `
    <a id="booking-fallback" href="https://docs.google.com/forms/d/example/fallback" hidden>Fallback</a>
    <script>const staleForm = "https://docs.google.com/forms/d/e/stale";</script>
  `;
  assert.throws(() => assertSingleGoogleFormsFallback(fixture), /exactly one Google Forms occurrence/);
});

test("HTML attribute parsing accepts real forms and rejects prefixed lookalikes", () => {
  assert.equal(attribute(` href="/quoted"`, "href"), "/quoted");
  assert.equal(attribute(`\n href = '/spaced'`, "href"), "/spaced");
  assert.equal(attribute(` href=/unquoted`, "href"), "/unquoted");
  assert.equal(attribute(` data-href="/decoy"`, "href"), undefined);
  assert.equal(attribute(` aria-href="/decoy"`, "href"), undefined);
  assert.equal(attribute(` data-note=" href=https://decoy.example/form"`, "href"), undefined);
  assert.equal(hasBooleanAttribute(` hidden`, "hidden"), true);
  assert.equal(hasBooleanAttribute(`\n hidden `, "hidden"), true);
  assert.equal(hasBooleanAttribute(` hidden=""`, "hidden"), true);
  assert.equal(hasBooleanAttribute(` hidden='hidden'`, "hidden"), true);
  assert.equal(hasBooleanAttribute(` hidden=hidden`, "hidden"), true);
  assert.equal(hasBooleanAttribute(` data-hidden`, "hidden"), false);
  assert.equal(hasBooleanAttribute(` aria-label="visually hidden fallback"`, "hidden"), false);
});

test("anchor scanner ignores comments and raw text while honoring quoted greater-than signs", () => {
  const fixture = `
    <!-- <a href="/comment-decoy">人生除錯盤點</a> -->
    <script>const fake = '<a href="/script-decoy">人生除錯盤點</a>';</script>
    <style>.fake::after { content: '<a href="/style-decoy">人生除錯盤點</a>'; }</style>
    <a title="第一階段 > 第二階段" href="/booking.html">人生除錯盤點</a>
  `;
  const parsed = anchors(fixture);
  assert.equal(parsed.length, 1);
  assert.equal(attribute(parsed[0].attributes, "href"), "/booking.html");
  assert.equal(parsed[0].text, "人生除錯盤點");
});

test("anchor scanner follows browser tag boundaries, inert containers, and visible text", () => {
  const fixture = `
    <textarea><a href="/textarea-decoy">人生除錯盤點</a></textarea>
    <title><a href="/title-decoy">人生除錯盤點</a></title>
    <template><a href="/template-decoy">人生除錯盤點</a></template>
    <noscript><a href="/noscript-decoy">人生除錯盤點</a></noscript>
    < a href="/spaced-tag-decoy">人生除錯盤點</a>
    <a.foo href="/bad-boundary-decoy">人生除錯盤點</a>
    <div hidden><a href="/hidden-ancestor">人生除錯盤點</a></div>
    <a href="/hidden-descendant"><span hidden>人生除錯盤點</span></a>
    <a href="/aria-hidden-descendant"><span aria-hidden="true">人生除錯盤點</span></a>
    <a href="/inert-descendant"><span inert>人生除錯盤點</span></a>
    <a href="/nested"><span>人生除錯</span><strong>盤點</strong></a>
  `;
  const parsed = anchors(fixture);
  const intakeAnchors = parsed.filter(({ text }) => /人生除錯(?:前置)?盤點/.test(text));
  assert.deepEqual(intakeAnchors.map(({ attributes }) => attribute(attributes, "href")), ["/nested"]);
  assert.equal(parsed.find(({ attributes }) => attribute(attributes, "href") === "/hidden-ancestor")?.text, "");
  assert.equal(parsed.find(({ attributes }) => attribute(attributes, "href") === "/hidden-descendant")?.text, "");
  assert.equal(parsed.find(({ attributes }) => attribute(attributes, "href") === "/aria-hidden-descendant")?.text, "");
  assert.equal(parsed.find(({ attributes }) => attribute(attributes, "href") === "/inert-descendant")?.text, "");
});

test("anchor scanner skips balanced nested and unclosed template subtrees", () => {
  const nested = `<template><template></template><a href="/template-decoy">人生除錯盤點</a></template><a href="/real">人生除錯盤點</a>`;
  const nestedIntake = anchors(nested).filter(({ text }) => /人生除錯(?:前置)?盤點/.test(text));
  assert.deepEqual(nestedIntake.map(({ attributes }) => attribute(attributes, "href")), ["/real"]);

  const unclosed = `<template><template><a href="/unclosed-template-decoy">人生除錯盤點</a>`;
  assert.deepEqual(anchors(unclosed), []);
});

test("Google Forms fallback audit rejects prefixed href and hidden lookalikes", () => {
  for (const fixture of [
    `<a id="booking-fallback" data-href="https://docs.google.com/forms/d/example/fallback" hidden>Fallback</a>`,
    `<a id="booking-fallback" aria-href="https://docs.google.com/forms/d/example/fallback" hidden>Fallback</a>`,
    `<a id="booking-fallback" href="https://docs.google.com/forms/d/example/fallback" data-hidden>Fallback</a>`,
    `<a id="booking-fallback" data-note=" href=https://docs.google.com/forms/d/example/fallback" hidden>Fallback</a>`,
    `<a id="booking-fallback" href="https://docs.google.com/forms/d/example/fallback" aria-label="visually hidden fallback">Fallback</a>`
  ]) {
    assert.throws(() => assertSingleGoogleFormsFallback(fixture));
  }
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
  assert.match(readme, /configuration check requires either[^\n]*`social-publisher\/\.env`[^\n]*current shell[^\n]*`social-publisher\/\.env\.example`/i);
  assert.match(readme, /If neither[^\n]*SKIP[^\n]*environment is not prepared/i);
  assert.match(readme, /never[^\n]*(?:commit|print)[^\n]*secret/i);
  assert.match(readme, /Run each command separately and stop if any command exits non-zero\./);
  const verification = readme.slice(readme.indexOf("### Booking Verification"));
  const commands = [...verification.matchAll(/```bash\s*\n([\s\S]*?)```/g)].map((match) => match[1].trim());
  assert.deepEqual(commands, [
    "node --test test/booking-*.test.mjs",
    "npm --prefix social-publisher test",
    "npm --prefix social-publisher run check",
    "node scripts/audit-booking-secrets.mjs",
    "git diff --check main...HEAD",
    "git status --short"
  ]);
});
