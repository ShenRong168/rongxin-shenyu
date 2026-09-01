import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifestUrl = new URL("../apps-script/booking-intake/appsscript.json", import.meta.url);
const readmeUrl = new URL("../apps-script/booking-intake/README.md", import.meta.url);

async function readOrEmpty(url) {
  try {
    return await readFile(url, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

test("Apps Script manifest grants only the required runtime settings and OAuth scopes", async () => {
  const source = await readOrEmpty(manifestUrl);
  assert.notEqual(source, "", "appsscript.json must exist");

  const manifest = JSON.parse(source);
  assert.deepEqual(manifest, {
    timeZone: "Asia/Taipei",
    dependencies: {},
    exceptionLogging: "STACKDRIVER",
    runtimeVersion: "V8",
    oauthScopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/script.external_request",
      "https://www.googleapis.com/auth/script.send_mail",
      "https://www.googleapis.com/auth/script.storage"
    ]
  });
});

test("deployment guide documents every Script Property without embedding a CAPI token", async () => {
  const readme = await readOrEmpty(readmeUrl);
  assert.notEqual(readme, "", "README.md must exist");

  for (const required of [
    "SPREADSHEET_ID",
    "ALLOWED_ORIGIN",
    "https://rongxinshenyu.com",
    "ADMIN_EMAIL",
    "anchen918@gmail.com",
    "META_PIXEL_ID",
    "4400969670158242",
    "META_GRAPH_VERSION",
    "v22.0",
    "META_CAPI_TOKEN",
    "META_TEST_EVENT_CODE"
  ]) {
    assert.ok(readme.includes(required), `README must document ${required}`);
  }

  assert.match(readme, /existing response sheet URL/i);
  assert.match(readme, /never (?:commit|store).*?(?:repository|repo)/i);
  assert.match(readme, /Script Properties.*never.*(?:repository|repo).*chat/is);
  assert.match(readme, /delete.*META_TEST_EVENT_CODE.*after testing/is);
  assert.doesNotMatch(readme, /META_CAPI_TOKEN\s*=\s*\S+/);
  assert.doesNotMatch(readme, /access_token=[A-Za-z0-9]/);
});

test("deployment guide requires the versioned production web-app path and authorization", async () => {
  const readme = await readOrEmpty(readmeUrl);

  for (const required of [
    "spreadsheet-bound",
    "Code.gs",
    "appsscript.json",
    "versioned",
    "Execute as",
    "deployer",
    "Anyone",
    "/exec",
    "/dev",
    "authorize"
  ]) {
    assert.ok(readme.includes(required), `README must document ${required}`);
  }
});

test("deployment guide captures verification and rollback invariants", async () => {
  const readme = await readOrEmpty(readmeUrl);

  for (const required of [
    "17-column",
    "formula",
    "Meta CAPI",
    "notification",
    "submission fingerprint",
    "lock-fenced",
    "33 tests",
    "Google Form",
    "response sheet",
    "fallback form",
    "booking release",
    "prior version",
    "853091474317806",
    "separate decision"
  ]) {
    assert.ok(readme.includes(required), `README must document ${required}`);
  }
});
