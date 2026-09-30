import assert from "node:assert/strict";
import test from "node:test";
import { notifyLineAlerts } from "../src/line-alert.js";

const alerts = [{ id: "post-123", reason: "publish failed" }];

test("broadcasts an alert only when the verified follower count is exactly one", async () => {
  const calls = [];
  const result = await notifyLineAlerts({
    alerts,
    env: lineEnv(),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/state")) {
        return Response.json({ count: 1, webhookVerifiedAt: "2026-09-30T00:00:00.000Z" });
      }
      return Response.json({}, { status: 200 });
    }
  });

  assert.deepEqual(result, { status: "sent", alertCount: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://api.line.me/v2/bot/message/broadcast");
  assert.equal(calls[1].options.headers.authorization, "Bearer channel-token");
  assert.match(JSON.parse(calls[1].options.body).messages[0].text, /post-123/);
});

test("skips broadcast when follower count is greater than one", async () => {
  const calls = [];
  const result = await notifyLineAlerts({
    alerts,
    env: lineEnv(),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return Response.json({ count: 2, webhookVerifiedAt: "2026-09-30T00:00:00.000Z" });
    }
  });

  assert.deepEqual(result, { status: "skipped", reason: "follower_count_not_one" });
  assert.equal(calls.length, 1);
});

test("fails closed when follower state cannot be verified", async () => {
  const result = await notifyLineAlerts({
    alerts,
    env: lineEnv(),
    fetchImpl: async () => new Response("unavailable", { status: 503 })
  });

  assert.deepEqual(result, { status: "skipped", reason: "follower_state_unavailable" });
});

test("fails closed when webhook verification has not completed", async () => {
  const result = await notifyLineAlerts({
    alerts,
    env: lineEnv(),
    fetchImpl: async () => Response.json({ count: 1, webhookVerifiedAt: null })
  });

  assert.deepEqual(result, { status: "skipped", reason: "webhook_not_verified" });
});

function lineEnv() {
  return {
    LINE_CHANNEL_ACCESS_TOKEN: "channel-token",
    LINE_FOLLOWER_STATE_URL: "https://alerts.example.com/state",
    LINE_FOLLOWER_STATE_TOKEN: "state-token"
  };
}
