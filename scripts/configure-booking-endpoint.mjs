import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function writeBookingConfig(
  endpoint,
  outputPath = fileURLToPath(new URL("./booking-config.mjs", import.meta.url)),
) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) {
    throw new Error("Invalid Apps Script deployment URL");
  }

  await writeFile(
    outputPath,
    `export const BOOKING_ENDPOINT = ${JSON.stringify(endpoint)};\n`,
    "utf8",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeBookingConfig(process.argv[2] || "");
}
