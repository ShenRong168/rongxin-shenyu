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

test("processSubmission_ executes Meta and notification as separate lock-fenced effects", () => {
  const input = sandbox.validateSubmission_(valid);
  const calls = [];
  const deps = {
    store(value) {
      calls.push(["store", value.eventId]);
      return {
        duplicate: false,
        rowNumber: 2,
        capiStatus: "pending",
        notificationStatus: "pending"
      };
    },
    runEffect(rowNumber, effect, operation) {
      calls.push(["lock-start", rowNumber, effect]);
      const status = operation();
      calls.push(["lock-end", rowNumber, effect, status]);
      return { retryable: false, status };
    },
    sendLead(value) {
      calls.push(["capi", value.eventId]);
      return { status: "sent", responseCode: 200 };
    },
    notify(value) {
      calls.push(["notification", value.email]);
    }
  };

  const result = sandbox.processSubmission_(input, deps);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    duplicate: false,
    eventId: valid.eventId
  });
  assert.deepEqual(calls, [
    ["store", valid.eventId],
    ["lock-start", 2, "capi"],
    ["capi", valid.eventId],
    ["lock-end", 2, "capi", "sent: 200"],
    ["lock-start", 2, "notification"],
    ["notification", "user@example.com"],
    ["lock-end", 2, "notification", "sent"]
  ]);
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
    runEffect() { return { retryable: false, skipped: true, status: "sent" }; },
    sendLead: untouched,
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

test("processSubmission_ keeps a stored lead successful after ordinary downstream failures", () => {
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
    runEffect(_rowNumber, effect, operation) {
      let status;
      try {
        status = operation();
      } catch (error) {
        status = `failed: ${error.message}`;
      }
      statuses.push([effect, status]);
      return { retryable: false, status };
    },
    sendLead() { throw new Error("Meta unavailable"); },
    notify() { throw new Error("Mail unavailable"); }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    duplicate: false,
    eventId: valid.eventId
  });
  assert.deepEqual(statuses, [
    ["capi", "failed: Meta unavailable"],
    ["notification", "failed: Mail unavailable"]
  ]);
});

test("processSubmission_ reports a retryable failure when an effect lock is busy", () => {
  const input = sandbox.validateSubmission_(valid);
  let notificationAttempted = false;
  const result = sandbox.processSubmission_(input, {
    store() {
      return {
        duplicate: true,
        rowNumber: 2,
        capiStatus: "processing",
        notificationStatus: "pending"
      };
    },
    runEffect() { return { retryable: true }; },
    sendLead() { assert.fail("busy lock executed Meta"); },
    notify() { notificationAttempted = true; }
  });

  assert.equal(result.ok, false);
  assert.equal(result.duplicate, true);
  assert.equal(result.eventId, valid.eventId);
  assert.equal(result.message, "目前忙碌中，請稍後重試。");
  assert.equal(notificationAttempted, false);
  const html = sandbox.renderBridge_(result, "https://rongxinshenyu.com");
  assert.match(html, /"ok":false/);
  assert.equal(html.includes(valid.stuckText), false);
  assert.equal(html.includes(valid.email), false);
});

test("inputFingerprint_ is stable for canonical input and changes with any bound payload field", () => {
  const input = sandbox.validateSubmission_(valid);
  assert.equal(sandbox.inputFingerprint_(input), sandbox.inputFingerprint_({ ...input }));
  for (const changed of [
    { displayName: "另一個人" },
    { stuckText: `${input.stuckText}不同` },
    { email: "other@example.com" },
    { goals: ["被理解"] },
    { submittedAt: input.submittedAt + 1 }
  ]) {
    assert.notEqual(
      sandbox.inputFingerprint_(input),
      sandbox.inputFingerprint_({ ...input, ...changed })
    );
  }
  const fingerprint = sandbox.inputFingerprint_(input);
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  const meta = sandbox.buildMetaPayload_(input, {}, 1700000020);
  assert.equal(JSON.stringify(meta).includes(fingerprint), false);
});

