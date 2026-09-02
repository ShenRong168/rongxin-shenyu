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

test("rejects any unknown goal or availability value", () => {
  const errors = validateBooking({
    ...valid,
    goals: ["釐清方向", "代替我決定"],
    availability: ["平日晚上", "凌晨三點"]
  });
  assert.equal(errors.goals, "請至少選擇一項希望帶走的結果。");
  assert.equal(errors.availability, "請至少選擇一個方便時段。");
});

test("rejects no-booking availability combined with a concrete time", () => {
  const errors = validateBooking({
    ...valid,
    availability: ["平日晚上", "目前先不預約"]
  });
  assert.equal(errors.availability, "目前先不預約不能和其他時段同時選擇。");
});

test("treats a null payload as missing required fields", () => {
  assert.deepEqual(validateBooking(null), {
    displayName: "請輸入 1–50 個字的稱呼。",
    email: "請輸入可正常收信的 Email。",
    stuckText: "請至少輸入 20 個字，讓我們能初步理解你的狀態。",
    topic: "請選擇一個主要卡點。",
    goals: "請至少選擇一項希望帶走的結果。",
    availability: "請至少選擇一個方便時段。",
    adultConfirmed: "本服務目前僅接受年滿 18 歲者。",
    taiwanConfirmed: "服務進行時需位於台灣。",
    consentConfirmed: "送出前請閱讀並同意個資告知與服務界線。"
  });
});

test("reads fbp and builds fbc only from a valid fbclid", () => {
  assert.equal(getCookie("_fbp", "a=1; _fbp=fb.1.10.20"), "fb.1.10.20");
  assert.equal(buildFbc("https://rongxinshenyu.com/booking.html?fbclid=abc_DEF-12", 1700000000000), "fb.1.1700000000000.abc_DEF-12");
  assert.equal(buildFbc("https://rongxinshenyu.com/booking.html?fbclid=%3Cbad%3E", 1700000000000), "");
});

test("creates a namespaced UUID event id", () => {
  assert.equal(createEventId({ randomUUID: () => "00000000-0000-4000-8000-000000000000" }), "lead_00000000-0000-4000-8000-000000000000");
});

test("trusts only the active iframe, Apps Script origin, and pending event", () => {
  const frame = {};
  const pending = { iframeWindow: frame, eventId: "lead_1" };
  const base = {
    source: frame,
    origin: "https://n-abcd.script.googleusercontent.com",
    data: { type: "rongxin-booking", eventId: "lead_1", ok: true }
  };
  assert.equal(isTrustedReply(base, pending), true);
  assert.equal(isTrustedReply({ ...base, origin: "https://script.googleusercontent.com" }, pending), true);
  assert.equal(isTrustedReply({ ...base, origin: "https://script.google.com" }, pending), true);
  assert.equal(isTrustedReply({ ...base, source: {} }, pending), false);
  assert.equal(isTrustedReply({ ...base, origin: "https://evil.example" }, pending), false);
  assert.equal(isTrustedReply({ ...base, origin: "http://script.google.com" }, pending), false);
  assert.equal(isTrustedReply({ ...base, origin: "https://script.google.com:8443" }, pending), false);
  assert.equal(isTrustedReply({ ...base, data: { ...base.data, eventId: "lead_2" } }, pending), false);
  assert.equal(isTrustedReply({ ...base, data: { ...base.data, ok: "true" } }, pending), false);
});
