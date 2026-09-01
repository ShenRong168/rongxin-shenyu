var TOPICS_ = ["心態", "關係", "行動", "資源", "不確定", "其他"];
var GOALS_ = ["被理解", "釐清方向", "具體行動", "溝通策略", "資源盤點", "情緒安定"];
var AVAILABILITY_ = ["平日上午", "平日下午", "平日晚上", "週末上午", "週末下午", "目前先不預約"];
var SHEET_NAME_ = "官網初步盤點";
var BOOKING_SOURCE_URL_ = "https://rongxinshenyu.com/booking.html";
var ALLOWED_ORIGIN_ = "https://rongxinshenyu.com";
var META_PIXEL_ID_ = "4400969670158242";
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
  if (!choices.length || choices.length > allowed.length || choices.some(function (choice, index) {
    return allowed.indexOf(choice) === -1 || choices.indexOf(choice) !== index;
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
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
  if (availability.indexOf("目前先不預約") !== -1 && availability.length !== 1) {
    throw new Error("可聯絡／對談時段不正確");
  }
  var fbp = String(raw.fbp || "");
  var fbc = String(raw.fbc || "");

  return {
    eventId: eventId,
    sourceUrl: BOOKING_SOURCE_URL_,
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
    fbp: fbp.length <= 100 && /^fb\.1\.\d+\.\d+$/.test(fbp) ? fbp : "",
    fbc: fbc.length <= 300 && /^fb\.1\.\d+\.[A-Za-z0-9_-]+$/.test(fbc) ? fbc : ""
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

function rowFor_(input, capiStatus) {
  return [
    new Date(),
    input.eventId,
    BOOKING_SOURCE_URL_,
    input.displayName,
    input.email,
    input.stuckText,
    input.topic,
    input.goals.join("、"),
    input.availability.join("、"),
    "是",
    "是",
    input.consentVersion,
    "待審核",
    capiStatus,
    ""
  ];
}

function processSubmission_(input, deps) {
  var stored = deps.store(input);
  if (stored.duplicate) {
    return { ok: true, duplicate: true, eventId: input.eventId };
  }

  var capiStatus;
  try {
    var sent = deps.sendLead(input);
    capiStatus = String(sent.status) + ": " + String(sent.responseCode);
  } catch (error) {
    capiStatus = "failed: " + (error && error.message ? error.message : String(error));
  }

  try {
    deps.updateCapiStatus(stored.rowNumber, capiStatus);
  } catch (error) {
    Logger.log("Booking CAPI status update failed");
  }

  try {
    deps.notify(input);
  } catch (error) {
    Logger.log("Booking admin notification failed");
  }

  return { ok: true, duplicate: false, eventId: input.eventId };
}

function renderBridge_(result, origin) {
  var message = {
    type: "rongxin-booking",
    ok: Boolean(result && result.ok === true),
    eventId: String(result && result.eventId || ""),
    message: String(result && result.message || "")
  };
  var serializedMessage = JSON.stringify(message).replace(/</g, "\\u003c");
  var serializedOrigin = JSON.stringify(String(origin)).replace(/</g, "\\u003c");
  return "<!doctype html><meta charset=\"utf-8\"><script>" +
    "parent.postMessage(" + serializedMessage + "," + serializedOrigin + ");" +
    "</script>";
}

function requiredProperty_(properties, name) {
  var value = properties.getProperty(name);
  if (value == null || String(value).trim() === "") {
    throw new Error("Missing required property: " + name);
  }
  return String(value).trim();
}

function loadConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var config = {
    spreadsheetId: requiredProperty_(properties, "SPREADSHEET_ID"),
    adminEmail: requiredProperty_(properties, "ADMIN_EMAIL"),
    allowedOrigin: requiredProperty_(properties, "ALLOWED_ORIGIN"),
    pixelId: requiredProperty_(properties, "META_PIXEL_ID"),
    graphVersion: requiredProperty_(properties, "META_GRAPH_VERSION"),
    capiToken: String(properties.getProperty("META_CAPI_TOKEN") || "").trim(),
    testEventCode: String(properties.getProperty("META_TEST_EVENT_CODE") || "").trim()
  };

  if (config.allowedOrigin !== ALLOWED_ORIGIN_) {
    throw new Error("ALLOWED_ORIGIN is not allowed");
  }
  if (config.pixelId !== META_PIXEL_ID_) {
    throw new Error("META_PIXEL_ID is not allowed");
  }
  if (!/^v\d+\.\d+$/.test(config.graphVersion)) {
    throw new Error("META_GRAPH_VERSION is invalid");
  }
  return config;
}

function getSheet_(config) {
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var sheet = spreadsheet.getSheetByName(SHEET_NAME_);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME_);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS_.length).setValues([HEADERS_]);
  }
  return sheet;
}

