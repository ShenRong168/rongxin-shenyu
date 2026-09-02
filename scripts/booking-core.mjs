export const TOPICS = new Set(["心態", "關係", "行動", "資源", "不確定", "其他"]);

export const GOALS = new Set([
  "被理解",
  "釐清方向",
  "具體行動",
  "溝通策略",
  "資源盤點",
  "情緒安定"
]);

export const AVAILABILITY = new Set([
  "平日上午",
  "平日下午",
  "平日晚上",
  "週末上午",
  "週末下午",
  "目前先不預約"
]);

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateBooking(payload = {}) {
  payload = payload || {};
  const errors = {};
  const displayName = String(payload.displayName || "").trim();
  const email = normalizeEmail(payload.email);
  const stuckText = String(payload.stuckText || "").trim();

  if (displayName.length < 1 || displayName.length > 50) {
    errors.displayName = "請輸入 1–50 個字的稱呼。";
  }

  if (email.length > 254) {
    errors.email = "Email 請控制在 254 個字以內。";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "請輸入可正常收信的 Email。";
  }

  if (stuckText.length < 20) {
    errors.stuckText = "請至少輸入 20 個字，讓我們能初步理解你的狀態。";
  } else if (stuckText.length > 1500) {
    errors.stuckText = "內容請控制在 1500 個字以內。";
  }

  if (!TOPICS.has(payload.topic)) {
    errors.topic = "請選擇一個主要卡點。";
  }

  if (
    !Array.isArray(payload.goals) ||
    payload.goals.length === 0 ||
    !payload.goals.every((goal) => GOALS.has(goal))
  ) {
    errors.goals = "請至少選擇一項希望帶走的結果。";
  }

  if (
    !Array.isArray(payload.availability) ||
    payload.availability.length === 0 ||
    !payload.availability.every((slot) => AVAILABILITY.has(slot))
  ) {
    errors.availability = "請至少選擇一個方便時段。";
  } else if (
    payload.availability.includes("目前先不預約") &&
    payload.availability.length > 1
  ) {
    errors.availability = "目前先不預約不能和其他時段同時選擇。";
  }

  if (payload.adultConfirmed !== true) {
    errors.adultConfirmed = "本服務目前僅接受年滿 18 歲者。";
  }

  if (payload.taiwanConfirmed !== true) {
    errors.taiwanConfirmed = "服務進行時需位於台灣。";
  }

  if (payload.consentConfirmed !== true) {
    errors.consentConfirmed = "送出前請閱讀並同意個資告知與服務界線。";
  }

  return errors;
}

export function getCookie(name, cookieString = "") {
  const expectedName = String(name);

  for (const cookie of String(cookieString).split(";")) {
    const separator = cookie.indexOf("=");
    if (separator === -1 || cookie.slice(0, separator).trim() !== expectedName) {
      continue;
    }

    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }

  return "";
}

export function buildFbc(url, now = Date.now()) {
  try {
    const fbclid = new URL(url).searchParams.get("fbclid") || "";
    if (!/^[A-Za-z0-9_-]{1,250}$/.test(fbclid)) {
      return "";
    }

    return `fb.1.${now}.${fbclid}`;
  } catch {
    return "";
  }
}

export function createEventId(cryptoApi = globalThis.crypto) {
  return `lead_${cryptoApi.randomUUID()}`;
}

export function isTrustedReply(event, pending) {
  if (!event || !pending || event.source !== pending.iframeWindow) {
    return false;
  }

  let origin;
  try {
    origin = new URL(event.origin);
  } catch {
    return false;
  }

  if (origin.protocol !== "https:" || origin.port !== "") {
    return false;
  }

  const trustedHostname =
    origin.hostname === "script.google.com" ||
    origin.hostname === "script.googleusercontent.com" ||
    origin.hostname.endsWith(".script.googleusercontent.com");
  if (!trustedHostname) {
    return false;
  }

  const data = event.data;
  return (
    data?.type === "rongxin-booking" &&
    data.eventId === pending.eventId &&
    typeof data.ok === "boolean"
  );
}

export function consumeLeadMarker(storage, eventId) {
  if (!eventId || storage.getItem(`rongxin:lead:${eventId}`) !== "confirmed") return false;
  storage.removeItem(`rongxin:lead:${eventId}`);
  return true;
}
