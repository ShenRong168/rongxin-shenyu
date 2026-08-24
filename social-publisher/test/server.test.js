import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const publisherDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("local publisher renders and dry-runs Instagram carousel and Reel media", async (t) => {
  const port = await unusedPort();
  const tokenDir = await mkdtemp(join(tmpdir(), "rongxin-carousel-server-test-"));
  const tokenStorePath = join(tokenDir, "tokens.json");
  const schedulePath = join(tokenDir, "scheduled-posts.json");
  const networkCallsPath = join(tokenDir, "meta-calls.log");
  const fetchPreloadPath = join(tokenDir, "mock-fetch.mjs");
  const scheduleImageUrls = [
    "https://example.com/schedule-first.png",
    "https://example.com/schedule-second.png"
  ];
  await writeFile(
    schedulePath,
    JSON.stringify({
      posts: [
        {
          id: "test-carousel",
          scheduledAt: "2026-08-07T09:00:00+08:00",
          platforms: ["instagram"],
          message: "Test carousel schedule",
          imageUrls: scheduleImageUrls,
          status: "queued"
        },
        {
          id: "test-reel",
          scheduledAt: "2026-08-08T09:00:00+08:00",
          platforms: ["instagram"],
          message: "Test Reel schedule",
          videoUrl: "https://example.com/scheduled-reel.mp4",
          status: "queued"
        }
      ]
    })
  );
  await writeFile(
    tokenStorePath,
    JSON.stringify({
      pages: [
        {
          id: "page_1",
          name: "Test Page",
          accessToken: "fake_page_token",
          instagramBusinessAccount: { id: "ig_1" }
        }
      ],
      selectedPageId: "page_1",
      selectedInstagramUserId: "ig_1"
    })
  );
  await writeFile(
    fetchPreloadPath,
    `import { appendFileSync } from "node:fs";
let mediaCreateCount = 0;
globalThis.fetch = async (url, options = {}) => {
  const body = options.body instanceof URLSearchParams ? Object.fromEntries(options.body) : {};
  appendFileSync(process.env.MOCK_META_CALLS_PATH, JSON.stringify({ url: String(url), body }) + "\\n");
  if (String(url).endsWith("/page_1/photos")) {
    return new Response(JSON.stringify({ id: "facebook_media_1" }), { status: 200 });
  }
  if (String(url).endsWith("/ig_1/media")) {
    mediaCreateCount += 1;
    return new Response(JSON.stringify({ id: "container_" + mediaCreateCount }), { status: 200 });
  }
  if (String(url).includes("/container_") && String(url).includes("?")) {
    return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
  }
  if (String(url).endsWith("/ig_1/media_publish")) {
    return new Response(JSON.stringify({ id: "instagram_media_1" }), { status: 200 });
  }
  throw new Error("Unexpected fetch: " + url);
};
`
  );
  const output = [];
  const server = spawn(process.execPath, ["--import", fetchPreloadPath, "src/server.js"], {
    cwd: publisherDir,
    env: {
      ...process.env,
      PORT: String(port),
      TOKEN_STORE_PATH: tokenStorePath,
      SCHEDULE_FILE: schedulePath,
      MOCK_META_CALLS_PATH: networkCallsPath,
      SCHEDULE_SYNC_NO_FETCH: "1",
      META_APP_ID: "",
      META_APP_SECRET: "",
      THREADS_APP_ID: "",
      THREADS_APP_SECRET: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  server.stdout.on("data", (chunk) => output.push(chunk.toString()));
  server.stderr.on("data", (chunk) => output.push(chunk.toString()));
  t.after(async () => {
    await stopServer(server);
    await rm(tokenDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, output);

  const home = await (await fetch(`${baseUrl}/`)).text();
  assert.match(home, /<textarea id="imageUrls" name="imageUrls" rows="5"/);
  assert.match(home, /<input id="videoUrl" name="videoUrl" type="url"/);
  assert.match(home, /<input type="checkbox" name="dryRun" checked>/);
  assert.match(home, /<img src="https:\/\/example\.com\/schedule-first\.png" alt="">/);
  assert.doesNotMatch(home, /<img src="https:\/\/example\.com\/schedule-second\.png" alt="">/);
  assert.match(home, /輪播 2 張/);
  assert.match(home, /<div class="video-placeholder">Reel<\/div>/);
  assert.match(home, /影片：https:\/\/example\.com\/scheduled-reel\.mp4/);

  const imageUrls = " https://example.com \nhttps://example.com/two.png";
  const response = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    body: new URLSearchParams({
      platforms: "instagram",
      message: "Carousel dry run",
      imageUrls,
      dryRun: "on"
    })
  });
  const result = await response.text();

  assert.equal(response.status, 200);
  assert.match(result, /&quot;dryRun&quot;: true/);
  assert.match(result, /&quot;imageUrls&quot;: \[/);
  assert.match(result, /https:\/\/example\.com\/(?=&quot;)/);
  assert.ok(result.indexOf("https://example.com/") < result.indexOf("https://example.com/two.png"));

  await rm(networkCallsPath, { force: true });
  const videoUrl = "https://example.com/reel.mp4";
  const reelResponse = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    body: new URLSearchParams({
      platforms: "instagram",
      message: "Reel dry run",
      videoUrl,
      dryRun: "on"
    })
  });
  const reelResult = await reelResponse.text();

  assert.equal(reelResponse.status, 200);
  assert.match(reelResult, /&quot;dryRun&quot;: true/);
  assert.match(reelResult, /&quot;videoUrl&quot;: &quot;https:\/\/example\.com\/reel\.mp4&quot;/);
  assert.doesNotMatch(reelResult, /&quot;imageUrl&quot;/);
  assert.doesNotMatch(reelResult, /&quot;imageUrls&quot;/);
  await assert.rejects(readFile(networkCallsPath), { code: "ENOENT" });

  const storedAfterReel = JSON.parse(await readFile(tokenStorePath, "utf8"));
  assert.equal(storedAfterReel.publishLog[0].videoUrl, videoUrl);
  assert.equal(storedAfterReel.publishLog[0].imageUrl, "");
  assert.deepEqual(storedAfterReel.publishLog[0].imageUrls, []);

  const singleImageUrl = "https://example.com/single.png";
  const facebookThreadsResponse = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    body: new URLSearchParams([
      ["platforms", "facebook"],
      ["platforms", "threads"],
      ["message", "Single-image dry run"],
      ["imageUrl", singleImageUrl],
      ["imageUrls", imageUrls],
      ["videoUrl", videoUrl],
      ["dryRun", "on"]
    ])
  });
  const facebookThreadsResult = await facebookThreadsResponse.text();

  assert.equal(facebookThreadsResponse.status, 200);
  assert.match(facebookThreadsResult, /&quot;dryRun&quot;: true/);
  assert.match(facebookThreadsResult, /https:\/\/example\.com\/single\.png/);
  assert.doesNotMatch(facebookThreadsResult, /&quot;imageUrls&quot;/);
  assert.doesNotMatch(facebookThreadsResult, /&quot;videoUrl&quot;/);
  assert.doesNotMatch(facebookThreadsResult, /https:\/\/example\.com\/one\.png/);
  assert.doesNotMatch(facebookThreadsResult, /https:\/\/example\.com\/two\.png/);

  await rm(networkCallsPath, { force: true });
  const mixedValidResponse = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    body: new URLSearchParams([
      ["platforms", "facebook"],
      ["platforms", "instagram"],
      ["message", "Valid mixed image"],
      ["imageUrl", singleImageUrl]
    ])
  });
  const mixedValidResult = await mixedValidResponse.text();
  assert.equal(mixedValidResponse.status, 200);
  assert.match(mixedValidResult, /facebook_media_1/);
  assert.match(mixedValidResult, /instagram_media_1/);
  const mixedValidCalls = (await readFile(networkCallsPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(mixedValidCalls[0].url.endsWith("/page_1/photos"), true);
  assert.equal(mixedValidCalls[1].url.endsWith("/ig_1/media"), true);
  assert.equal(mixedValidCalls[1].body.image_url, singleImageUrl);

  const invalidUrlResponse = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    body: new URLSearchParams({
      platforms: "instagram",
      message: "Invalid protocol",
      imageUrls: "ftp://example.com/image.png",
      dryRun: "on"
    })
  });
  assert.equal(invalidUrlResponse.status, 400);
  assert.match(await invalidUrlResponse.text(), /must use http or https/);

  const tooManyImagesResponse = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    body: new URLSearchParams({
      platforms: "instagram",
      message: "Too many images",
      imageUrls: Array.from({ length: 11 }, (_, index) => `https://example.com/${index}.png`).join("\n"),
      dryRun: "on"
    })
  });
  assert.equal(tooManyImagesResponse.status, 400);
  assert.match(await tooManyImagesResponse.text(), /supports at most 10 images/);

  await rm(networkCallsPath, { force: true });
  const mixedPlatformResponse = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    body: new URLSearchParams([
      ["platforms", "facebook"],
      ["platforms", "instagram"],
      ["message", "Reject before publishing"],
      ["imageUrl", "https://example.com/facebook.png"],
      ["videoUrl", "https://example.com/reel.mp4"]
    ])
  });
  assert.equal(mixedPlatformResponse.status, 400);
  assert.match(
    await mixedPlatformResponse.text(),
    /requires exactly one of imageUrl, imageUrls, or videoUrl/
  );
  await assert.rejects(readFile(networkCallsPath), { code: "ENOENT" });
});

async function unusedPort() {
  const server = createServer();
  await new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePort);
  });
  const { port } = server.address();
  await new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
  return port;
}

async function waitForHealth(baseUrl, output) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The child server has not started listening yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }

  throw new Error(`Server did not become healthy. Output:\n${output.join("")}`);
}

async function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) return;

  const exited = new Promise((resolveExit) => server.once("exit", resolveExit));
  server.kill("SIGTERM");
  let timeout;
  const exitedGracefully = await Promise.race([
    exited.then(() => true),
    new Promise((resolveDelay) => {
      timeout = setTimeout(() => resolveDelay(false), 5_000);
    })
  ]);
  clearTimeout(timeout);

  if (!exitedGracefully) {
    server.kill("SIGKILL");
    await exited;
  }
}
