import { missingConfigKeys } from "./config.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredPostFields = ["id", "scheduledAt", "platforms", "status", "message"];

const missing = missingConfigKeys();

if (missing.length) {
  console.error(`Missing required config: ${missing.join(", ")}`);
  process.exit(1);
}

const schedulePath = resolve(process.env.SCHEDULE_FILE || "scheduled-posts.json");

try {
  validateSchedule(JSON.parse(readFileSync(schedulePath, "utf8")));
} catch (error) {
  console.error(`Invalid scheduled posts file (${schedulePath}): ${error.message}`);
  process.exit(1);
}

console.log("Config looks ready.");

function validateSchedule(schedule) {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    throw new Error("top-level value must be an object, not an array");
  }

  if (!Array.isArray(schedule.posts)) {
    throw new Error("posts must be an array");
  }

  schedule.posts.forEach((post, index) => {
    if (!post || typeof post !== "object" || Array.isArray(post)) {
      throw new Error(`post ${index} must be an object`);
    }

    for (const field of requiredPostFields) {
      if (!Object.hasOwn(post, field)) {
        throw new Error(`post ${index} is missing required field: ${field}`);
      }
    }
  });
}
