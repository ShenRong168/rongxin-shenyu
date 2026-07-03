import { missingConfigKeys } from "./config.js";

const missing = missingConfigKeys();

if (missing.length) {
  console.error(`Missing required config: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Config looks ready.");
