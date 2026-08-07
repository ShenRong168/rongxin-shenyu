import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const publisherDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("local publisher renders and dry-runs an Instagram carousel", async (t) => {
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
          imageUrl: "https://example.com/legacy.png",
          imageUrls: scheduleImageUrls,
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
globalThis.fetch = async (url) => {
  appendFileSync(process.env.MOCK_META_CALLS_PATH, String(url) + "\\n");
  return new Response(JSON.stringify({ id: "mock_media" }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
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
  assert.match(home, /<input type="checkbox" name="dryRun" checked>/);
  assert.match(home, /<img src="https:\/\/example\.com\/schedule-first\.png" alt="">/);
  assert.doesNotMatch(home, /<img src="https:\/\/example\.com\/schedule-second\.png" alt="">/);
  assert.match(home, /輪播 2 張/);

  const imageUrls = " https://example.com \nhttps://example.com/two.png";
  const response = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    body: new URLSearchParams({
      platforms: "instagram",
      message: "Carousel dry run",
      imageUrl: "ftp://example.com/ignored.png",
      imageUrls,
      dryRun: "on"
    })
  });
  const result = await response.text();

  assert.equal(response.status, 200);
  assert.match(result, /&quot;dryRun&quot;: true/);
  assert.match(result, /&quot;imageUrls&quot;: \[/);
  assert.match(result, /https:\/\/example\.com\/(?=&quot;)/);
  assert.doesNotMatch(result, /ftp:\/\/example\.com\/ignored\.png/);
  assert.ok(result.indexOf("https://example.com/") < result.indexOf("https://example.com/two.png"));

  const singleImageUrl = "https://example.com/single.png";
  const facebookThreadsResponse = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    body: new URLSearchParams([
      ["platforms", "facebook"],
      ["platforms", "threads"],
      ["message", "Single-image dry run"],
      ["imageUrl", singleImageUrl],
      ["imageUrls", imageUrls],
      ["dryRun", "on"]
    ])
  });
  const facebookThreadsResult = await facebookThreadsResponse.text();

  assert.equal(facebookThreadsResponse.status, 200);
  assert.match(facebookThreadsResult, /&quot;dryRun&quot;: true/);
  assert.match(facebookThreadsResult, /https:\/\/example\.com\/single\.png/);
  assert.doesNotMatch(facebookThreadsResult, /&quot;imageUrls&quot;/);
  assert.doesNotMatch(facebookThreadsResult, /https:\/\/example\.com\/one\.png/);
  assert.doesNotMatch(facebookThreadsResult, /https:\/\/example\.com\/two\.png/);

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
      ["imageUrls", "ftp://example.com/instagram.png"]
    ])
  });
  assert.equal(mixedPlatformResponse.status, 400);
  assert.match(await mixedPlatformResponse.text(), /must use http or https/);
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
