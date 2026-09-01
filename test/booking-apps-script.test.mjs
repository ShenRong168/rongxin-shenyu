import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../apps-script/booking-intake/Code.gs", import.meta.url), "utf8");
const sandbox = {
  console,
  Logger: { log() {} },
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

test("canonicalizes a privacy-sensitive submitted source URL before storage and Meta", () => {
  const privateEmail = "private.person@example.com";
  const privateNarrative = "我不想讓這段敘述進入Meta";
  const privateFragment = "private-fragment";
  const input = sandbox.validateSubmission_({
    ...valid,
    sourceUrl: `https://rongxinshenyu.com/booking.html?email=${privateEmail}&story=${privateNarrative}#${privateFragment}`
  });
  const payload = sandbox.buildMetaPayload_(input, { pixelId: "4400969670158242" }, 1700000020);

  assert.equal(input.sourceUrl, "https://rongxinshenyu.com/booking.html");
  assert.equal(payload.data[0].event_source_url, "https://rongxinshenyu.com/booking.html");
  const serialized = JSON.stringify(payload);
  for (const privateValue of [privateEmail, privateNarrative, privateFragment]) {
    assert.equal(serialized.includes(privateValue), false, `payload leaked ${privateValue}`);
  }
});

test("buildMetaPayload_ allows only the approved exact object shape", () => {
  const withOptional = sandbox.buildMetaPayload_(
    sandbox.validateSubmission_(valid),
    { pixelId: "4400969670158242", testEventCode: "TEST123" },
    1700000020
  );
  assert.deepEqual(Object.keys(withOptional), ["data", "test_event_code"]);
  assert.deepEqual(Object.keys(withOptional.data[0]), [
    "event_name",
    "event_time",
    "event_id",
    "action_source",
    "event_source_url",
    "user_data"
  ]);
  assert.deepEqual(Object.keys(withOptional.data[0].user_data), ["em", "fbp", "fbc"]);

  const withoutOptional = sandbox.buildMetaPayload_(
    sandbox.validateSubmission_({ ...valid, fbp: "", fbc: "" }),
    { pixelId: "4400969670158242", testEventCode: "" },
    1700000020
  );
  assert.deepEqual(Object.keys(withoutOptional), ["data"]);
  assert.deepEqual(Object.keys(withoutOptional.data[0]), [
    "event_name",
    "event_time",
    "event_id",
    "action_source",
    "event_source_url",
    "user_data"
  ]);
  assert.deepEqual(Object.keys(withoutOptional.data[0].user_data), ["em"]);
});

test("validateSubmission_ bounds email, tracking IDs, and choice arrays", () => {
  const oversizedEmail = `${"a".repeat(250)}@x.co`;
  assert.equal(oversizedEmail.length, 255);
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, email: oversizedEmail }),
    /Email/
  );
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, goals: ["釐清方向", "釐清方向"] }),
    /期待結果/
  );
  assert.throws(
    () => sandbox.validateSubmission_({
      ...valid,
      goals: ["被理解", "釐清方向", "具體行動", "溝通策略", "資源盤點", "情緒安定", "被理解"]
    }),
    /期待結果/
  );
  assert.throws(
    () => sandbox.validateSubmission_({
      ...valid,
      availability: ["平日上午", "平日下午", "平日晚上", "週末上午", "週末下午", "目前先不預約", "平日上午"]
    }),
    /可聯絡／對談時段/
  );
  assert.throws(
    () => sandbox.validateSubmission_({ ...valid, availability: ["目前先不預約", "平日晚上"] }),
    /可聯絡／對談時段/
  );

  const oversizedTracking = sandbox.validateSubmission_({
    ...valid,
    fbp: `fb.1.1.${"1".repeat(94)}`,
    fbc: `fb.1.1.${"a".repeat(294)}`
  });
  assert.equal(oversizedTracking.fbp, "");
  assert.equal(oversizedTracking.fbc, "");
});

