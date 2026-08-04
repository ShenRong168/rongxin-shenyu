import { execSync } from "node:child_process";

const SCHEDULE_FILE = "scheduled-posts.json";
const FETCH_TIMEOUT_MS = 10_000;

function git(args, options = {}) {
  try {
    return execSync(`git ${args}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      ...options
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Warn when the local scheduled-posts.json and origin have drifted apart.
 *
 * Both directions matter, and they fail in different ways:
 *
 * - local ahead  → the GitHub Actions publisher never sees the edit, so it keeps
 *   publishing the last-pushed version. Caused two accidental publishes
 *   (2026-07-17, 2026-07-20) where a post edited to `paused` went out anyway.
 * - local behind → the publisher already ran and committed `published` back to
 *   origin, but the local file still says `queued`. Nothing is mis-published,
 *   but anyone reading local `status` draws the wrong conclusion. On 2026-08-04
 *   this made three already-published posts look like they had been missed.
 *
 * Returns an array of warning strings (empty when in sync).
 */
export function checkScheduleSync() {
  const warnings = [];

  const dirty = git(`status --porcelain -- ${SCHEDULE_FILE}`);
  if (dirty === null) return warnings; // not a git repo / git unavailable — nothing to warn about

  if (dirty !== "") {
    warnings.push(
      `local ${SCHEDULE_FILE} has uncommitted changes — the GitHub Actions publisher only sees what's pushed to origin, it will keep acting on the last-pushed version until you commit + push.`
    );
  }

  const upstream = git("rev-parse --abbrev-ref --symbolic-full-name @{u}");
  const remoteRef = upstream || "origin/main";
  if (git(`rev-parse --verify --quiet ${remoteRef}`) === null) {
    warnings.push(`cannot resolve ${remoteRef} — skipped the origin comparison for ${SCHEDULE_FILE}.`);
    return warnings;
  }

  // The behind-check is only meaningful against a fresh remote ref. Without this
  // fetch a stale local ref reports "in sync" while origin is already ahead —
  // which is exactly how the 2026-08-04 misread slipped through.
  const skipFetch = process.env.SCHEDULE_SYNC_NO_FETCH === "1";
  const fetched = skipFetch ? null : git("fetch --quiet", { timeout: FETCH_TIMEOUT_MS });
  if (!skipFetch && fetched === null) {
    warnings.push(
      `could not reach the remote (git fetch failed or timed out) — the check below used a possibly stale ${remoteRef}, so "in sync" is not trustworthy right now.`
    );
  }

  const ahead = git(`log ${remoteRef}..HEAD --oneline -- ${SCHEDULE_FILE}`);
  if (ahead) {
    warnings.push(
      `local commits touching ${SCHEDULE_FILE} haven't been pushed to ${remoteRef} yet — the GitHub Actions publisher won't see them until you push.`
    );
  }

  const behind = git(`log HEAD..${remoteRef} --oneline -- ${SCHEDULE_FILE}`);
  if (behind) {
    const count = behind.split("\n").length;
    warnings.push(
      `${remoteRef} has ${count} commit(s) touching ${SCHEDULE_FILE} that you don't have locally — the publisher writes post status back to origin, so your local statuses are out of date. Run \`git pull\` before trusting them.`
    );
  }

  return warnings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const warnings = checkScheduleSync();
  if (warnings.length) {
    for (const warning of warnings) {
      console.warn(`⚠️  ${warning}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`${SCHEDULE_FILE} is in sync with the remote.`);
  }
}
