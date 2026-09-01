import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFbc,
  createEventId,
  getCookie,
  isTrustedReply,
  normalizeEmail,
  validateBooking
} from "../scripts/booking-core.mjs";

const valid = {
  displayName: "小榮",
  email: "USER@Example.com ",
  stuckText: "我在工作與家人期待之間反覆拉扯，不知道下一步怎麼選。",
  topic: "行動",
  goals: ["釐清方向"],
  availability: ["平日晚上"],
  adultConfirmed: true,
  taiwanConfirmed: true,
  consentConfirmed: true
};

test("normalizes email before storage and hashing", () => {
  assert.equal(normalizeEmail(" USER@Example.com "), "user@example.com");
});

test("accepts the approved first-stage payload", () => {
  assert.deepEqual(validateBooking(valid), {});
});

test("rejects unknown choices and a short description", () => {
  const errors = validateBooking({ ...valid, stuckText: "太短", topic: "診斷" });
  assert.equal(errors.stuckText, "請至少輸入 20 個字，讓我們能初步理解你的狀態。");
  assert.equal(errors.topic, "請選擇一個主要卡點。");
});

test("reads fbp and builds fbc only from a valid fbclid", () => {
  assert.equal(getCookie("_fbp", "a=1; _fbp=fb.1.10.20"), "fb.1.10.20");
  assert.equal(buildFbc("https://rongxinshenyu.com/booking.html?fbclid=abc_DEF-12", 1700000000000), "fb.1.1700000000.abc_DEF-12");
  assert.equal(buildFbc("https://rongxinshenyu.com/booking.html?fbclid=%3Cbad%3E", 1700000000000), "");
});

test("creates a namespaced UUID event id", () => {
  assert.equal(createEventId({ randomUUID: () => "00000000-0000-4000-8000-000000000000" }), "lead_00000000-0000-4000-8000-000000000000");
});

test("trusts only the active iframe, Apps Script origin, and pending event", () => {
  const frame = {};
  const base = {
    source: frame,
    origin: "https://n-abcd.script.googleusercontent.com",
    data: { type: "rongxin-booking", eventId: "lead_1", ok: true }
  };
  assert.equal(isTrustedReply(base, { iframeWindow: frame, eventId: "lead_1" }), true);
  assert.equal(isTrustedReply({ ...base, source: {} }, { iframeWindow: frame, eventId: "lead_1" }), false);
  assert.equal(isTrustedReply({ ...base, origin: "https://evil.example" }, { iframeWindow: frame, eventId: "lead_1" }), false);
});