test("processSubmission_ stores, claims, sends both effects, and persists sent states", () => {
  const input = sandbox.validateSubmission_(valid);
  const calls = { store: [], claimEffects: [], sendLead: [], completeEffect: [], notify: [] };
  const deps = {
    store(value) {
      calls.store.push(value);
      return {
        duplicate: false,
        rowNumber: 2,
        capiStatus: "pending",
        notificationStatus: "pending"
      };
    },
    claimEffects(rowNumber) {
      calls.claimEffects.push(rowNumber);
      return { leaseToken: "lease-1", capi: true, notification: true };
    },
    sendLead(value) {
      calls.sendLead.push(value);
      return { status: "sent", responseCode: 200 };
    },
    completeEffect(rowNumber, effect, leaseToken, status) {
      calls.completeEffect.push([rowNumber, effect, leaseToken, status]);
    },
    notify(value) {
      calls.notify.push(value);
    }
  };

  const result = sandbox.processSubmission_(input, deps);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    duplicate: false,
    eventId: valid.eventId
  });
  assert.equal(calls.store.length, 1);
  assert.deepEqual(calls.claimEffects, [2]);
  assert.equal(calls.sendLead.length, 1);
  assert.deepEqual(calls.completeEffect, [
    [2, "capi", "lease-1", "sent: 200"],
    [2, "notification", "lease-1", "sent"]
  ]);
  assert.equal(calls.notify.length, 1);
});

test("processSubmission_ returns a fully completed duplicate without effects", () => {
  const input = sandbox.validateSubmission_(valid);
  let storeCalls = 0;
  const untouched = () => assert.fail("duplicate submission triggered a side effect");
  const deps = {
    store() {
      storeCalls += 1;
      return {
        duplicate: true,
        rowNumber: 2,
        capiStatus: "sent: 200",
        notificationStatus: "sent"
      };
    },
    claimEffects() { return { leaseToken: "", capi: false, notification: false }; },
    sendLead: untouched,
    completeEffect: untouched,
    notify: untouched
  };

  const result = sandbox.processSubmission_(input, deps);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    duplicate: true,
    eventId: valid.eventId
  });
  assert.equal(storeCalls, 1);
});

test("processSubmission_ keeps a stored lead successful and records downstream failures", () => {
  const input = sandbox.validateSubmission_(valid);
  const statuses = [];
  const result = sandbox.processSubmission_(input, {
    store() {
      return {
        duplicate: false,
        rowNumber: 2,
        capiStatus: "pending",
        notificationStatus: "pending"
      };
    },
    claimEffects() { return { leaseToken: "lease-2", capi: true, notification: true }; },
    sendLead() { throw new Error("Meta unavailable"); },
    completeEffect(rowNumber, effect, leaseToken, status) {
      statuses.push([rowNumber, effect, leaseToken, status]);
    },
    notify() { throw new Error("Mail unavailable"); }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    duplicate: false,
    eventId: valid.eventId
  });
  assert.deepEqual(statuses, [
    [2, "capi", "lease-2", "failed: Meta unavailable"],
    [2, "notification", "lease-2", "failed: Mail unavailable"]
  ]);
});

test("processSubmission_ resumes only failed or incomplete effects on a duplicate", () => {
  const input = sandbox.validateSubmission_(valid);
  const calls = [];
  const result = sandbox.processSubmission_(input, {
    store() {
      return {
        duplicate: true,
        rowNumber: 2,
        capiStatus: "failed: Meta unavailable",
        notificationStatus: "not_configured: admin email"
      };
    },
    claimEffects() { return { leaseToken: "lease-retry", capi: true, notification: true }; },
    sendLead(value) { calls.push(["capi", value.eventId]); return { status: "sent", responseCode: 200 }; },
    notify(value) { calls.push(["notification", value.email]); },
    completeEffect(rowNumber, effect, leaseToken, status) {
      calls.push(["complete", rowNumber, effect, leaseToken, status]);
    }
  });

  assert.equal(result.duplicate, true);
  assert.deepEqual(calls, [
    ["capi", valid.eventId],
    ["complete", 2, "capi", "lease-retry", "sent: 200"],
    ["notification", "user@example.com"],
    ["complete", 2, "notification", "lease-retry", "sent"]
  ]);
});

