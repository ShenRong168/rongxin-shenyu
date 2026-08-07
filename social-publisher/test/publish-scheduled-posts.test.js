import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

test("importing the scheduler has no dotenv, schedule, or publishing side effects", () => {
  const cwd = mkdtempSync(join(tmpdir(), "publish-scheduled-posts-"));
  const schedulerUrl = pathToFileURL(
    new URL("../scripts/publish-scheduled-posts.js", import.meta.url).pathname
  ).href;

  try {
    writeFileSync(join(cwd, ".env"), "IMPORT_SAFETY_MARKER=loaded\n");
    const childEnv = { ...process.env };
    delete childEnv.IMPORT_SAFETY_MARKER;

    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(schedulerUrl)});\nif (process.env.IMPORT_SAFETY_MARKER) process.exit(1);`
      ],
      { cwd, env: childEnv, stdio: "pipe" }
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