test("processSubmission_ never runs effects when duplicate payload identity is rejected", () => {
  const untouched = () => assert.fail("changed duplicate triggered an effect");
  assert.throws(
    () => sandbox.processSubmission_(sandbox.validateSubmission_(valid), {
      store() { throw new Error("Invalid duplicate submission"); },
      runEffect: untouched,
      sendLead: untouched,
      notify: untouched
    }),
    /invalid duplicate submission/i
  );
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

test("renderBridge_ reaches the outer site through the HtmlService iframe sandbox", () => {
  const html = sandbox.renderBridge_(
    { ok: true, eventId: valid.eventId },
    "https://rongxinshenyu.com"
  );

  assert.match(html, /^<!doctype html><html><head><meta charset="utf-8"><\/head><body>/);
  assert.match(html, /window\.top\.postMessage\(/);
  assert.doesNotMatch(html, /(?:^|[^.])parent\.postMessage\(/);
  assert.match(html, /<\/body><\/html>$/);
});

test("rowFor_ creates the approved 17-column row with fingerprint and separate states", () => {
  const input = sandbox.validateSubmission_(valid);
  const row = sandbox.rowFor_(input);

  assert.equal(row.length, 17);
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
    sandbox.inputFingerprint_(input),
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
      if (column === 13 && columns === 4) {
        const storedRow = writes[1].values[0];
        return { getValues() { return [[storedRow[12], storedRow[13], "sent: 200", "sent"]]; } };
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
  assert.equal(writes[1].values[0].length, 17);
  assert.equal(writes[1].values[0][12], sandbox.inputFingerprint_(input));
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

  assert.throws(
    () => sandbox.storeInput_(
      { spreadsheetId: "sheet-1" },
      sandbox.validateSubmission_({ ...valid, displayName: "被換掉的稱呼" })
    ),
    /invalid duplicate submission/i
  );
  assert.equal(writes.length, 2, "changed duplicate replaced the original row");
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

test("runEffect_ holds one lock across one external effect and its durable state transitions", () => {
  const statuses = { 15: "pending", 16: "pending" };
  const timeline = [];
  let lockHeld = false;
  const sheet = {
    getLastRow() { return 2; },
    getRange(row, column) {
      assert.equal(row, 2);
      return {
        getValue() {
          assert.equal(lockHeld, true);
          timeline.push(["read", column, statuses[column]]);
          return statuses[column];
        },
        setValue(value) {
          assert.equal(lockHeld, true);
          statuses[column] = value;
          timeline.push(["write", column, value]);
        }
      };
    }
  };
  sandbox.SpreadsheetApp = {
    openById() { return { getSheetByName() { return sheet; } }; },
    flush() { assert.equal(lockHeld, true); timeline.push(["flush"]); }
  };
  sandbox.LockService = {
    getScriptLock() {
      return {
        waitLock(milliseconds) {
          assert.equal(milliseconds, 120000);
          assert.equal(lockHeld, false);
          lockHeld = true;
          timeline.push(["lock"]);
        },
        releaseLock() {
          assert.equal(lockHeld, true);
          timeline.push(["release"]);
          lockHeld = false;
        }
      };
    }
  };

  const capi = sandbox.runEffect_({ spreadsheetId: "sheet-1" }, 2, "capi", () => {
    assert.equal(lockHeld, true);
    assert.equal(statuses[15], "processing");
    assert.equal(statuses[16], "pending", "notification was claimed during Meta");
    timeline.push(["external", "capi"]);
    return "sent: 200";
  });
  assert.deepEqual(JSON.parse(JSON.stringify(capi)), { retryable: false, skipped: false, status: "sent: 200" });
  assert.equal(statuses[15], "sent: 200");
  assert.equal(statuses[16], "pending");

  const notification = sandbox.runEffect_({ spreadsheetId: "sheet-1" }, 2, "notification", () => {
    assert.equal(lockHeld, true);
    assert.equal(statuses[15], "sent: 200");
    assert.equal(statuses[16], "processing");
    timeline.push(["external", "notification"]);
    return "sent";
  });
  assert.deepEqual(JSON.parse(JSON.stringify(notification)), { retryable: false, skipped: false, status: "sent" });
  assert.equal(statuses[16], "sent");
  assert.equal(timeline.filter(([event]) => event === "lock").length, 2);
  assert.equal(timeline.filter(([event]) => event === "release").length, 2);
});

test("runEffect_ skips sent state and resumes interrupted processing while holding the lock", () => {
  let status = "sent: 200";
  let calls = 0;
  let lockHeld = false;
  const sheet = {
    getLastRow() { return 2; },
    getRange() {
      return {
        getValue() { assert.equal(lockHeld, true); return status; },
        setValue(value) { assert.equal(lockHeld, true); status = value; }
      };
    }
  };
  sandbox.SpreadsheetApp = {
    openById() { return { getSheetByName() { return sheet; } }; },
    flush() { assert.equal(lockHeld, true); }
  };
  sandbox.LockService = {
    getScriptLock() {
      return {
        waitLock() { lockHeld = true; },
        releaseLock() { lockHeld = false; }
      };
    }
  };

  const skipped = sandbox.runEffect_({ spreadsheetId: "sheet-1" }, 2, "capi", () => {
    calls += 1;
    return "sent: 200";
  });
  assert.deepEqual(JSON.parse(JSON.stringify(skipped)), { retryable: false, skipped: true, status: "sent: 200" });
  assert.equal(calls, 0);

  status = "processing";
  const resumed = sandbox.runEffect_({ spreadsheetId: "sheet-1" }, 2, "capi", () => {
    assert.equal(lockHeld, true);
    calls += 1;
    return "sent: 200";
  });
  assert.deepEqual(JSON.parse(JSON.stringify(resumed)), { retryable: false, skipped: false, status: "sent: 200" });
  assert.equal(calls, 1);
  assert.equal(status, "sent: 200");

  status = "pending";
  const failed = sandbox.runEffect_({ spreadsheetId: "sheet-1" }, 2, "notification", () => {
    throw new Error("Mail unavailable");
  });
  assert.deepEqual(JSON.parse(JSON.stringify(failed)), {
    retryable: false,
    skipped: false,
    status: "failed: Mail unavailable"
  });
  assert.equal(status, "failed: Mail unavailable");
});

test("runEffect_ returns retryable failure when lock acquisition or state persistence is busy", () => {
  let releases = 0;
  sandbox.LockService = {
    getScriptLock() {
      return {
        waitLock() { throw new Error("Lock timeout"); },
        releaseLock() { releases += 1; }
      };
    }
  };
  let called = false;
  const result = sandbox.runEffect_({ spreadsheetId: "sheet-1" }, 2, "capi", () => {
    called = true;
    return "sent: 200";
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { retryable: true });
  assert.equal(called, false);
  assert.equal(releases, 0);

  sandbox.LockService = {
    getScriptLock() {
      return {
        waitLock() {},
        releaseLock() { releases += 1; }
      };
    }
  };
  sandbox.SpreadsheetApp = {
    openById() {
      return {
        getSheetByName() {
          return {
            getLastRow() { return 2; },
            getRange() {
              return {
                getValue() { return "pending"; },
                setValue() { throw new Error("sheet busy"); }
              };
            }
          };
        }
      };
    },
    flush() {}
  };
  const stateBusy = sandbox.runEffect_({ spreadsheetId: "sheet-1" }, 2, "capi", () => {
    called = true;
    return "sent: 200";
  });
  assert.deepEqual(JSON.parse(JSON.stringify(stateBusy)), { retryable: true });
  assert.equal(called, false);
  assert.equal(releases, 1);
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
  assert.equal(sent[0].body.includes(sandbox.inputFingerprint_(input)), false, "notice leaked fingerprint");

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
  for (const name of ["store", "runEffect", "sendLead", "notify"]) {
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
    runEffect() { return { retryable: false, skipped: true, status: "sent" }; },
    sendLead() { assert.fail("duplicate should not send"); },
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