test("processSubmission_ accepts an in-progress duplicate without sending effects", () => {
  const input = sandbox.validateSubmission_(valid);
  const untouched = () => assert.fail("active lease triggered a duplicate effect");
  const result = sandbox.processSubmission_(input, {
    store() {
      return {
        duplicate: true,
        rowNumber: 2,
        capiStatus: "processing:other:1700000100000",
        notificationStatus: "processing:other:1700000100000"
      };
    },
    claimEffects() { return { leaseToken: "", capi: false, notification: false }; },
    sendLead: untouched,
    notify: untouched,
    completeEffect: untouched
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
});

test("renderBridge_ posts only the minimal result to the fixed origin", () => {
  const html = sandbox.renderBridge_(
    { ok: true, eventId: valid.eventId },
    "https://rongxinshenyu.com"
  );

  assert.match(html, /rongxin-booking/);
  assert.match(html, /postMessage\([\s\S]*https:\/\/rongxinshenyu\.com/);
  assert.equal(html.includes(valid.email), false);
  assert.equal(html.includes(valid.stuckText), false);
});

test("rowFor_ creates the approved 16-column review row with separate pending states", () => {
  const input = sandbox.validateSubmission_(valid);
  const row = sandbox.rowFor_(input);

  assert.equal(row.length, 16);
  assert.equal(Object.prototype.toString.call(row[0]), "[object Date]");
  assert.deepEqual([...row.slice(1)], [
    valid.eventId,
    "https://rongxinshenyu.com/booking.html",
    "小榮",
    "user@example.com",
    valid.stuckText,
    "行動",
    "釐清方向",
    "平日晚上",
    "是",
    "是",
    "2026-09-01",
    "待審核",
    "pending",
    "pending",
    ""
  ]);
});

test("rowFor_ escapes formula-like public strings without mutating normalized input", () => {
  for (const field of ["displayName", "stuckText"]) {
    for (const prefix of ["=", "+", "-", "@"]) {
      const raw = {
        ...valid,
        [field]: field === "stuckText"
          ? `${prefix}這是一段長度超過二十字而且可能被試算表當公式的卡點敘述。`
          : `${prefix}危險稱呼`
      };
      const input = sandbox.validateSubmission_(raw);
      const row = sandbox.rowFor_(input);
      const column = field === "displayName" ? 3 : 5;
      assert.equal(row[column], `'${input[field]}`);
      assert.equal(input[field], raw[field]);
    }
  }

  const input = sandbox.validateSubmission_({ ...valid, email: "+alias@example.com" });
  const row = sandbox.rowFor_(input);
  assert.equal(row[4], "'+alias@example.com");
  assert.equal(input.email, "+alias@example.com");

  const meta = sandbox.buildMetaPayload_(input, {}, 1700000020);
  assert.equal(
    meta.data[0].user_data.em[0],
    createHash("sha256").update("+alias@example.com").digest("hex")
  );
});

test("loadConfig_ requires the fixed site origin, pixel, and safe graph version", () => {
  let values = {
    SPREADSHEET_ID: "sheet-1",
    ADMIN_EMAIL: "admin@example.com",
    ALLOWED_ORIGIN: "https://rongxinshenyu.com",
    META_PIXEL_ID: "4400969670158242",
    META_GRAPH_VERSION: "v23.0",
    META_CAPI_TOKEN: "secret-token",
    META_TEST_EVENT_CODE: "TEST123"
  };
  sandbox.PropertiesService = {
    getScriptProperties() {
      return { getProperty(name) { return values[name]; } };
    }
  };

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.loadConfig_())), {
    spreadsheetId: "sheet-1",
    adminEmail: "admin@example.com",
    allowedOrigin: "https://rongxinshenyu.com",
    pixelId: "4400969670158242",
    graphVersion: "v23.0",
    capiToken: "secret-token",
    testEventCode: "TEST123"
  });

  values = { ...values, META_GRAPH_VERSION: "v23.0/events?token=bad" };
  assert.throws(() => sandbox.loadConfig_(), /META_GRAPH_VERSION/);
});

