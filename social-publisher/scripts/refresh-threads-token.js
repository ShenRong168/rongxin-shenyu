import dotenv from "dotenv";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  debugThreadsAccessToken,
  refreshThreadsAccessToken
} from "../src/meta-service.js";
import { loadStore, saveStore } from "../src/store.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const defaultRefreshWithinDays = 14;
const defaultSecretName = "THREADS_ACCESS_TOKEN";
const defaultRepository = "ShenRong168/rongxin-shenyu";

export function shouldRefreshThreadsToken(token, options = {}) {
  const now = toDate(options.now);
  const refreshWithinDays = Number(options.refreshWithinDays ?? defaultRefreshWithinDays);
  const expiresAt = resolveExpiresAt(token, now);

  if (!expiresAt) return true;
  return expiresAt.getTime() - now.getTime() <= refreshWithinDays * millisecondsPerDay;
}

export async function refreshThreadsTokenIfNeeded(options = {}) {
  const now = toDate(options.now);
  const env = options.env || process.env;
  const log = options.log || console.log;
  const refreshWithinDays = Number(
    options.refreshWithinDays ?? env.THREADS_REFRESH_WITHIN_DAYS ?? defaultRefreshWithinDays
  );
  const secretName = options.secretName || env.THREADS_ACCESS_TOKEN_SECRET_NAME || defaultSecretName;
  const state = await (options.loadStore || loadStore)();
  const existingThreads = state.threads || {};
  const accessToken = existingThreads.accessToken || env.THREADS_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("Missing Threads access token. Connect Threads locally or set THREADS_ACCESS_TOKEN.");
  }

  const metadata = await inspectToken({
    accessToken,
    debugAccessToken: env.THREADS_DEBUG_ACCESS_TOKEN || accessToken,
    existingThreads,
    debugAccessTokenFn: options.debugAccessToken || debugThreadsAccessToken,
    log
  });

  if (metadata && !metadata.isValid) {
    throw new Error(
      "Threads access token is invalid or expired; Shen must rerun OAuth authorization before it can be refreshed."
    );
  }

  const tokenWithMetadata = {
    ...existingThreads,
    issuedAt: metadata?.issuedAt || existingThreads.issuedAt || null,
    expiresAt: metadata?.expiresAt || existingThreads.expiresAt || null
  };

  if (!shouldRefreshThreadsToken(tokenWithMetadata, { now, refreshWithinDays })) {
    const expiresAt = resolveExpiresAt(tokenWithMetadata, now);
    log(
      `Threads token still has ${formatDaysUntil(expiresAt, now)} days left; refresh threshold is ${refreshWithinDays} days.`
    );
    return {
      status: "skipped",
      expiresAt: expiresAt?.toISOString() || null,
      daysRemaining: expiresAt ? daysUntil(expiresAt, now) : null
    };
  }

  const refreshed = await (options.refreshAccessToken || refreshThreadsAccessToken)(accessToken);
  const nextThreads = mergeRefreshedThreadsToken(existingThreads, refreshed, now, metadata);

  try {
    await (options.setGitHubSecret || setGitHubSecret)(secretName, nextThreads.accessToken, {
      env,
      repository: env.GITHUB_REPOSITORY || defaultRepository
    });
  } catch (error) {
    throw new Error(`Failed to update GitHub Secret ${secretName}: ${error.message}`, {
      cause: error
    });
  }

  await (options.saveStore || saveStore)({
    ...state,
    threads: nextThreads
  });

  log(`Threads token refreshed; new expiry: ${nextThreads.expiresAt || "unknown"}.`);
  return {
    status: "refreshed",
    expiresAt: nextThreads.expiresAt || null,
    daysRemaining: nextThreads.expiresAt ? daysUntil(new Date(nextThreads.expiresAt), now) : null
  };
}

export function mergeRefreshedThreadsToken(existingThreads, refreshed, now = new Date(), metadata = null) {
  const issuedAt = toDate(now);
  const expiresAt =
    typeof refreshed.expiresIn === "number"
      ? new Date(issuedAt.getTime() + refreshed.expiresIn * 1000).toISOString()
      : metadata?.expiresAt || existingThreads.expiresAt || null;

  return {
    ...existingThreads,
    accessToken: refreshed.accessToken,
    tokenType: refreshed.tokenType || existingThreads.tokenType || "bearer",
    expiresIn: refreshed.expiresIn ?? existingThreads.expiresIn ?? null,
    issuedAt: issuedAt.toISOString(),
    refreshedAt: issuedAt.toISOString(),
    expiresAt,
    userId: metadata?.userId || existingThreads.userId || null,
    username: existingThreads.username || null
  };
}

export async function setGitHubSecret(secretName, value, options = {}) {
  const env = { ...process.env, ...(options.env || {}) };
  if (!env.GH_TOKEN && env.GH_SECRETS_TOKEN) {
    env.GH_TOKEN = env.GH_SECRETS_TOKEN;
  }
  if (env.GITHUB_ACTIONS === "true" && !env.GH_TOKEN) {
    throw new Error("Missing GH_SECRETS_TOKEN; GitHub Actions cannot update repository secrets without it.");
  }

  const repository = options.repository || env.GITHUB_REPOSITORY || defaultRepository;
  await runSecretCommand(secretName, value, repository, env);
}

async function inspectToken({
  accessToken,
  debugAccessToken,
  existingThreads,
  debugAccessTokenFn,
  log
}) {
  try {
    return await debugAccessTokenFn(accessToken, debugAccessToken);
  } catch (error) {
    if (!resolveExpiresAt(existingThreads, new Date())) {
      throw new Error(`Unable to inspect Threads access token expiry: ${error.message}`, {
        cause: error
      });
    }
    log(`Unable to inspect Threads token through debug_token; using local expiry metadata. ${error.message}`);
    return null;
  }
}

function runSecretCommand(secretName, value, repository, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["secret", "set", secretName, "--repo", repository], {
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || `gh secret set exited with code ${code}`));
    });
    child.stdin.end(value);
  });
}

function resolveExpiresAt(token, now) {
  if (token?.expiresAt) return new Date(token.expiresAt);
  if (token?.issuedAt && typeof token.expiresIn === "number") {
    return new Date(new Date(token.issuedAt).getTime() + token.expiresIn * 1000);
  }
  if (token?.refreshedAt && typeof token.expiresIn === "number") {
    return new Date(new Date(token.refreshedAt).getTime() + token.expiresIn * 1000);
  }
  return null;
}

function formatDaysUntil(expiresAt, now) {
  if (!expiresAt) return "unknown";
  return daysUntil(expiresAt, now).toFixed(1);
}

function daysUntil(expiresAt, now) {
  return (expiresAt.getTime() - now.getTime()) / millisecondsPerDay;
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (value) return new Date(value);
  return new Date();
}

async function runFromCommandLine() {
  dotenv.config();
  await refreshThreadsTokenIfNeeded();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromCommandLine().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
