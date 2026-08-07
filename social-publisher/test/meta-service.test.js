import assert from "node:assert/strict";
import test from "node:test";
import { publishInstagram } from "../src/meta-service.js";

test("publishInstagram waits until the media container is finished", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET", body: options.body });

    if (String(url).endsWith("/media")) {
      return jsonResponse({ id: "container_123" });
    }

    if (String(url).includes("/container_123?")) {
      const statusCalls = calls.filter((call) => call.url.includes("/container_123?"));
      return jsonResponse({
        id: "container_123",
        status_code: statusCalls.length === 1 ? "IN_PROGRESS" : "FINISHED"
      });
    }

    if (String(url).endsWith("/media_publish")) {
      return jsonResponse({ id: "media_456" });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await publishInstagram({
    instagramUserId: "ig_1",
    pageAccessToken: "page_token",
    caption: "caption",
    imageUrl: "https://example.com/image.png",
    containerPollOptions: { attempts: 3, delayMs: 0 }
  });

  assert.deepEqual(result, { id: "media_456" });
  assert.equal(calls[0].url.endsWith("/ig_1/media"), true);
  assert.equal(calls[1].url.includes("/container_123?"), true);
  assert.equal(calls[2].url.includes("/container_123?"), true);
  assert.equal(calls[3].url.endsWith("/ig_1/media_publish"), true);
});

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

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}
