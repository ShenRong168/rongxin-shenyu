import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLineWebhookApp } from "../src/line-webhook-app.js";

test("follower state endpoint requires its bearer token", async () => {
  const fixture = await createFixture();
  try {
    const unauthorized = await fetch(`${fixture.baseUrl}/internal/line-follower-state`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${fixture.baseUrl}/internal/line-follower-state`, {
      headers: { authorization: "Bearer state-token" }
    });
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), {
      count: 1,
      webhookVerifiedAt: null,
      updatedAt: null
    });
  } finally {
    await fixture.cleanup();
  }
});

test("LINE webhook endpoint accepts signed events and exposes the updated safe state", async () => {
  const fixture = await createFixture();
  try {
    const body = JSON.stringify({
      events: [{ type: "follow", webhookEventId: "follow-1" }]
    });
    const signature = createHmac("sha256", "channel-secret").update(body).digest("base64");
    const webhookResponse = await fetch(`${fixture.baseUrl}/webhooks/line`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-line-signature": signature
      },
      body
    });
    assert.equal(webhookResponse.status, 200);

    const stateResponse = await fetch(`${fixture.baseUrl}/internal/line-follower-state`, {
      headers: { authorization: "Bearer state-token" }
    });
    const state = await stateResponse.json();
    assert.equal(state.count, 2);
    assert.match(state.webhookVerifiedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "line-webhook-app-"));
  const statePath = join(directory, "line-followers-count.json");
  await writeFile(
    statePath,
    `${JSON.stringify({ version: 1, count: 1, webhookVerifiedAt: null, updatedAt: null, processedEventIds: [] }, null, 2)}\n`
  );

  const app = createLineWebhookApp({
    channelSecret: "channel-secret",
    stateToken: "state-token",
    statePath
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    cleanup: async () => {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await rm(directory, { recursive: true, force: true });
    }
  };
}
