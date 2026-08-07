import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      imageUrl: "https://example.com/one.png",
      imageUrls: ["https://example.com/one.png", "https://example.com/two.png"]
    }
  );
});

test("buildInstagramPublishPayload preserves legacy single-image posts", () => {
  assert.deepEqual(
    buildInstagramPublishPayload(
      { message: "caption", imageUrl: "https://example.com" },
      env
    ),
    {
      instagramUserId: "ig_1",
      pageAccessToken: "page_token",
      caption: "caption",
      imageUrl: "https://example.com/",
      imageUrls: ["https://example.com/"]
    }
  );
});

test("buildInstagramPublishPayload rejects invalid image inputs", () => {
  assert.throws(
    () => buildInstagramPublishPayload({ message: "caption", imageUrl: "ftp://example.com/image.png" }, env),
    /must use http or https/
  );
  assert.throws(
    () =>
      buildInstagramPublishPayload(
        { message: "caption", imageUrls: Array(11).fill("https://example.com/image.png") },
        env
      ),
    /supports at most 10 images/
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

test("direct scheduler execution loads secrets from a local .env", () => {
  const cwd = mkdtempSync(join(tmpdir(), "publish-scheduled-posts-env-"));
  const schedulerPath = new URL("../scripts/publish-scheduled-posts.js", import.meta.url).pathname;

  try {
    writeFileSync(
      join(cwd, ".env"),
      [
        "META_PAGE_ID=test_page",
        "META_PAGE_ACCESS_TOKEN=test_page_token",
        "INSTAGRAM_USER_ID=test_instagram",
        "THREADS_USER_ID=test_threads",
        "THREADS_ACCESS_TOKEN=test_threads_token"
      ].join("\n")
    );
    writeFileSync(join(cwd, "scheduled-posts.json"), JSON.stringify({ posts: [] }));

    const output = execFileSync(process.execPath, [schedulerPath], {
      cwd,
      env: withoutPublisherSecrets(process.env),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    assert.match(output, /Scheduled publisher finished\. Due posts: 0/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

for (const [name, imageUrls, expectedError] of [
  ["invalid URL", ["ftp://example.com/image.png"], /must use http or https/],
  ["11 images", Array(11).fill("https://example.com/image.png"), /supports at most 10 images/]
]) {
  test(`scheduler rejects mixed-platform ${name} before any publish request`, () => {
    const { schedule, networkCallsPath, cleanup } = runMixedPlatformSchedule(imageUrls);

    try {
      assert.equal(existsSync(networkCallsPath), false);
      assert.equal(schedule.posts[0].status, "failed");
      assert.equal(schedule.posts[0].results.length, 1);
      assert.equal(schedule.posts[0].results[0].platform, "instagram");
      assert.match(schedule.posts[0].results[0].error, expectedError);
    } finally {
      cleanup();
    }
  });
}

function runMixedPlatformSchedule(imageUrls) {
  const cwd = mkdtempSync(join(tmpdir(), "publish-scheduled-posts-mixed-"));
  const schedulerPath = new URL("../scripts/publish-scheduled-posts.js", import.meta.url).pathname;
  const preloadPath = join(cwd, "mock-fetch.mjs");
  const networkCallsPath = join(cwd, "meta-calls.log");
  const schedulePath = join(cwd, "scheduled-posts.json");

  writeFileSync(
    preloadPath,
    `import { appendFileSync } from "node:fs";
globalThis.fetch = async (url) => {
  appendFileSync(process.env.MOCK_META_CALLS_PATH, String(url) + "\\n");
  return new Response(JSON.stringify({ id: "mock_media" }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};
`
  );
  writeFileSync(
    schedulePath,
    JSON.stringify({
      posts: [
        {
          id: "mixed-invalid-instagram",
          scheduledAt: "2000-01-01T00:00:00.000Z",
          platforms: ["facebook", "instagram"],
          message: "Do not partially publish",
          imageUrl: "https://example.com/facebook.png",
          imageUrls,
          status: "queued"
        }
      ]
    })
  );

  try {
    execFileSync(process.execPath, ["--import", preloadPath, schedulerPath], {
      cwd,
      env: {
        ...withoutPublisherSecrets(process.env),
        META_PAGE_ID: "test_page",
        META_PAGE_ACCESS_TOKEN: "test_page_token",
        INSTAGRAM_USER_ID: "test_instagram",
        THREADS_USER_ID: "test_threads",
        THREADS_ACCESS_TOKEN: "test_threads_token",
        MOCK_META_CALLS_PATH: networkCallsPath
      },
      stdio: "pipe"
    });

    return {
      schedule: JSON.parse(readFileSync(schedulePath, "utf8")),
      networkCallsPath,
      cleanup: () => rmSync(cwd, { recursive: true, force: true })
    };
  } catch (error) {
    rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

function withoutPublisherSecrets(source) {
  const envCopy = { ...source };
  for (const name of [
    "META_PAGE_ID",
    "META_PAGE_ACCESS_TOKEN",
    "INSTAGRAM_USER_ID",
    "THREADS_USER_ID",
    "THREADS_ACCESS_TOKEN"
  ]) {
    delete envCopy[name];
  }
  return envCopy;
}
