import "dotenv/config";
import express from "express";

import { initDb } from "./database/db";
import { setupWebSocketServer } from "./modules/websocket";
import { setupSchedules } from "./modules/scheduleManager";
import { createSnsWebhookRouter } from "./modules/snsWebhook";
import config from "./config/config";

async function main() {
  await initDb();
  setupWebSocketServer();
  setupSchedules();

  // Express server for SNS webhook
  const app = express();
  app.use(express.json({ type: ["application/json", "text/plain"] }));
  app.use(createSnsWebhookRouter());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.listen(config.webhook.port, () => {
    console.log(
      `Webhook server running on http://localhost:${config.webhook.port}`
    );
  });
}

main().catch(console.error);
