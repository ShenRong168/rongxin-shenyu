import { execSync } from "node:child_process";

const SCHEDULE_FILE = "scheduled-posts.json";

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function checkScheduleSync() {
  const dirty = git(`status --porcelain -- ${SCHEDULE_FILE}`);
  if (dirty === null) return null; // not a git repo / git unavailable — nothing to warn about

  if (dirty !== "") {
    return `local ${SCHEDULE_FILE} has uncommitted changes — the GitHub Actions publisher only sees what's pushed to origin, it will keep acting on the last-pushed version until you commit + push.`;
  }

  const upstream = git("rev-parse --abbrev-ref --symbolic-full-name @{u}");
  const remoteRef = upstream || "origin/main";
  const ahead = git(`log ${remoteRef}..HEAD --oneline -- ${SCHEDULE_FILE}`);
  if (ahead) {
    return `local commits touching ${SCHEDULE_FILE} haven't been pushed to ${remoteRef} yet — the GitHub Actions publisher won't see them until you push.`;
  }

  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const warning = checkScheduleSync();
  if (warning) {
    console.warn(`⚠️  ${warning}`);
    process.exitCode = 1;
  } else {
    console.log(`${SCHEDULE_FILE} is in sync with the remote.`);
  }
}
