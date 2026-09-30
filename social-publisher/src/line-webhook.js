import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

const stateQueues = new Map();
const maxRememberedEventIds = 2000;

export async function handleLineWebhook({
  rawBody,
  signature,
  channelSecret,
  statePath,
  now = new Date()
}) {
  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    throw new Error("Invalid LINE webhook signature");
  }

  const payload = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  const previous = stateQueues.get(statePath) || Promise.resolve();
  const current = previous.then(async () => {
    const state = normalizeState(JSON.parse(await readFile(statePath, "utf8")));
    const processedIds = new Set(state.processedEventIds);

    for (const event of payload.events || []) {
      const eventId = String(event.webhookEventId || "");
      if (!eventId || processedIds.has(eventId)) continue;

      if (event.type === "follow") state.count += 1;
      if (event.type === "unfollow") state.count = Math.max(0, state.count - 1);
      processedIds.add(eventId);
    }

    state.webhookVerifiedAt ||= now.toISOString();
    state.updatedAt = now.toISOString();
    state.processedEventIds = [...processedIds].slice(-maxRememberedEventIds);
    await writeStateAtomically(statePath, state);
    return state;
  });

  stateQueues.set(statePath, current.catch(() => {}));
  return current;
}

export function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest();

  let actual;
  try {
    actual = Buffer.from(signature, "base64");
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeState(state) {
  if (!Number.isInteger(state.count) || state.count < 0) {
    throw new Error("LINE follower state count must be a non-negative integer");
  }
  return {
    version: 1,
    count: state.count,
    webhookVerifiedAt: state.webhookVerifiedAt || null,
    updatedAt: state.updatedAt || null,
    processedEventIds: Array.isArray(state.processedEventIds) ? state.processedEventIds.map(String) : []
  };
}

async function writeStateAtomically(statePath, state) {
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, statePath);
}
