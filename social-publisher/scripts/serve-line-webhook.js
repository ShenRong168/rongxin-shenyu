import dotenv from "dotenv";
import { resolve } from "node:path";
import { createLineWebhookApp } from "../src/line-webhook-app.js";

dotenv.config();

const port = Number(process.env.LINE_WEBHOOK_PORT || 3001);
const statePath = resolve(
  process.env.LINE_FOLLOWER_STATE_FILE || "data/line-followers-count.json"
);
const app = createLineWebhookApp({
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  stateToken: process.env.LINE_FOLLOWER_STATE_TOKEN,
  statePath
});

app.listen(port, () => {
  console.log(`LINE webhook service running at http://localhost:${port}`);
});
