import express from "express";
import { readFile } from "node:fs/promises";
import { handleLineWebhook } from "./line-webhook.js";

export function createLineWebhookApp({ channelSecret, stateToken, statePath }) {
  if (!channelSecret) throw new Error("LINE_CHANNEL_SECRET is required");
  if (!stateToken) throw new Error("LINE_FOLLOWER_STATE_TOKEN is required");
  if (!statePath) throw new Error("LINE_FOLLOWER_STATE_FILE is required");

  const app = express();

  app.post("/webhooks/line", express.raw({ type: "application/json", limit: "256kb" }), async (req, res, next) => {
    try {
      await handleLineWebhook({
        rawBody: req.body,
        signature: req.get("x-line-signature"),
        channelSecret,
        statePath
      });
      res.json({});
    } catch (error) {
      next(error);
    }
  });

  app.get("/internal/line-follower-state", async (req, res, next) => {
    try {
      if (req.get("authorization") !== `Bearer ${stateToken}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const state = JSON.parse(await readFile(statePath, "utf8"));
      if (!Number.isInteger(state.count) || state.count < 0) {
        throw new Error("Invalid LINE follower state");
      }
      return res.json({
        count: state.count,
        webhookVerifiedAt: state.webhookVerifiedAt || null,
        updatedAt: state.updatedAt || null
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use((error, _req, res, _next) => {
    const invalidSignature = /signature/i.test(error.message);
    res.status(invalidSignature ? 401 : 400).json({ error: error.message });
  });

  return app;
}
