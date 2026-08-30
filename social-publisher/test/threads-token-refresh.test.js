import assert from "node:assert/strict";
import test from "node:test";
import {
  refreshThreadsTokenIfNeeded,
  shouldRefreshThreadsToken
} from "../scripts/refresh-threads-token.js";

const now = new Date("2026-08-30T12:00:00.000Z");

test("shouldRefreshThreadsToken waits when the token has enough lifetime", () => {
  assert.equal(
    shouldRefreshThreadsToken(
      { expiresAt: "2026-10-01T12:00:00.000Z" },
      { now, refreshWithinDays: 14 }
    ),
    false
  );
});

test("shouldRefreshThreadsToken refreshes when the token is inside the threshold", () => {
  assert.equal(
    shouldRefreshThreadsToken(
      { expiresAt: "2026-09-05T12:00:00.000Z" },
      { now, refreshWithinDays: 14 }
    ),
    true
  );
});

test("shouldRefreshThreadsToken refreshes when expiry metadata is unknown", () => {
  assert.equal(shouldRefreshThreadsToken({ expiresIn: 5184000 }, { now, refreshWithinDays: 14 }), true);
});

test("refreshThreadsTokenIfNeeded updates the local store and GitHub secret", async () => {
  const savedStates = [];
  const secrets = [];
  const calls = [];
  const state = {
    threads: {
      accessToken: "old_threads_token",
      expiresAt: "2026-09-05T12:00:00.000Z",
      userId: "threads_user",
      username: "yogo918"
    }
  };

  const result = await refreshThreadsTokenIfNeeded({
    now,
    refreshWithinDays: 14,
    loadStore: async () => state,
    saveStore: async (nextState) => savedStates.push(nextState),
    debugAccessToken: async (accessToken) => {
      calls.push(["debug", accessToken]);
      return {
        isValid: true,
        expiresAt: "2026-09-05T12:00:00.000Z",
        issuedAt: "2026-07-07T12:00:00.000Z",
        userId: "threads_user"
      };
    },
    refreshAccessToken: async (accessToken) => {
      calls.push(["refresh", accessToken]);
      return {
        accessToken: "new_threads_token",
        tokenType: "bearer",
        expiresIn: 5184000
      };
    },
    setGitHubSecret: async (name, value) => secrets.push({ name, value }),
    log: () => {}
  });

  assert.equal(result.status, "refreshed");
  assert.deepEqual(calls, [
    ["debug", "old_threads_token"],
    ["refresh", "old_threads_token"]
  ]);
  assert.deepEqual(secrets, [{ name: "THREADS_ACCESS_TOKEN", value: "new_threads_token" }]);
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].threads.accessToken, "new_threads_token");
  assert.equal(savedStates[0].threads.expiresIn, 5184000);
  assert.equal(savedStates[0].threads.refreshedAt, "2026-08-30T12:00:00.000Z");
  assert.equal(savedStates[0].threads.expiresAt, "2026-10-29T12:00:00.000Z");
  assert.equal(savedStates[0].threads.userId, "threads_user");
  assert.equal(savedStates[0].threads.username, "yogo918");
});

test("refreshThreadsTokenIfNeeded skips GitHub secret writes when no refresh is needed", async () => {
  let secretWrites = 0;
  let storeWrites = 0;

  const result = await refreshThreadsTokenIfNeeded({
    now,
    refreshWithinDays: 14,
    loadStore: async () => ({ threads: { accessToken: "current_token" } }),
    saveStore: async () => {
      storeWrites += 1;
    },
    debugAccessToken: async () => ({
      isValid: true,
      expiresAt: "2026-10-29T12:00:00.000Z",
      issuedAt: "2026-08-30T12:00:00.000Z"
    }),
    refreshAccessToken: async () => {
      throw new Error("refresh should not be called");
    },
    setGitHubSecret: async () => {
      secretWrites += 1;
    },
    log: () => {}
  });

  assert.equal(result.status, "skipped");
  assert.equal(secretWrites, 0);
  assert.equal(storeWrites, 0);
});

test("refreshThreadsTokenIfNeeded does not update the local token when GitHub secret update fails", async () => {
  let storeWrites = 0;

  await assert.rejects(
    refreshThreadsTokenIfNeeded({
      now,
      refreshWithinDays: 14,
      loadStore: async () => ({
        threads: {
          accessToken: "old_threads_token",
          expiresAt: "2026-09-01T12:00:00.000Z"
        }
      }),
      saveStore: async () => {
        storeWrites += 1;
      },
      debugAccessToken: async () => ({
        isValid: true,
        expiresAt: "2026-09-01T12:00:00.000Z"
      }),
      refreshAccessToken: async () => ({
        accessToken: "new_threads_token",
        tokenType: "bearer",
        expiresIn: 5184000
      }),
      setGitHubSecret: async () => {
        throw new Error("gh secret set failed");
      },
      log: () => {}
    }),
    /Failed to update GitHub Secret THREADS_ACCESS_TOKEN/
  );

  assert.equal(storeWrites, 0);
});

test("refreshThreadsTokenIfNeeded asks for manual OAuth when debug shows an invalid token", async () => {
  await assert.rejects(
    refreshThreadsTokenIfNeeded({
      now,
      loadStore: async () => ({ threads: { accessToken: "expired_token" } }),
      saveStore: async () => {},
      debugAccessToken: async () => ({ isValid: false, expiresAt: "2026-08-29T12:00:00.000Z" }),
      refreshAccessToken: async () => {
        throw new Error("refresh should not be called");
      },
      setGitHubSecret: async () => {},
      log: () => {}
    }),
    /Threads access token is invalid or expired; Shen must rerun OAuth authorization/
  );
});
