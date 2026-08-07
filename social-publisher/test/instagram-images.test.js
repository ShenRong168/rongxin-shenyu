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
