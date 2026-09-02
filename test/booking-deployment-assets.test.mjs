import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const manifestUrl = new URL("../apps-script/booking-intake/appsscript.json", import.meta.url);
const readmeUrl = new URL("../apps-script/booking-intake/README.md", import.meta.url);
const bookingIntakeUrl = new URL("../apps-script/booking-intake/", import.meta.url);
const metaCapiTokenKey = ["META_CAPI", "TOKEN"].join("_");
const priorPixelId = ["853091", "474317806"].join("");

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

const secretValuePattern = String.raw`(?:EAA[A-Za-z0-9_-]{12,}|[A-Za-z0-9_-]{24,})`;

function findAssignedSecrets(source) {
  const patterns = [
    {
      kind: "markdown-table",
      expression: new RegExp(String.raw`\|\s*\`?(?:META_CAPI_TOKEN|access_token)\`?\s*\|\s*\`?${secretValuePattern}\`?\s*\|`, "gi")
    },
    {
      kind: "json",
      expression: new RegExp(String.raw`["'](?:META_CAPI_TOKEN|access_token)["']\s*:\s*["']${secretValuePattern}["']`, "gi")
    },
    {
      kind: "colon",
      expression: new RegExp(String.raw`(?:^|\s)(?:META_CAPI_TOKEN|access_token)\s*:\s*["'\`]?[A-Za-z0-9_-]{24,}["'\`]?`, "gim")
    },
    {
      kind: "equals",
      expression: new RegExp(String.raw`(?:META_CAPI_TOKEN|access_token)\s*=\s*["'\`]?${secretValuePattern}["'\`]?`, "gi")
    },
    {
      kind: "plausible-meta-token",
      expression: /\bEAA[A-Za-z0-9_-]{12,}\b/g
    }
  ];

  return patterns.flatMap(({ kind, expression }) => {
    expression.lastIndex = 0;
    let count = 0;
    while (expression.test(source)) {
      count += 1;
    }
    expression.lastIndex = 0;
    return count > 0 ? [{ kind, count }] : [];
  });
}

async function readFilesRecursively(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directoryUrl);
    if (entry.isDirectory()) {
      files.push(...await readFilesRecursively(entryUrl));
    } else if (entry.isFile()) {
      files.push({ name: entryUrl.pathname, source: await readFile(entryUrl, "utf8") });
    }
  }
  return files;
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
  assert.deepEqual(findAssignedSecrets(readme), []);
});

test("secret scanner rejects assigned credentials in supported file formats", () => {
  const token = "EAAFixtureToken1234567890";
  const fixtures = [
    ["markdown-table", `| META_CAPI_TOKEN | ${token} |`],
    ["colon", `META_CAPI_TOKEN: ${token}`],
    ["json", `{"META_CAPI_TOKEN":"${token}"}`],
    ["equals", `${metaCapiTokenKey}=${token}`],
    ["equals", `access_token=${token}`]
  ];

  for (const [expectedKind, fixture] of fixtures) {
    const findings = findAssignedSecrets(fixture);
    assert.ok(
      findings.some(({ kind }) => kind === expectedKind),
      `${expectedKind} fixture must be rejected`
    );
  }

  assert.deepEqual(findAssignedSecrets("Use the `META_CAPI_TOKEN` Script Property."), []);
  assert.deepEqual(
    findAssignedSecrets("| `META_CAPI_TOKEN` | Store the user-provided value in Script Properties. |"),
    []
  );
});

test("secret scanner findings and assertion failures never retain credential values", () => {
  const distinctiveToken = "EAADistinctiveDoNotExpose9876543210";
  const findings = findAssignedSecrets(`${metaCapiTokenKey}=${distinctiveToken}`);
  let scanFailure;
  try {
    assert.deepEqual(findings, []);
  } catch (error) {
    scanFailure = error;
  }

  assert.deepEqual(
    {
      detected: findings.length > 0,
      findingsAreRedacted: !JSON.stringify(findings).includes(distinctiveToken),
      assertionIsRedacted:
        Boolean(scanFailure) && !String(scanFailure.stack || scanFailure).includes(distinctiveToken)
    },
    {
      detected: true,
      findingsAreRedacted: true,
      assertionIsRedacted: true
    }
  );
});

test("booking intake directory contains no assigned credential values", async () => {
  const files = await readFilesRecursively(bookingIntakeUrl);
  const findings = files.flatMap(({ name, source }) =>
    findAssignedSecrets(source).map((finding) => ({ name, ...finding }))
  );
  assert.deepEqual(findings, []);
});

test("deployment guide preserves the production web-app identity on updates", async () => {
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

  assert.match(readme, /first deployment[\s\S]*Deploy → New deployment/i);
  assert.match(
    readme,
    /update[\s\S]*Deploy → Manage deployments → Edit existing deployment[\s\S]*New version/i
  );
  assert.match(readme, /same deployment ID[\s\S]*same `\/exec` URL/i);
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
    "Google Form",
    "response sheet",
    "fallback form",
    "booking release",
    "prior version",
    priorPixelId,
    "separate decision"
  ]) {
    assert.ok(readme.includes(required), `README must document ${required}`);
  }

  assert.match(readme, /node --test test\/\*\.test\.mjs/);
  assert.ok(readme.includes("test/booking-deployment-assets.test.mjs"));
  assert.doesNotMatch(readme, /\b33 tests\b/i);
  assert.match(readme, /Meta CAPI[^\n]*exactly `sent: 200`/i);
  assert.match(readme, /notification[^\n]*exactly `sent`/i);
  assert.match(readme, /browser[^\n]*server[^\n]*Lead[^\n]*same `event_id`/i);
  assert.match(readme, /Meta[^\n]*deduplicated/i);
  assert.match(readme, /delete[^\n]*exact synthetic test row/i);
  assert.match(readme, /delete[^\n]*`META_TEST_EVENT_CODE`/i);
});
