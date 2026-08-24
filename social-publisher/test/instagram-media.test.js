import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInstagramMediaInput } from "../src/instagram-media.js";

test("normalizeInstagramMediaInput accepts a public Reel video URL", () => {
  assert.deepEqual(
    normalizeInstagramMediaInput({ videoUrl: " https://example.com/reel.mp4 " }),
    {
      kind: "reels",
      videoUrl: "https://example.com/reel.mp4"
    }
  );
});

test("normalizeInstagramMediaInput preserves image and carousel behavior", () => {
  assert.deepEqual(
    normalizeInstagramMediaInput({ imageUrl: "https://example.com/image.png" }),
    {
      kind: "image",
      imageUrl: "https://example.com/image.png",
      imageUrls: ["https://example.com/image.png"]
    }
  );

  assert.deepEqual(
    normalizeInstagramMediaInput({
      imageUrls: ["https://example.com/one.png", "https://example.com/two.png"]
    }),
    {
      kind: "carousel",
      imageUrl: "https://example.com/one.png",
      imageUrls: ["https://example.com/one.png", "https://example.com/two.png"]
    }
  );
});

test("normalizeInstagramMediaInput requires exactly one media source", () => {
  assert.throws(
    () => normalizeInstagramMediaInput(),
    /requires exactly one of imageUrl, imageUrls, or videoUrl/
  );

  for (const input of [
    {
      imageUrl: "https://example.com/image.png",
      imageUrls: ["https://example.com/other.png"]
    },
    {
      imageUrl: "https://example.com/image.png",
      videoUrl: "https://example.com/reel.mp4"
    },
    {
      imageUrls: ["https://example.com/image.png"],
      videoUrl: "https://example.com/reel.mp4"
    }
  ]) {
    assert.throws(
      () => normalizeInstagramMediaInput(input),
      /requires exactly one of imageUrl, imageUrls, or videoUrl/
    );
  }
});

test("normalizeInstagramMediaInput rejects invalid Reel video URLs", () => {
  assert.throws(
    () => normalizeInstagramMediaInput({ videoUrl: "not a URL" }),
    /Instagram video must be a valid URL/
  );
  assert.throws(
    () => normalizeInstagramMediaInput({ videoUrl: "ftp://example.com/reel.mp4" }),
    /Instagram video must use http or https/
  );
  assert.throws(
    () => normalizeInstagramMediaInput({ videoUrl: 123 }),
    /Instagram video must be a non-empty URL/
  );
});

