import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeInstagramImageUrls } from "../src/instagram-images.js";

const schedulePath = resolve(process.env.SCHEDULE_FILE || "scheduled-posts.json");

const requiredSecrets = [
  "META_PAGE_ID",
  "META_PAGE_ACCESS_TOKEN",
  "INSTAGRAM_USER_ID",
  "THREADS_USER_ID",
  "THREADS_ACCESS_TOKEN"
];

function requireEnv(name, env = process.env) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function buildInstagramPublishPayload(post, env = process.env) {
  const imageUrls = normalizeInstagramImageUrls({
    imageUrl: post.imageUrl || "",
    imageUrls: post.imageUrls
  });

  return {
    instagramUserId: requireEnv("INSTAGRAM_USER_ID", env),
    pageAccessToken: requireEnv("META_PAGE_ACCESS_TOKEN", env),
    caption: post.message,
    imageUrl: imageUrls[0],
    imageUrls
  };
}

function assertSecrets() {
  for (const name of requiredSecrets) {
    requireEnv(name);
  }
}

let metaService;

async function loadMetaService() {
  metaService ||= await import("../src/meta-service.js");
  return metaService;
}

async function loadSchedule() {
  const raw = await readFile(schedulePath, "utf8");
  return JSON.parse(raw);
}

async function saveSchedule(schedule) {
  await writeFile(schedulePath, `${JSON.stringify(schedule, null, 2)}\n`);
}

function isDue(post, now) {
  if (post.status && post.status !== "queued") return false;
  if (!post.scheduledAt) return false;
  return new Date(post.scheduledAt).getTime() <= now.getTime();
}

async function publishPlatform(platform, post, instagramPayload) {
  if (platform === "facebook") {
    const { publishFacebookPage } = await loadMetaService();
    return publishFacebookPage({
      pageId: requireEnv("META_PAGE_ID"),
      pageAccessToken: requireEnv("META_PAGE_ACCESS_TOKEN"),
      message: post.message,
      link: post.link || "",
      imageUrl: post.imageUrl || ""
    });
  }

  if (platform === "instagram") {
    const { publishInstagram } = await loadMetaService();
    return publishInstagram(instagramPayload);
  }

  if (platform === "threads") {
    const { publishThreads } = await loadMetaService();
    return publishThreads({
      threadsUserId: requireEnv("THREADS_USER_ID"),
      accessToken: requireEnv("THREADS_ACCESS_TOKEN"),
      text: post.message,
      imageUrl: post.imageUrl || ""
    });
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

async function publishPost(post) {
  const results = [];
  let instagramPayload;

  if ((post.platforms || []).includes("instagram")) {
    try {
      instagramPayload = buildInstagramPublishPayload(post);
    } catch (error) {
      return {
        ...post,
        status: "failed",
        publishedAt: new Date().toISOString(),
        results: [{ platform: "instagram", error: error.message }]
      };
    }
  }

  for (const platform of post.platforms || []) {
    try {
      const result = await publishPlatform(platform, post, instagramPayload);
      results.push({ platform, result });
    } catch (error) {
      results.push({ platform, error: error.message });
    }
  }

  const hasError = results.some((result) => result.error);
  return {
    ...post,
    status: hasError ? "failed" : "published",
    publishedAt: new Date().toISOString(),
    results
  };
}

export async function main() {
  assertSecrets();

  const now = new Date();
  const schedule = await loadSchedule();
  const posts = [];
  let dueCount = 0;

  for (const post of schedule.posts || []) {
    if (!isDue(post, now)) {
      posts.push(post);
      continue;
    }

    dueCount += 1;
    console.log(`Publishing scheduled post: ${post.id || "(no id)"}`);
    posts.push(await publishPost(post));
  }

  console.log(`Scheduled publisher finished. Due posts: ${dueCount}`);
  if (!dueCount) return;

  await saveSchedule({
    ...schedule,
    lastRunAt: now.toISOString(),
    posts
  });
}

async function runFromCommandLine() {
  const { default: dotenv } = await import("dotenv");
  dotenv.config();
  await main();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromCommandLine().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