test("storeInput_ initializes and writes under one lock, flushes, then records best-effort acceptance", () => {
  const timeline = [];
  const writes = [];
  let lastRow = 0;
  let existingEventId = "";
  const sheet = {
    getLastRow() { return lastRow; },
    getRange(row, column, rows, columns) {
      if (row === 2 && column === 2) {
        return {
          createTextFinder(eventId) {
            return {
              matchEntireCell(value) {
                assert.equal(value, true);
                return this;
              },
              findNext() {
                return existingEventId === eventId ? { getRow() { return 2; } } : null;
              }
            };
          }
        };
      }
      if (column === 14 && columns === 2) {
        return { getValues() { return [["sent: 200", "sent"]]; } };
      }
      return {
        setValues(values) {
          writes.push({ row, column, rows, columns, values });
          lastRow = Math.max(lastRow, row + rows - 1);
        }
      };
    }
  };
  const spreadsheet = {
    getSheetByName(name) {
      timeline.push("getSheet");
      assert.equal(timeline.includes("lock-held"), true);
      assert.equal(name, "官網初步盤點");
      return null;
    },
    insertSheet(name) {
      assert.equal(name, "官網初步盤點");
      return sheet;
    }
  };
  sandbox.SpreadsheetApp = {
    openById(id) {
      assert.equal(id, "sheet-1");
      return spreadsheet;
    },
    flush() { timeline.push("flush"); }
  };
  let lockReleases = 0;
  sandbox.LockService = {
    getScriptLock() {
      return {
        waitLock(milliseconds) {
          assert.equal(milliseconds, 10000);
          timeline.push("lock-held");
        },
        releaseLock() {
          timeline.push("release");
          lockReleases += 1;
        }
      };
    }
  };
  const cachePuts = [];
  sandbox.CacheService = {
    getScriptCache() {
      return {
        get() { return null; },
        put(key, value, seconds) {
          timeline.push("cache-put");
          cachePuts.push({ key, value, seconds });
        }
      };
    }
  };

  const input = sandbox.validateSubmission_(valid);
  const stored = sandbox.storeInput_({ spreadsheetId: "sheet-1" }, input);
  assert.deepEqual(JSON.parse(JSON.stringify(stored)), {
    duplicate: false,
    rowNumber: 2,
    capiStatus: "pending",
    notificationStatus: "pending"
  });
  assert.deepEqual([...writes[0].values[0]], [...sandbox.HEADERS_]);
  assert.equal(writes[1].values[0].length, 16);
  assert.equal(cachePuts.length, 1);
  assert.equal(cachePuts[0].key.includes("user@example.com"), false);
  assert.match(cachePuts[0].key, /^booking-best-effort-throttle-[0-9a-f]{64}$/);
  assert.deepEqual(cachePuts[0], { key: cachePuts[0].key, value: "1", seconds: 3600 });

  existingEventId = valid.eventId;
  spreadsheet.getSheetByName = function () {
    timeline.push("getSheet");
    assert.equal(timeline.at(-2), "lock-held");
    return sheet;
  };
  const duplicate = sandbox.storeInput_({ spreadsheetId: "sheet-1" }, input);
  assert.deepEqual(JSON.parse(JSON.stringify(duplicate)), {
    duplicate: true,
    rowNumber: 2,
    capiStatus: "sent: 200",
    notificationStatus: "sent"
  });
  assert.equal(writes.length, 2, "duplicate event_id wrote a second row");
  assert.equal(cachePuts.length, 1);
  assert.equal(lockReleases, 2);
  assert.equal(timeline.indexOf("flush") < timeline.indexOf("cache-put"), true);
  assert.equal(timeline.indexOf("cache-put") < timeline.indexOf("release"), true);
});

test("storeInput_ does not consume best-effort acceptance when the row write fails", () => {
  let cachePuts = 0;
  let released = false;
  const sheet = {
    getLastRow() { return 1; },
    getRange() {
      return { setValues() { throw new Error("sheet write failed"); } };
    }
  };
  sandbox.SpreadsheetApp = {
    openById() { return { getSheetByName() { return sheet; } }; },
    flush() { assert.fail("failed row write must not flush as accepted"); }
  };
  sandbox.LockService = {
    getScriptLock() {
      return {
        waitLock() {},
        releaseLock() { released = true; }
      };
    }
  };
  sandbox.CacheService = {
    getScriptCache() {
      return {
        get() { return "0"; },
        put() { cachePuts += 1; }
      };
    }
  };

  assert.throws(
    () => sandbox.storeInput_({ spreadsheetId: "sheet-1" }, sandbox.validateSubmission_(valid)),
    /sheet write failed/
  );
  assert.equal(cachePuts, 0);
  assert.equal(released, true);
});

test("best-effort throttle rejects the sixth cached accepted submission without exposing email", () => {
  let observedKey = "";
  sandbox.CacheService = {
    getScriptCache() {
      return {
        get(key) { observedKey = key; return "5"; },
        put() { assert.fail("rejected rate limit should not increment"); }
      };
    }
  };
  assert.throws(() => sandbox.checkBestEffortThrottle_("user@example.com"), /too many/i);
  assert.equal(observedKey.includes("user@example.com"), false);
  assert.match(observedKey, /^booking-best-effort-throttle-[0-9a-f]{64}$/);
});

