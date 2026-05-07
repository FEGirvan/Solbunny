import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { wss } from "./lib/ws-server";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required.");

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

const server = http.createServer(app);

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/api/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(port, (err?: Error) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
});
