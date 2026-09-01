import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../apps-script/booking-intake/Code.gs", import.meta.url), "utf8");
const sandbox = {
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    computeDigest(_algorithm, value) { return [...createHash("sha256").update(value).digest()]; }
  }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const valid = {
  eventId: "lead_00000000-0000-4000-8000-000000000000",
  sourceUrl: "https://rongxinshenyu.com/booking.html",
  displayName: "小榮",
  email: "USER@example.com ",
  stuckText: "我在工作與家人期待之間反覆拉扯，不知道下一步怎麼選。",
  topic: "行動",
  goals: ["釐清方向"],
  availability: ["平日晚上"],
  adultConfirmed: "true",
  taiwanConfirmed: "true",
  consentConfirmed: "true",
  consentVersion: "2026-09-01",
  startedAt: "1700000000000",
  submittedAt: "1700000010000",
  website: "",
  fbp: "fb.1.10.20",
  fbc: "fb.1.1700000000000.abc"
};

test("validateSubmission_ normalizes approved input", () => {
  const result = sandbox.validateSubmission_(valid);

  assert.equal(result.email, "user@example.com");
  assert.equal(result.topic, "行動");
  assert.deepEqual([...result.goals], ["釐清方向"]);
  assert.deepEqual([...result.availability], ["平日晚上"]);
  assert.equal(result.fbp, "fb.1.10.20");
  assert.equal(result.fbc, "fb.1.1700000000000.abc");
});

test("validateSubmission_ rejects spam, unknown choices, and malformed submissions", () => {
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, website: "spam" }),
    /invalid submission/i
  );
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, topic: "診斷" }),
    /主要卡點/
  );
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, goals: ["釐清方向", "代替我決定"] }),
    /期待結果/
  );
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, availability: [] }),
    /可聯絡／對談時段/
  );
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, sourceUrl: "https://evil.example/booking.html" }),
    /來源頁面/
  );
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, consentConfirmed: true }),
    /同意確認/
  );
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, submittedAt: "1700000002999" }),
    /invalid submission/i
  );
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, startedAt: "", submittedAt: "3000" }),
    /invalid submission/i
  );

  const filtered = sandbox.validateSubmission_({ ...valid, fbp: "bad", fbc: "bad" });
  assert.equal(filtered.fbp, "");
  assert.equal(filtered.fbc, "");
});

test("buildMetaPayload_ hashes email and excludes form answers", () => {
  const input = sandbox.validateSubmission_(valid);
  const payload = sandbox.buildMetaPayload_(
    input,
    { pixelId: "4400969670158242", testEventCode: "TEST123" },
    1700000020
  );

  assert.equal(payload.data[0].event_name, "Lead");
  assert.equal(payload.data[0].event_time, 1700000020);
  assert.equal(payload.data[0].event_id, valid.eventId);
  assert.equal(payload.data[0].action_source, "website");
  assert.equal(payload.test_event_code, "TEST123");
  assert.equal(
    payload.data[0].user_data.em[0],
    createHash("sha256").update("user@example.com").digest("hex")
  );
  assert.equal(payload.data[0].user_data.fbp, valid.fbp);
  assert.equal(payload.data[0].user_data.fbc, valid.fbc);

  const serialized = JSON.stringify(payload);
  for (const excluded of [
    valid.stuckText,
    valid.topic,
    valid.goals[0],
    valid.availability[0],
    valid.displayName,
    valid.adultConfirmed,
    valid.taiwanConfirmed,
    valid.consentConfirmed,
    valid.consentVersion,
    "USER@example.com",
    "user@example.com"
  ]) {
    assert.equal(serialized.includes(excluded), false, `payload leaked ${excluded}`);
  }
});