test("claimEffects_ skips sent and active leases but resumes failed and stale states", () => {
  let statuses = ["sent: 200", "processing:other:1700000100000"];
  const stateWrites = [];
  let flushes = 0;
  const sheet = {
    getLastRow() { return 2; },
    getRange(row, column, rows, columns) {
      assert.equal(row, 2);
      assert.equal(column, 14);
      assert.equal(rows, 1);
      assert.equal(columns, 2);
      return {
        getValues() { return [[...statuses]]; },
        setValues(values) { statuses = [...values[0]]; stateWrites.push([...values[0]]); }
      };
    }
  };
  sandbox.SpreadsheetApp = {
    openById() { return { getSheetByName() { return sheet; } }; },
    flush() { flushes += 1; }
  };
  sandbox.LockService = {
    getScriptLock() {
      return { waitLock() {}, releaseLock() {} };
    }
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.claimEffects_({ spreadsheetId: "sheet-1" }, 2, 1700000000000, "lease-a"))),
    { leaseToken: "lease-a", capi: false, notification: false }
  );
  assert.equal(stateWrites.length, 0);

  statuses = ["failed: Meta unavailable", "processing:other:1699999999999"];
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.claimEffects_({ spreadsheetId: "sheet-1" }, 2, 1700000000000, "lease-b"))),
    { leaseToken: "lease-b", capi: true, notification: true }
  );
  assert.deepEqual(stateWrites.at(-1), [
    "processing:lease-b:1700000060000",
    "processing:lease-b:1700000060000"
  ]);
  assert.equal(flushes, 1);
});

test("completeEffect_ changes only its owned lease and flushes before releasing lock", () => {
  let statuses = ["processing:lease-a:1700000060000", "processing:lease-a:1700000060000"];
  const timeline = [];
  const sheet = {
    getLastRow() { return 2; },
    getRange() {
      return {
        getValues() { return [[...statuses]]; },
        setValues(values) { statuses = [...values[0]]; timeline.push("write"); }
      };
    }
  };
  sandbox.SpreadsheetApp = {
    openById() { return { getSheetByName() { return sheet; } }; },
    flush() { timeline.push("flush"); }
  };
  sandbox.LockService = {
    getScriptLock() {
      return {
        waitLock() { timeline.push("lock"); },
        releaseLock() { timeline.push("release"); }
      };
    }
  };

  assert.equal(sandbox.completeEffect_({ spreadsheetId: "sheet-1" }, 2, "capi", "lease-a", "sent: 200"), true);
  assert.deepEqual(statuses, ["sent: 200", "processing:lease-a:1700000060000"]);
  assert.deepEqual(timeline, ["lock", "write", "flush", "release"]);

  assert.equal(sandbox.completeEffect_({ spreadsheetId: "sheet-1" }, 2, "notification", "wrong", "sent"), false);
  assert.deepEqual(statuses, ["sent: 200", "processing:lease-a:1700000060000"]);
});

test("sendLead_ posts only buildMetaPayload_ and rejects unsafe Meta responses", () => {
  const input = sandbox.validateSubmission_(valid);
  const requests = [];
  let responseCode = 200;
  let responseBody = JSON.stringify({ events_received: 1 });
  sandbox.UrlFetchApp = {
    fetch(url, options) {
      requests.push({ url, options });
      return {
        getResponseCode() { return responseCode; },
        getContentText() { return responseBody; }
      };
    }
  };
  const config = {
    graphVersion: "v23.0",
    pixelId: "4400969670158242",
    capiToken: "secret-token",
    testEventCode: "TEST123"
  };

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.sendLead_(input, { ...config, capiToken: "" }))), {
    status: "not_configured",
    responseCode: 0
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.sendLead_(input, config))), {
    status: "sent",
    responseCode: 200
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://graph.facebook.com/v23.0/4400969670158242/events");
  assert.equal(requests[0].options.headers.Authorization, "Bearer secret-token");
  assert.equal(requests[0].options.contentType, "application/json");
  assert.equal(requests[0].options.muteHttpExceptions, true);
  const posted = JSON.parse(requests[0].options.payload);
  assert.deepEqual(Object.keys(posted), ["data", "test_event_code"]);
  assert.equal(JSON.stringify(posted).includes(valid.stuckText), false);
  assert.equal(JSON.stringify(posted).includes("user@example.com"), false);

  responseCode = 503;
  responseBody = "sensitive upstream body";
  assert.throws(() => sandbox.sendLead_(input, config), /^Error: Meta CAPI HTTP 503$/);
  responseCode = 200;
  responseBody = "not-json";
  assert.throws(() => sandbox.sendLead_(input, config), /^Error: Meta CAPI invalid response$/);
  responseBody = JSON.stringify({ events_received: 0 });
  assert.throws(() => sandbox.sendLead_(input, config), /^Error: Meta CAPI did not accept event$/);
});

