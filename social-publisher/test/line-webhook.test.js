import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleLineWebhook } from "../src/line-webhook.js";

test("signed follow and unfollow events update the follower count file", async () => {
  const fixture = await createFixture();
  try {
    await sendEvent(fixture, {
      events: [
        { type: "follow", webhookEventId: "follow-1" },
        { type: "unfollow", webhookEventId: "unfollow-1" }
      ]
    });

    const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
    assert.equal(state.count, 1);
    assert.equal(state.webhookVerifiedAt, "2026-09-30T00:00:00.000Z");
    assert.deepEqual(state.processedEventIds, ["follow-1", "unfollow-1"]);
  } finally {
    await fixture.cleanup();
  }
});

test("duplicate webhook event ids are idempotent", async () => {
  const fixture = await createFixture();
  try {
    const payload = { events: [{ type: "follow", webhookEventId: "follow-1" }] };
    await sendEvent(fixture, payload);
    await sendEvent(fixture, payload);

    const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
    assert.equal(state.count, 2);
    assert.deepEqual(state.processedEventIds, ["follow-1"]);
  } finally {
    await fixture.cleanup();
  }
});

test("invalid signatures cannot update follower state", async () => {
  const fixture = await createFixture();
  try {
    const rawBody = Buffer.from(JSON.stringify({ events: [{ type: "follow", webhookEventId: "follow-1" }] }));

    await assert.rejects(
      handleLineWebhook({
        rawBody,
        signature: "invalid",
        channelSecret: fixture.channelSecret,
        statePath: fixture.statePath,
        now: new Date("2026-09-30T00:00:00.000Z")
      }),
      /signature/i
    );

    const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
    assert.equal(state.count, 1);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "line-webhook-"));
  const statePath = join(directory, "line-followers-count.json");
  const channelSecret = "test-channel-secret";
  await writeFile(
    statePath,
    `${JSON.stringify({ version: 1, count: 1, webhookVerifiedAt: null, updatedAt: null, processedEventIds: [] }, null, 2)}\n`
  );
  return {
    statePath,
    channelSecret,
    cleanup: () => rm(directory, { recursive: true, force: true })
  };
}

async function sendEvent(fixture, payload) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac("sha256", fixture.channelSecret).update(rawBody).digest("base64");
  return handleLineWebhook({
    rawBody,
    signature,
    channelSecret: fixture.channelSecret,
    statePath: fixture.statePath,
    now: new Date("2026-09-30T00:00:00.000Z")
  });
}
