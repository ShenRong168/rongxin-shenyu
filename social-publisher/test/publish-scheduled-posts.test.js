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
