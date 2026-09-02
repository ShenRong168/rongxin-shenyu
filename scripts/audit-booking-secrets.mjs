import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const obsoletePixelId = ["853091", "474317806"].join("");
const assignedSecretStartPattern = /(?<![A-Za-z0-9_])(?:["'`]\s*)?(META_CAPI_TOKEN|access_token)(?:\s*["'`])?\s*[:=]\s*/gi;
const bearerTokenPattern = /\bBearer\s+["'`]?([A-Za-z0-9._~+/=-]{12,})/gi;
const metaTokenPattern = /\bEAA[A-Za-z0-9_-]{12,}\b/g;

function unwrapScalar(value) {
  const candidate = String(value || "").trim();
  if (candidate.length >= 2) {
    const first = candidate[0];
    if ((first === '"' || first === "'" || first === "`") && candidate.at(-1) === first) {
      return candidate.slice(1, -1).trim();
    }
  }
  return candidate;
}

function isPlaceholder(value) {
  const candidate = unwrapScalar(value);
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

function stripMarkdownWrapping(value) {
  let candidate = unwrapScalar(value);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const match = candidate.match(/^(\*\*|__|~~|`)([\s\S]*)\1$/);
    if (!match) break;
    candidate = unwrapScalar(match[2]);
  }
  return candidate;
}

function isOpaqueSecret(value) {
  const candidate = stripMarkdownWrapping(value);
  return !isPlaceholder(candidate) && /^[A-Za-z0-9._~+/=-]{20,}$/.test(candidate);
}

function isCredentialCandidate(value, quoted) {
  const candidate = unwrapScalar(value);
  if (candidate.includes("${")) {
    const staticText = candidate.replace(/\$\{[^}]*\}/g, "");
    return staticText.replace(/[^A-Za-z0-9_-]+/g, "").length >= 4;
  }
  if (isPlaceholder(candidate)) return false;
  if (quoted) return /[A-Za-z0-9]/.test(candidate);
  return /^[A-Za-z0-9._~+/=-]{12,}$/.test(candidate);
}

function assignedExpressionEnd(text, offset) {
  const limit = Math.min(text.length, offset + 4096);
  let lineStart = offset;
  let depth = 0;
  let quote = null;

  for (let lines = 0; lines < 8 && lineStart < limit; lines += 1) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 || newline > limit ? limit : newline;
    let visible = "";
    let escaped = false;

    for (let index = lineStart; index < lineEnd; index += 1) {
      const character = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quote) {
        if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "/" && text[index + 1] === "/") break;
      if (character === "#") break;
      if (character === "(" || character === "[") depth += 1;
      if ((character === ")" || character === "]") && depth > 0) depth -= 1;
      visible += character;
    }

    const continues = depth > 0
      || /(?:\|\||\?\?|&&|\+)\s*$/.test(visible);
    if (!continues || newline === -1 || lineEnd >= limit) return lineEnd;
    lineStart = newline + 1;
  }

  return Math.min(limit, lineStart);
}

function assignedExpressionCandidates(text, offset) {
  const end = assignedExpressionEnd(text, offset);
  const candidates = [];
  let index = offset;

  while (index < end) {
    const character = text[index];
    if (/\s/.test(character) || character === "|" || character === "?" || character === "(" || character === ")") {
      index += 1;
      continue;
    }
    if (character === "," || character === ";" || character === "}" || character === "]" || character === "&" || character === "#") break;
    if (character === "/" && text[index + 1] === "/") break;

    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      const start = index + 1;
      let closed = false;
      index = start;
      while (index < end) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === quote) {
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) break;
      candidates.push({ value: text.slice(start, index), quoted: true });
      if (index < end) index += 1;
      continue;
    }

    if (text.startsWith("${", index)) {
      const closing = text.indexOf("}", index + 2);
      const candidateEnd = closing === -1 || closing >= end ? end : closing + 1;
      candidates.push({ value: text.slice(index, candidateEnd), quoted: false });
      index = candidateEnd;
      continue;
    }

    const start = index;
    while (index < end && !/[\s|?(),;}&\]#"'`]/.test(text[index])) index += 1;
    if (index > start) {
      candidates.push({ value: text.slice(start, index), quoted: false });
    } else {
      index += 1;
    }
  }

  return candidates;
}

function markdownTableCells(line) {
  if (!line.includes("|")) return [];
  return line.split("|").map((cell) => stripMarkdownWrapping(cell));
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

  assignedSecretStartPattern.lastIndex = 0;
  for (const match of text.matchAll(assignedSecretStartPattern)) {
    const candidates = assignedExpressionCandidates(text, match.index + match[0].length);
    if (candidates.some(({ value, quoted }) => isCredentialCandidate(value, quoted))) {
      addFinding("assigned-sensitive-key", match.index);
    }
  }

  const linePattern = /^.*$/gm;
  for (const match of text.matchAll(linePattern)) {
    const cells = markdownTableCells(match[0]);
    for (let index = 0; index < cells.length - 1; index += 1) {
      if (/^(?:META_CAPI_TOKEN|access_token)$/i.test(cells[index]) && isOpaqueSecret(cells[index + 1])) {
        addFinding("assigned-sensitive-key", match.index);
      }
    }
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