test("notify_ sends only the minimal unescaped lead notice and parseRequest_ whitelists fields", () => {
  const sent = [];
  sandbox.MailApp = { sendEmail(message) { sent.push(message); } };
  const input = sandbox.validateSubmission_({ ...valid, displayName: "+小榮", email: "+alias@example.com" });

  sandbox.notify_(
    input,
    { adminEmail: "admin@example.com" },
    "https://docs.google.com/spreadsheets/d/sheet-1/edit"
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "admin@example.com");
  assert.equal(sent[0].subject, "榮心紳語｜新的官網初步盤點");
  for (const included of ["建立時間", "稱呼：+小榮", "Email：+alias@example.com", valid.eventId, "https://docs.google.com/spreadsheets/d/sheet-1/edit"]) {
    assert.equal(sent[0].body.includes(included), true, `notice omitted ${included}`);
  }
  for (const excluded of [valid.stuckText, valid.topic, valid.goals[0], valid.availability[0], valid.fbp, valid.fbc, "同意版本"]) {
    assert.equal(sent[0].body.includes(excluded), false, `notice leaked ${excluded}`);
  }

  const parsed = sandbox.parseRequest_({
    parameter: { ...valid, ignored: "secret" },
    parameters: {
      goals: ["被理解", "釐清方向"],
      availability: ["平日晚上"]
    }
  });
  assert.deepEqual([...parsed.goals], ["被理解", "釐清方向"]);
  assert.deepEqual([...parsed.availability], ["平日晚上"]);
  assert.equal(parsed.ignored, undefined);
  assert.deepEqual(Object.keys(parsed), [
    "eventId", "sourceUrl", "displayName", "email", "stuckText", "topic",
    "goals", "availability", "adultConfirmed", "taiwanConfirmed",
    "consentConfirmed", "consentVersion", "startedAt", "submittedAt",
    "website", "fbp", "fbc"
  ]);
});

test("createDependencies_ is lazy and doPost returns an ALLOWALL fixed-origin bridge", () => {
  let sheetOpens = 0;
  const sheet = { getLastRow() { return 1; } };
  sandbox.SpreadsheetApp = {
    openById() {
      sheetOpens += 1;
      return { getSheetByName() { return sheet; } };
    }
  };
  const config = {
    spreadsheetId: "sheet-1",
    adminEmail: "admin@example.com",
    allowedOrigin: "https://rongxinshenyu.com",
    pixelId: "4400969670158242",
    graphVersion: "v23.0",
    capiToken: "",
    testEventCode: ""
  };
  const deps = sandbox.createDependencies_(config);
  assert.equal(sheetOpens, 0);
  for (const name of ["store", "claimEffects", "sendLead", "completeEffect", "notify"]) {
    assert.equal(typeof deps[name], "function");
  }

  const originalLoadConfig = sandbox.loadConfig_;
  const originalCreateDependencies = sandbox.createDependencies_;
  let xFrameMode = "";
  sandbox.loadConfig_ = () => config;
  sandbox.createDependencies_ = () => ({
    store() {
      return {
        duplicate: true,
        rowNumber: 2,
        capiStatus: "sent: 200",
        notificationStatus: "sent"
      };
    },
    claimEffects() { return { leaseToken: "", capi: false, notification: false }; },
    sendLead() { assert.fail("duplicate should not send"); },
    completeEffect() { assert.fail("duplicate should not update"); },
    notify() { assert.fail("duplicate should not notify"); }
  });
  sandbox.HtmlService = {
    XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
    createHtmlOutput(content) {
      return {
        content,
        setXFrameOptionsMode(mode) { xFrameMode = mode; return this; }
      };
    }
  };

  const output = sandbox.doPost({
    parameter: valid,
    parameters: { goals: valid.goals, availability: valid.availability }
  });

  assert.equal(xFrameMode, "ALLOWALL");
  assert.match(output.content, /"ok":true/);
  assert.match(output.content, /https:\/\/rongxinshenyu\.com/);
  assert.equal(output.content.includes(valid.stuckText), false);
  sandbox.loadConfig_ = originalLoadConfig;
  sandbox.createDependencies_ = originalCreateDependencies;
});
