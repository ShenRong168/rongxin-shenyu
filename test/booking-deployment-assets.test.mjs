import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  auditTrackedFiles,
  findBookingSecrets,
  formatSecretFindings
} from "../scripts/audit-booking-secrets.mjs";

const manifestUrl = new URL("../apps-script/booking-intake/appsscript.json", import.meta.url);
const readmeUrl = new URL("../apps-script/booking-intake/README.md", import.meta.url);
const metaCapiTokenKey = ["META_CAPI", "TOKEN"].join("_");
const accessTokenKey = ["access", "token"].join("_");
const priorPixelId = ["853091", "474317806"].join("");
const execFileAsync = promisify(execFile);

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
  assert.deepEqual(findBookingSecrets(readme, "apps-script/booking-intake/README.md"), []);
});

test("secret scanner rejects assigned credentials in supported file formats", () => {
  const token = ["EAA", "FixtureToken1234567890"].join("");
  const opaqueToken = ["aB3dE5fG7hJ9kL2mN4pQ6rS8", "uV0xYz"].join("");
  const fixtures = [
    ["assigned-sensitive-key", `${metaCapiTokenKey} = "${token}"`],
    ["assigned-sensitive-key", `"${metaCapiTokenKey}" : '${token}'`],
    ["assigned-sensitive-key", `${accessTokenKey}=\`${token}\``],
    ["assigned-sensitive-key", `"${accessTokenKey}": "${token}"`],
    ["assigned-sensitive-key", `"${accessTokenKey}" = "${opaqueToken}"`],
    ["assigned-sensitive-key", `| ${metaCapiTokenKey} | ${opaqueToken} |`],
    ["assigned-sensitive-key", `| \`${accessTokenKey}\` | \`${opaqueToken}\` |`],
    ["bearer-token", `Authorization: Bearer ${token}`],
    ["meta-token", `value ${token}`],
    ["obsolete-pixel", `pixel ${priorPixelId}`]
  ];

  for (const [expectedKind, fixture] of fixtures) {
    const findings = findBookingSecrets(fixture, "fixture.md");
    assert.ok(
      findings.some(({ kind }) => kind === expectedKind),
      `${expectedKind} fixture must be rejected`
    );
  }

  for (const safe of [
    `Use the \`${metaCapiTokenKey}\` Script Property.`,
    `${metaCapiTokenKey}=`,
    `${metaCapiTokenKey}=\${META_TOKEN}`,
    `"${accessTokenKey}": "<user-provided value>"`,
    `${accessTokenKey}=YOUR_TOKEN`,
    `Authorization: Bearer <token>`,
    `META_PAGE_ACCESS_TOKEN: \${{ secrets.META_PAGE_ACCESS_TOKEN }}`,
    `${accessTokenKey}: pageAccessToken`,
    `${accessTokenKey}: args.pageAccessToken`,
    `${accessTokenKey}: \`\${config.appId}|\${config.appSecret}\``,
    `${accessTokenKey}=...`,
    `GET \`/refresh?${accessTokenKey}=...\``,
    `${accessTokenKey}: "new_threads_token"`,
    `Authorization: Bearer secret-token`,
    `| Property | Value or handling |`,
    `| --- | --- |`,
    `| ${metaCapiTokenKey} | |`,
    `| ${metaCapiTokenKey} | \${META_TOKEN} |`,
    `| \`${accessTokenKey}\` | \`<YOUR_TOKEN>\` |`,
    `| ${accessTokenKey} | REPLACE_ME |`,
    `| ${metaCapiTokenKey} | Store the user-provided value in Script Properties. |`
  ]) {
    assert.deepEqual(findBookingSecrets(safe, "safe.md"), []);
  }
});

test("secret scanner findings and assertion failures never retain credential values", () => {
  const distinctiveToken = ["EAA", "DistinctiveDoNotExpose9876543210"].join("");
  const findings = findBookingSecrets(`${metaCapiTokenKey}=${distinctiveToken}`, "fixture.md");
  const tableFindings = findBookingSecrets(`| ${accessTokenKey} | ${distinctiveToken} |`, "fixture.md");
  const formatted = formatSecretFindings([...findings, ...tableFindings]);
  let scanFailure;
  try {
    assert.deepEqual(findings, []);
  } catch (error) {
    scanFailure = error;
  }

  assert.deepEqual(
    {
      detected: findings.length > 0,
      tableDetected: tableFindings.length > 0,
      findingsAreRedacted: !JSON.stringify([...findings, ...tableFindings]).includes(distinctiveToken),
      formattedIsRedacted: !formatted.includes(distinctiveToken),
      assertionIsRedacted:
        Boolean(scanFailure) && !String(scanFailure.stack || scanFailure).includes(distinctiveToken)
    },
    {
      detected: true,
      tableDetected: true,
      findingsAreRedacted: true,
      formattedIsRedacted: true,
      assertionIsRedacted: true
    }
  );
});

test("tracked secret audit includes hidden and Markdown files but ignores untracked files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "booking-secret-audit-"));
  await execFileAsync("git", ["init", "--quiet"], { cwd: directory });
  const trackedToken = ["EAA", "TrackedFixtureToken1234567890"].join("");
  const untrackedToken = ["EAA", "UntrackedFixtureToken1234567890"].join("");
  await writeFile(join(directory, ".tracked-secrets.md"), `${metaCapiTokenKey} = "${trackedToken}"\n`, "utf8");
  await writeFile(join(directory, "safe.md"), `Use ${metaCapiTokenKey} via Script Properties.\n`, "utf8");
  await writeFile(join(directory, "untracked.md"), `${accessTokenKey}=${untrackedToken}\n`, "utf8");
  await execFileAsync("git", ["add", ".tracked-secrets.md", "safe.md"], { cwd: directory });

  const result = await auditTrackedFiles(directory);
  assert.equal(result.filesScanned, 2);
  assert.deepEqual(result.findings.map(({ path, line, kind }) => ({ path, line, kind })), [
    { path: ".tracked-secrets.md", line: 1, kind: "assigned-sensitive-key" },
    { path: ".tracked-secrets.md", line: 1, kind: "meta-token" }
  ]);
  assert.ok(!JSON.stringify(result).includes(trackedToken));
  assert.ok(!JSON.stringify(result).includes(untrackedToken));
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
    "obsolete prior-trigger Pixel",
    "separate decision"
  ]) {
    assert.ok(readme.includes(required), `README must document ${required}`);
  }

  assert.match(readme, /node --test test\/booking-\*\.test\.mjs/);
  assert.match(readme, /deployment assets/i);
  assert.doesNotMatch(readme, /\b33 tests\b/i);
  assert.match(readme, /Meta CAPI[^\n]*exactly `sent: 200`/i);
  assert.match(readme, /notification[^\n]*exactly `sent`/i);
  assert.match(readme, /browser[^\n]*server[^\n]*Lead[^\n]*same `event_id`/i);
  assert.match(readme, /Meta[^\n]*deduplicated/i);
  assert.match(readme, /delete[^\n]*exact synthetic test row/i);
  assert.match(readme, /delete[^\n]*`META_TEST_EVENT_CODE`/i);
});
