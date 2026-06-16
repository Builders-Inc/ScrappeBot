import "dotenv/config";
import express from "express";

import { initDb } from "./database/db";
import { setupWebSocketServer } from "./modules/websocket";
import { setupSchedules } from "./modules/scheduleManager";
import { addAccountsHandler } from "./modules/helpers";

async function main() {
  await initDb();
  setupWebSocketServer();
  setupSchedules();

  const app = express();
  app.use(express.json());

  // Mount the single POST handler directly
  app.post("/api/add-accounts", (req, res, next) => {
    addAccountsHandler(req, res, next).catch(next);
  });

  app.listen(3000, () => {
    console.log("API server running on http://localhost:3000");
  });
}

main().catch(console.error);
