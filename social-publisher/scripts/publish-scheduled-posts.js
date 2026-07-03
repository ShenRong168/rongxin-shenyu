import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  publishFacebookPage,
  publishInstagram,
  publishThreads
} from "../src/meta-service.js";

const schedulePath = resolve(process.env.SCHEDULE_FILE || "scheduled-posts.json");

const requiredSecrets = [
  "META_PAGE_ID",
  "META_PAGE_ACCESS_TOKEN",
  "INSTAGRAM_USER_ID",
  "THREADS_USER_ID",
  "THREADS_ACCESS_TOKEN"
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function assertSecrets() {
  for (const name of requiredSecrets) {
    requireEnv(name);
  }
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

async function publishPlatform(platform, post) {
  if (platform === "facebook") {
    return publishFacebookPage({
      pageId: requireEnv("META_PAGE_ID"),
      pageAccessToken: requireEnv("META_PAGE_ACCESS_TOKEN"),
      message: post.message,
      link: post.link || "",
      imageUrl: post.imageUrl || ""
    });
  }

  if (platform === "instagram") {
    return publishInstagram({
      instagramUserId: requireEnv("INSTAGRAM_USER_ID"),
      pageAccessToken: requireEnv("META_PAGE_ACCESS_TOKEN"),
      caption: post.message,
      imageUrl: post.imageUrl || ""
    });
  }

  if (platform === "threads") {
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

  for (const platform of post.platforms || []) {
    try {
      const result = await publishPlatform(platform, post);
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

async function main() {
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
