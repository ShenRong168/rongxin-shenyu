var TOPICS_ = ["心態", "關係", "行動", "資源", "不確定", "其他"];
var GOALS_ = ["被理解", "釐清方向", "具體行動", "溝通策略", "資源盤點", "情緒安定"];
var AVAILABILITY_ = ["平日上午", "平日下午", "平日晚上", "週末上午", "週末下午", "目前先不預約"];
var SHEET_NAME_ = "官網初步盤點";
var HEADERS_ = [
  "建立時間",
  "event_id",
  "來源頁面",
  "稱呼",
  "Email",
  "目前卡點",
  "主要分類",
  "期待結果",
  "可聯絡／對談時段",
  "成人確認",
  "台灣確認",
  "同意版本",
  "審核狀態",
  "Meta CAPI 狀態",
  "管理備註"
];

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function asArray_(value) {
  if (value == null || value === "") {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map(function (entry) {
    return String(entry);
  });
}

function requireChoice_(value, allowed, label) {
  var choice = String(value == null ? "" : value);
  if (allowed.indexOf(choice) === -1) {
    throw new Error(label + "不正確");
  }
  return choice;
}

function requireChoices_(value, allowed, label) {
  var choices = asArray_(value);
  if (!choices.length || choices.some(function (choice) {
    return allowed.indexOf(choice) === -1;
  })) {
    throw new Error(label + "不正確");
  }
  return choices;
}

function validateSubmission_(raw) {
  raw = raw || {};

  var website = String(raw.website == null ? "" : raw.website);
  if (website !== "") {
    throw new Error("Invalid submission");
  }

  var startedAtText = String(raw.startedAt == null ? "" : raw.startedAt);
  var submittedAtText = String(raw.submittedAt == null ? "" : raw.submittedAt);
  var startedAt = Number(startedAtText);
  var submittedAt = Number(submittedAtText);
  var elapsed = submittedAt - startedAt;
  if (!/^\d+$/.test(startedAtText) || !/^\d+$/.test(submittedAtText) ||
      !isFinite(startedAt) || !isFinite(submittedAt) || elapsed < 3000 || elapsed > 86400000) {
    throw new Error("Invalid submission timing");
  }

  var displayName = String(raw.displayName || "").trim();
  if (displayName.length < 1 || displayName.length > 50) {
    throw new Error("稱呼不正確");
  }

  var email = normalizeEmail_(raw.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email不正確");
  }

  var stuckText = String(raw.stuckText || "").trim();
  if (stuckText.length < 20 || stuckText.length > 1500) {
    throw new Error("目前卡點不正確");
  }

  var eventId = String(raw.eventId || "");
  if (!/^lead_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    throw new Error("event_id不正確");
  }

  var sourceUrl = String(raw.sourceUrl || "");
  if (sourceUrl.length > 500 || !/^https:\/\/rongxinshenyu\.com\/booking\.html(?:[?#]|$)/.test(sourceUrl)) {
    throw new Error("來源頁面不正確");
  }

  var consentVersion = String(raw.consentVersion || "");
  if (consentVersion !== "2026-09-01") {
    throw new Error("同意版本不正確");
  }
  if (raw.adultConfirmed !== "true") {
    throw new Error("成人確認不正確");
  }
  if (raw.taiwanConfirmed !== "true") {
    throw new Error("台灣確認不正確");
  }
  if (raw.consentConfirmed !== "true") {
    throw new Error("同意確認不正確");
  }

  var topic = requireChoice_(raw.topic, TOPICS_, "主要卡點");
  var goals = requireChoices_(raw.goals, GOALS_, "期待結果");
  var availability = requireChoices_(raw.availability, AVAILABILITY_, "可聯絡／對談時段");
  var fbp = String(raw.fbp || "");
  var fbc = String(raw.fbc || "");

  return {
    eventId: eventId,
    sourceUrl: sourceUrl,
    displayName: displayName,
    email: email,
    stuckText: stuckText,
    topic: topic,
    goals: goals,
    availability: availability,
    adultConfirmed: "true",
    taiwanConfirmed: "true",
    consentConfirmed: "true",
    consentVersion: consentVersion,
    startedAt: startedAt,
    submittedAt: submittedAt,
    website: "",
    fbp: /^fb\.1\.\d+\.\d+$/.test(fbp) ? fbp : "",
    fbc: /^fb\.1\.\d+\.[A-Za-z0-9_-]+$/.test(fbc) ? fbc : ""
  };
}

function sha256Hex_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value)
  );
  return bytes.map(function (byte) {
    var normalized = (byte + 256) % 256;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}

function buildMetaPayload_(input, config, eventTime) {
  var userData = {
    em: [sha256Hex_(normalizeEmail_(input.email))]
  };
  if (input.fbp) {
    userData.fbp = input.fbp;
  }
  if (input.fbc) {
    userData.fbc = input.fbc;
  }

  var payload = {
    data: [{
      event_name: "Lead",
      event_time: eventTime,
      event_id: input.eventId,
      action_source: "website",
      event_source_url: input.sourceUrl,
      user_data: userData
    }]
  };
  if (config.testEventCode) {
    payload.test_event_code = config.testEventCode;
  }
  return payload;
}
