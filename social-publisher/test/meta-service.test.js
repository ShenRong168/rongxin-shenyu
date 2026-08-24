import assert from "node:assert/strict";
import test from "node:test";
import { createInstagramMediaContainer, publishInstagram, publishThreads } from "../src/meta-service.js";

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

test("publishInstagram uses the single-image path for one imageUrls item", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body };
    calls.push(call);
    if (call.url.endsWith("/ig_1/media")) return jsonResponse({ id: "container_1" });
    if (call.url.includes("/container_1?")) return jsonResponse({ status_code: "FINISHED" });
    if (call.url.endsWith("/ig_1/media_publish")) return jsonResponse({ id: "media_1" });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await publishInstagram({
    instagramUserId: "ig_1",
    pageAccessToken: "page_token",
    caption: "single caption",
    imageUrls: ["https://example.com/one.png"],
    containerPollOptions: { attempts: 1, delayMs: 0 }
  });

  assert.deepEqual(result, { id: "media_1" });
  assert.equal(calls.filter((call) => call.url.endsWith("/ig_1/media")).length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith("/ig_1/media_publish")).length, 1);
  assert.equal(calls[0].body.get("image_url"), "https://example.com/one.png");
  assert.equal(calls[0].body.has("media_type"), false);
  assert.equal(calls[0].body.has("is_carousel_item"), false);
});

test("createInstagramMediaContainer never publishes the container", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body };
    calls.push(call);
    if (call.url.endsWith("/ig_1/media")) return jsonResponse({ id: "container_1" });
    if (call.url.includes("/container_1?")) return jsonResponse({ status_code: "FINISHED" });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await createInstagramMediaContainer({
    instagramUserId: "ig_1",
    pageAccessToken: "page_token",
    caption: "container only",
    imageUrl: "https://example.com/image.png",
    containerPollOptions: { attempts: 1, delayMs: 0 }
  });

  assert.deepEqual(result, { id: "container_1" });
  assert.equal(calls.filter((call) => call.url.endsWith("/ig_1/media_publish")).length, 0);
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

test("publishInstagram creates and publishes a Reel container", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body };
    calls.push(call);
    if (call.url.endsWith("/ig_1/media")) return jsonResponse({ id: "reel_container_1" });
    if (call.url.includes("/reel_container_1?")) return jsonResponse({ status_code: "FINISHED" });
    if (call.url.endsWith("/ig_1/media_publish")) return jsonResponse({ id: "reel_media_1" });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await publishInstagram({
    instagramUserId: "ig_1",
    pageAccessToken: "page_token",
    caption: "reel caption",
    videoUrl: "https://example.com/reel.mp4",
    containerPollOptions: { attempts: 1, delayMs: 0 }
  });

  assert.deepEqual(result, { id: "reel_media_1" });
  assert.equal(calls[0].body.get("media_type"), "REELS");
  assert.equal(calls[0].body.get("video_url"), "https://example.com/reel.mp4");
  assert.equal(calls[0].body.get("caption"), "reel caption");
  assert.equal(calls[0].body.has("image_url"), false);
  assert.equal(calls[2].body.get("creation_id"), "reel_container_1");
});

test("Reel containers use wider polling defaults", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let statusCalls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body };
    calls.push(call);
    if (call.url.endsWith("/ig_1/media")) return jsonResponse({ id: "slow_reel_1" });
    if (call.url.includes("/slow_reel_1?")) {
      statusCalls += 1;
      return jsonResponse({ status_code: statusCalls === 11 ? "FINISHED" : "IN_PROGRESS" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await createInstagramMediaContainer({
    instagramUserId: "ig_1",
    pageAccessToken: "page_token",
    caption: "slow reel",
    videoUrl: "https://example.com/slow.mp4",
    containerPollOptions: { delayMs: 0 }
  });

  assert.deepEqual(result, { id: "slow_reel_1" });
  assert.equal(statusCalls, 11);
});

test("Reel containers use a 5000ms default delay and accept poll overrides", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const delays = [];
  let statusCalls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  });

  globalThis.setTimeout = (callback, ms) => {
    delays.push(ms);
    queueMicrotask(callback);
    return 0;
  };
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/ig_1/media")) return jsonResponse({ id: "reel_delay_1" });
    if (String(url).includes("/reel_delay_1?")) {
      statusCalls += 1;
      return jsonResponse({ status_code: statusCalls === 2 ? "FINISHED" : "IN_PROGRESS" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await createInstagramMediaContainer({
    instagramUserId: "ig_1",
    pageAccessToken: "page_token",
    caption: "default delay",
    videoUrl: "https://example.com/default-delay.mp4"
  });
  assert.deepEqual(delays, [5000]);

  delays.length = 0;
  statusCalls = 0;
  await createInstagramMediaContainer({
    instagramUserId: "ig_1",
    pageAccessToken: "page_token",
    caption: "custom delay",
    videoUrl: "https://example.com/custom-delay.mp4",
    containerPollOptions: { attempts: 3, delayMs: 17 }
  });
  assert.deepEqual(delays, [17]);
});

test("publishInstagram does not publish a Reel container that fails processing", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body };
    calls.push(call);
    if (call.url.endsWith("/ig_1/media")) return jsonResponse({ id: "failed_reel_1" });
    if (call.url.includes("/failed_reel_1?")) return jsonResponse({ status_code: "ERROR" });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await assert.rejects(
    publishInstagram({
      instagramUserId: "ig_1",
      pageAccessToken: "page_token",
      caption: "failed reel",
      videoUrl: "https://example.com/failed.mp4",
      containerPollOptions: { attempts: 1, delayMs: 0 }
    }),
    /Instagram media container ERROR/
  );

  assert.equal(calls.some((call) => call.url.endsWith("/ig_1/media_publish")), false);
});

test("publishThreads sends topic_tag when topicTag is provided", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body };
    calls.push(call);
    if (call.url.endsWith("/threads_user/threads")) return jsonResponse({ id: "threads_container_1" });
    if (call.url.endsWith("/threads_user/threads_publish")) return jsonResponse({ id: "threads_post_1" });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await publishThreads({
    threadsUserId: "threads_user",
    accessToken: "threads_token",
    text: "caption",
    imageUrl: "",
    topicTag: "人生"
  });

  assert.deepEqual(result, { id: "threads_post_1" });
  assert.equal(calls[0].body.get("media_type"), "TEXT");
  assert.equal(calls[0].body.get("topic_tag"), "人生");
  assert.equal(calls[1].body.get("creation_id"), "threads_container_1");
});

test("publishThreads omits topic_tag for legacy posts without topicTag", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body };
    calls.push(call);
    if (call.url.endsWith("/threads_user/threads")) return jsonResponse({ id: "threads_container_1" });
    if (call.url.endsWith("/threads_user/threads_publish")) return jsonResponse({ id: "threads_post_1" });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await publishThreads({
    threadsUserId: "threads_user",
    accessToken: "threads_token",
    text: "caption",
    imageUrl: ""
  });

  assert.equal(calls[0].body.has("topic_tag"), false);
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}
