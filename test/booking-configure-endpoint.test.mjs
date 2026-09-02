import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeBookingConfig } from "../scripts/configure-booking-endpoint.mjs";

test("writes an importable config only for a deployed Apps Script exec URL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "booking-config-"));
  const path = join(dir, "booking-config.mjs");
  const endpoint = "https://script.google.com/macros/s/ABC123/exec";

  await writeBookingConfig(endpoint, path);

  assert.equal(
    await readFile(path, "utf8"),
    `export const BOOKING_ENDPOINT = ${JSON.stringify(endpoint)};\n`,
  );
  await assert.rejects(
    () => writeBookingConfig("https://example.com/exec", path),
    /Invalid Apps Script/,
  );
});
