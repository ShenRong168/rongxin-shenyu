import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("booking page exposes only approved first-stage fields", async () => {
  const html = await read("booking.html");
  for (const name of ["displayName", "email", "stuckText", "topic", "goals", "availability", "adultConfirmed", "taiwanConfirmed", "consentConfirmed"]) assert.match(html, new RegExp(`name=["']${name}["']`));
  for (const rejected of ["emergencyContact", "recordingConsent", "phone", "city"]) assert.doesNotMatch(html, new RegExp(`name=["']${rejected}["']`));
  assert.match(html, /id="safety-gate"/);
  assert.match(html, /119/);
  assert.match(html, /110/);
  assert.match(html, /1925/);
  assert.match(html, /target="booking-response"/);
});
