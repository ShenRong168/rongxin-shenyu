import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const checkConfigPath = new URL("../src/check-config.js", import.meta.url).pathname;

test("check-config rejects a scheduled-posts bare array", () => {
  const cwd = mkdtempSync(join(tmpdir(), "check-config-bare-array-"));
  const schedulePath = join(cwd, "scheduled-posts.json");

  try {
    writeFileSync(schedulePath, JSON.stringify([]));

    const result = runCheckConfig(cwd, schedulePath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /top-level.*object/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("check-config rejects a schedule without a posts array", () => {
  const cwd = mkdtempSync(join(tmpdir(), "check-config-missing-posts-"));
  const schedulePath = join(cwd, "scheduled-posts.json");

  try {
    writeFileSync(schedulePath, JSON.stringify({ posts: {} }));

    const result = runCheckConfig(cwd, schedulePath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /posts.*array/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("check-config rejects a post missing a required field", () => {
  const cwd = mkdtempSync(join(tmpdir(), "check-config-missing-field-"));
  const schedulePath = join(cwd, "scheduled-posts.json");

  try {
    writeFileSync(
      schedulePath,
      JSON.stringify({
        posts: [
          {
            id: "missing-status",
            scheduledAt: "2026-09-11T21:00:00+08:00",
            platforms: ["threads"],
            message: "A test post"
          }
        ]
      })
    );

    const result = runCheckConfig(cwd, schedulePath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /post 0.*status/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function runCheckConfig(cwd, schedulePath) {
  return spawnSync(process.execPath, [checkConfigPath], {
    cwd,
    env: {
      ...process.env,
      META_APP_ID: "test-meta-app",
      META_APP_SECRET: "test-meta-secret",
      THREADS_APP_ID: "test-threads-app",
      THREADS_APP_SECRET: "test-threads-secret",
      SCHEDULE_FILE: schedulePath
    },
    encoding: "utf8"
  });
}
