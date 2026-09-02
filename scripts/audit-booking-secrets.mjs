import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const obsoletePixelId = ["853091", "474317806"].join("");
const assignedSecretPattern = /(?<![A-Za-z0-9_])(?:["'`]\s*)?(META_CAPI_TOKEN|access_token)(?:\s*["'`])?\s*[:=]\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|`([^`\r\n]*)`|([^"'`\s,;#\]\r\n]+))/gi;
const bearerTokenPattern = /\bBearer\s+["'`]?([A-Za-z0-9._~+/=-]{12,})/gi;
const metaTokenPattern = /\bEAA[A-Za-z0-9_-]{12,}\b/g;

function isPlaceholder(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return true;
  if (candidate.includes("${") || /^\$\{\{/.test(candidate)) return true;
  if (/^(?:\$[A-Z_][A-Z0-9_]*|\{\{[^}]+\}\}|<[^>]+>|\.{3}|…)$/i.test(candidate)) return true;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(candidate)) return true;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:access)?token$/i.test(candidate)) return true;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*\([^)]*\)$/.test(candidate)) return true;
  if (/^(?:new|old|test|mock|fake|sample|fixture|secret|page|threads)[-_].*token$/i.test(candidate)) return true;
  const compact = candidate.toLowerCase().replace(/[\s_-]+/g, "");
  return /^(?:your)?(?:meta|capi|access)?token$/.test(compact)
    || /^(?:replace(?:me)?|placeholder|example|sample|redacted|masked|changeme|todo|tbd|null|undefined|none)$/.test(compact);
}

function lineNumberAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

export function findBookingSecrets(source, path = "<memory>") {
  const text = String(source);
  const findings = [];
  const seen = new Set();

  const addFinding = (kind, offset) => {
    const line = lineNumberAt(text, offset);
    const identity = `${path}\u0000${line}\u0000${kind}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    findings.push({ path, line, kind });
  };

  assignedSecretPattern.lastIndex = 0;
  for (const match of text.matchAll(assignedSecretPattern)) {
    const value = match.slice(2).find((candidate) => candidate !== undefined) || "";
    if (!isPlaceholder(value)) addFinding("assigned-sensitive-key", match.index);
  }

  bearerTokenPattern.lastIndex = 0;
  for (const match of text.matchAll(bearerTokenPattern)) {
    if (!isPlaceholder(match[1])) addFinding("bearer-token", match.index);
  }

  metaTokenPattern.lastIndex = 0;
  for (const match of text.matchAll(metaTokenPattern)) {
    addFinding("meta-token", match.index);
  }

  let pixelOffset = text.indexOf(obsoletePixelId);
  while (pixelOffset !== -1) {
    addFinding("obsolete-pixel", pixelOffset);
    pixelOffset = text.indexOf(obsoletePixelId, pixelOffset + obsoletePixelId.length);
  }

  return findings.sort((left, right) => left.path.localeCompare(right.path)
    || left.line - right.line
    || left.kind.localeCompare(right.kind));
}

export function formatSecretFindings(findings) {
  return findings.map(({ path, line, kind }) => `${path}:${line}: ${kind}`).join("\n");
}

async function trackedPaths(cwd) {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  return stdout.split("\u0000").filter(Boolean);
}

export async function auditTrackedFiles(cwd = process.cwd()) {
  const findings = [];
  let filesScanned = 0;

  for (const path of await trackedPaths(cwd)) {
    let buffer;
    try {
      buffer = await readFile(resolve(cwd, path));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (buffer.includes(0)) continue;
    filesScanned += 1;
    findings.push(...findBookingSecrets(buffer.toString("utf8"), path));
  }

  return { filesScanned, findings };
}

async function main() {
  const result = await auditTrackedFiles();
  if (result.findings.length > 0) {
    console.error(`Booking secret audit failed: ${result.findings.length} redacted finding(s).`);
    console.error(formatSecretFindings(result.findings));
    process.exitCode = 1;
    return;
  }
  console.log(`Booking secret audit passed: ${result.filesScanned} tracked text file(s) scanned.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Booking secret audit error: ${error?.message || "unknown failure"}`);
    process.exitCode = 2;
  });
}