function findEventRow_(sheet, eventId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  var found = sheet
    .getRange(2, 2, lastRow - 1, 1)
    .createTextFinder(String(eventId))
    .matchEntireCell(true)
    .findNext();
  return found ? found.getRow() : 0;
}

function rateLimit_(email) {
  var cache = CacheService.getScriptCache();
  var key = "booking-rate-" + sha256Hex_(normalizeEmail_(email));
  var count = parseInt(cache.get(key), 10);
  if (!isFinite(count) || count < 0) {
    count = 0;
  }
  if (count >= 5) {
    throw new Error("Too many submissions");
  }
  cache.put(key, String(count + 1), 3600);
}

function storeInput_(sheet, input) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var existingRow = findEventRow_(sheet, input.eventId);
    if (existingRow) {
      return { duplicate: true, rowNumber: existingRow };
    }
    rateLimit_(input.email);
    var rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, HEADERS_.length).setValues([
      rowFor_(input, "pending")
    ]);
    return { duplicate: false, rowNumber: rowNumber };
  } finally {
    lock.releaseLock();
  }
}

function updateCapiStatus_(sheet, rowNumber, status) {
  sheet.getRange(rowNumber, 14).setValue(status);
}

function sendLead_(input, config) {
  if (!config.capiToken) {
    return { status: "not_configured", responseCode: 0 };
  }

  var url = "https://graph.facebook.com/" +
    encodeURIComponent(config.graphVersion) + "/" +
    encodeURIComponent(config.pixelId) + "/events";
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    headers: { Authorization: "Bearer " + config.capiToken },
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(buildMetaPayload_(input, config, Math.floor(Date.now() / 1000)))
  });
  var responseCode = response.getResponseCode();
  if (responseCode < 200 || responseCode >= 300) {
    throw new Error("Meta CAPI HTTP " + responseCode);
  }

  var responseData;
  try {
    responseData = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error("Meta CAPI invalid response");
  }
  if (responseData.events_received !== 1) {
    throw new Error("Meta CAPI did not accept event");
  }
  return { status: "sent", responseCode: responseCode };
}

function notify_(input, config, sheet) {
  var body = [
    "建立時間：" + new Date().toISOString(),
    "稱呼：" + input.displayName,
    "Email：" + input.email,
    "event_id：" + input.eventId,
    "試算表：" + sheet.getParent().getUrl()
  ].join("\n");
  MailApp.sendEmail({
    to: config.adminEmail,
    subject: "榮心紳語｜新的官網初步盤點",
    body: body
  });
}

function createDependencies_(config) {
  var sheet = getSheet_(config);
  return {
    store: function (input) {
      return storeInput_(sheet, input);
    },
    sendLead: function (input) {
      return sendLead_(input, config);
    },
    updateCapiStatus: function (rowNumber, status) {
      updateCapiStatus_(sheet, rowNumber, status);
    },
    notify: function (input) {
      notify_(input, config, sheet);
    }
  };
}

function parseRequest_(event) {
  var parameter = event && event.parameter || {};
  var parameters = event && event.parameters || {};
  var fields = [
    "eventId", "sourceUrl", "displayName", "email", "stuckText", "topic",
    "goals", "availability", "adultConfirmed", "taiwanConfirmed",
    "consentConfirmed", "consentVersion", "startedAt", "submittedAt",
    "website", "fbp", "fbc"
  ];
  var parsed = {};
  fields.forEach(function (name) {
    if ((name === "goals" || name === "availability") && parameters[name] != null) {
      parsed[name] = parameters[name];
    } else if (parameter[name] != null) {
      parsed[name] = parameter[name];
    } else if (parameters[name] != null) {
      parsed[name] = parameters[name][0];
    } else {
      parsed[name] = undefined;
    }
  });
  return parsed;
}

function doPost(e) {
  var parsed = parseRequest_(e);
  var eventId = String(parsed.eventId || "");
  var result;
  try {
    var input = validateSubmission_(parsed);
    var config = loadConfig_();
    result = processSubmission_(input, createDependencies_(config));
  } catch (error) {
    Logger.log("Booking submission failed");
    result = {
      ok: false,
      eventId: eventId,
      message: "目前無法送出，請稍後重試。"
    };
  }

  return HtmlService
    .createHtmlOutput(renderBridge_(result, ALLOWED_ORIGIN_))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
