import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  buildInstagramPublishPayload,
  buildThreadsPublishPayload
} from "../scripts/publish-scheduled-posts.js";

const env = {
  INSTAGRAM_USER_ID: "ig_1",
  META_PAGE_ACCESS_TOKEN: "page_token",
  THREADS_USER_ID: "threads_1",
  THREADS_ACCESS_TOKEN: "threads_token"
};

test("buildInstagramPublishPayload forwards carousel images", () => {
  assert.deepEqual(
    buildInstagramPublishPayload(
      {
        message: "caption",
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

test("buildInstagramPublishPayload forwards a Reel video URL", () => {
  assert.deepEqual(
    buildInstagramPublishPayload(
      {
        message: "reel caption",
        videoUrl: "https://example.com/reel.mp4"
      },
      env
    ),
    {
      instagramUserId: "ig_1",
      pageAccessToken: "page_token",
      caption: "reel caption",
      videoUrl: "https://example.com/reel.mp4"
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

test("buildInstagramPublishPayload rejects invalid or conflicting Reel inputs", () => {
  assert.throws(
    () =>
      buildInstagramPublishPayload(
        { message: "caption", videoUrl: "ftp://example.com/reel.mp4" },
        env
      ),
    /Instagram video must use http or https/
  );
  assert.throws(
    () =>
      buildInstagramPublishPayload(
        {
          message: "caption",
          imageUrl: "https://example.com/image.png",
          videoUrl: "https://example.com/reel.mp4"
        },
        env
      ),
    /requires exactly one of imageUrl, imageUrls, or videoUrl/
  );
});

test("buildThreadsPublishPayload forwards optional topicTag", () => {
  assert.deepEqual(
    buildThreadsPublishPayload(
      {
        message: "caption",
        imageUrl: "https://example.com/thread.png",
        topicTag: "人生"
      },
      env
    ),
    {
      threadsUserId: "threads_1",
      accessToken: "threads_token",
      text: "caption",
      imageUrl: "https://example.com/thread.png",
      topicTag: "人生"
    }
  );
});

test("buildThreadsPublishPayload preserves legacy posts without topicTag", () => {
  assert.deepEqual(buildThreadsPublishPayload({ message: "caption" }, env), {
    threadsUserId: "threads_1",
    accessToken: "threads_token",
    text: "caption",
    imageUrl: "",
    topicTag: ""
  });
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

test("direct scheduler execution loads secrets and SCHEDULE_FILE from a local .env", () => {
  const cwd = mkdtempSync(join(tmpdir(), "publish-scheduled-posts-env-"));
  const schedulerPath = new URL("../scripts/publish-scheduled-posts.js", import.meta.url).pathname;
  const customSchedulePath = join(cwd, "custom-schedule.json");

  try {
    writeFileSync(
      join(cwd, ".env"),
      [
        "META_PAGE_ID=test_page",
        "META_PAGE_ACCESS_TOKEN=test_page_token",
        "INSTAGRAM_USER_ID=test_instagram",
        "THREADS_USER_ID=test_threads",
        "THREADS_ACCESS_TOKEN=test_threads_token",
        `SCHEDULE_FILE=${customSchedulePath}`
      ].join("\n")
    );
    writeFileSync(customSchedulePath, JSON.stringify({ posts: [] }));

    const output = execFileSync(process.execPath, [schedulerPath], {
      cwd,
      env: withoutPublisherSecrets(process.env),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    assert.match(output, /Scheduled publisher finished\. Due posts: 0/);
    assert.equal(existsSync(join(cwd, "scheduled-posts.json")), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

for (const [name, media, expectedError] of [
  ["invalid URL", { imageUrls: ["ftp://example.com/image.png"] }, /must use http or https/],
  [
    "11 images",
    { imageUrls: Array(11).fill("https://example.com/image.png") },
    /supports at most 10 images/
  ],
  [
    "conflicting Reel media",
    {
      imageUrl: "https://example.com/image.png",
      videoUrl: "https://example.com/reel.mp4"
    },
    /requires exactly one of imageUrl, imageUrls, or videoUrl/
  ],
  [
    "invalid Reel URL",
    { videoUrl: "ftp://example.com/reel.mp4" },
    /Instagram video must use http or https/
  ]
]) {
  test(`scheduler rejects mixed-platform ${name} before any publish request`, () => {
    const { schedule, networkCallsPath, cleanup } = runMixedPlatformSchedule(media);

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

test("scheduler publishes a queued Instagram Reel with videoUrl", () => {
  const { schedule, calls, cleanup } = runInstagramReelSchedule();

  try {
    assert.equal(schedule.posts[0].status, "published");
    assert.equal(schedule.posts[0].results[0].platform, "instagram");
    assert.deepEqual(schedule.posts[0].results[0].result, { id: "reel_media_1" });
    assert.equal(calls[0].url.endsWith("/test_instagram/media"), true);
    assert.equal(calls[0].body.media_type, "REELS");
    assert.equal(calls[0].body.video_url, "https://example.com/reel.mp4");
    assert.equal(calls[0].body.caption, "Scheduled Reel");
    assert.equal(calls[2].url.endsWith("/test_instagram/media_publish"), true);
    assert.equal(calls[2].body.creation_id, "reel_container_1");
  } finally {
    cleanup();
  }
});

function runMixedPlatformSchedule(media) {
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
          ...media,
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

function runInstagramReelSchedule() {
  const cwd = mkdtempSync(join(tmpdir(), "publish-scheduled-reel-"));
  const schedulerPath = new URL("../scripts/publish-scheduled-posts.js", import.meta.url).pathname;
  const preloadPath = join(cwd, "mock-fetch.mjs");
  const callsPath = join(cwd, "meta-calls.jsonl");
  const schedulePath = join(cwd, "scheduled-posts.json");

  writeFileSync(
    preloadPath,
    `import { appendFileSync } from "node:fs";
globalThis.fetch = async (url, options = {}) => {
  const body = options.body instanceof URLSearchParams ? Object.fromEntries(options.body) : {};
  appendFileSync(process.env.MOCK_META_CALLS_PATH, JSON.stringify({ url: String(url), body }) + "\\n");
  if (String(url).endsWith("/test_instagram/media")) {
    return new Response(JSON.stringify({ id: "reel_container_1" }), { status: 200 });
  }
  if (String(url).includes("/reel_container_1?")) {
    return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
  }
  if (String(url).endsWith("/test_instagram/media_publish")) {
    return new Response(JSON.stringify({ id: "reel_media_1" }), { status: 200 });
  }
  throw new Error("Unexpected fetch: " + url);
};
`
  );
  writeFileSync(
    schedulePath,
    JSON.stringify({
      posts: [
        {
          id: "scheduled-reel",
          scheduledAt: "2000-01-01T00:00:00.000Z",
          platforms: ["instagram"],
          message: "Scheduled Reel",
          videoUrl: "https://example.com/reel.mp4",
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
        MOCK_META_CALLS_PATH: callsPath
      },
      stdio: "pipe"
    });

    return {
      schedule: JSON.parse(readFileSync(schedulePath, "utf8")),
      calls: readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
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
    "THREADS_ACCESS_TOKEN",
    "SCHEDULE_FILE"
  ]) {
    delete envCopy[name];
  }
  return envCopy;
}
