// websocket.ts
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import config from "../config/config";
import {
  updateUserEmail,
  getNextUnemailedUsers,
  getUserById,
  getUserByUsername,
  incrementSkipCount,
  markUserAsProcessing,
  markUserAsAvailable,
} from "./scraper";

interface WebSocketMessage {
  type: "submit_email" | "request_user";
  data?: any;
}

interface CustomWebSocket extends WebSocket {
  id?: string;
}

const clientQueues = new WeakMap<CustomWebSocket, string[]>();

export function setupWebSocketServer() {
  const wss = new WebSocketServer({ port: config.websocket.port });

  console.log(
    `WebSocket server running on ws://localhost:${config.websocket.port}`
  );

  wss.on("connection", async (ws: CustomWebSocket, req: IncomingMessage) => {
    if (config.websocket.token) {
      const token = new URL(req.url || "/", "http://localhost").searchParams.get("token");
      if (token !== config.websocket.token) {
        console.warn("Rejected WebSocket client with invalid token");
        ws.close(1008, "Unauthorized");
        return;
      }
    }

    console.log("New client connected");
    clientQueues.set(ws, []);

    await sendNextUser(ws);

    ws.on("message", async (message: string) => {
      try {
        const parsedMessage = JSON.parse(
          message.toString()
        ) as WebSocketMessage;

        if (parsedMessage.type === "submit_email") {
          const { userId, email, username } = parsedMessage.data;

          // Resolve the user: prefer userId, fall back to username
          let resolvedUserId = userId;
          if (!resolvedUserId || resolvedUserId === "unknown") {
            if (username) {
              const user = await getUserByUsername(username);
              if (user) {
                resolvedUserId = user.id;
                console.log(`Resolved user by username fallback: ${username} → ${resolvedUserId}`);
              } else {
                console.log(`Could not resolve username: ${username}`);
                await sendNextUser(ws);
                return;
              }
            } else {
              console.log(`No userId or username provided, skipping`);
              await sendNextUser(ws);
              return;
            }
          }

          // Validate consistency if both userId and username are provided
          if (userId && userId !== "unknown" && username) {
            const userByUsername = await getUserByUsername(username);
            if (userByUsername && String(userByUsername.id) !== String(userId)) {
              console.warn(
                `ID/username mismatch: userId=${userId} but username "${username}" resolves to id=${userByUsername.id}. Using username-resolved ID.`
              );
              resolvedUserId = userByUsername.id;
            }
          }

          const asteriskPattern = /\*{5,}/;
          const isGenericEmail = asteriskPattern.test(email.split("@")[0]);

          if (isGenericEmail) {
            console.log(`Skipping generic email for user ${resolvedUserId}`);
            await incrementSkipCount(resolvedUserId);
          } else {
            if (isValidEmail(email)) {
              await updateUserEmail(resolvedUserId, email);
              console.log(`Updated email for user ${resolvedUserId}: ${email}`);
            } else {
              console.log(`Invalid email format for user ${resolvedUserId}: ${email}`);
              await incrementSkipCount(resolvedUserId);
            }
          }
          await markUserAsAvailable(resolvedUserId);
          await sendNextUser(ws);
        }
      } catch (error) {
        console.error("Error processing message:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            data: "Invalid message format",
          })
        );
      }
    });

    ws.on("close", async () => {
      console.log("Client disconnected");
      const queue = clientQueues.get(ws) || [];
      for (const userId of queue) {
        await markUserAsAvailable(userId);
      }
      clientQueues.delete(ws);
    });
  });

  return wss;
}

async function sendNextUser(ws: CustomWebSocket) {
  const queue = clientQueues.get(ws) || [];

  if (queue.length === 0) {
    const users = await getNextUnemailedUsers(5);
    if (users.length > 0) {
      for (const user of users) {
        await markUserAsProcessing(user.id);
      }
      queue.push(...users.map((u) => u.id));
    }
  }

  if (queue.length > 0) {
    const userId = queue.shift()!;
    const user = await getUserById(userId);

    if (user) {
      ws.send(
        JSON.stringify({
          type: "next_user",
          data: {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
          },
        })
      );
      return;
    }
  }

  console.log("No more users available for this client");
  ws.send(
    JSON.stringify({
      type: "complete",
      data: "All available users have been processed",
    })
  );
}

function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}
