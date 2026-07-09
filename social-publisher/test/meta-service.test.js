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
    calls.push({ url: String(url), method: options.method || "GET" });

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

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}
