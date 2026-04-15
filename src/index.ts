#!/usr/bin/env node
import { randomBytes } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerTools } from "./tools/register.js";
import express from "express";
import cors from "cors";

const server = new McpServer({
  name: "revit-mcp-server",
  version: "1.0.0",
});

const API_KEY = process.env.API_KEY || randomBytes(32).toString("hex");
console.error(`API_KEY: ${API_KEY}`);

async function startHttp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Optional API key auth
  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    if (API_KEY) {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${API_KEY}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }
    next();
  });

  // Health check — Render dùng để kiểm tra service còn sống
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const transports: Record<string, SSEServerTransport> = {};

  // SSE endpoint — client kết nối vào đây
  app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;
    res.on("close", () => {
      delete transports[transport.sessionId];
    });
    await server.connect(transport);
    console.error(`Client connected: ${transport.sessionId}`);
  });

  // Messages endpoint — client gửi request qua đây
  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (!transport) {
      res.status(400).json({ error: "No active SSE connection for sessionId" });
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  const port = parseInt(process.env.PORT || "3000");
  app.listen(port, () => {
    console.error(`Revit MCP Server (HTTP/SSE) listening on port ${port}`);
  });
}

async function startStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Revit MCP Server started (stdio).");
}

async function main() {
  await registerTools(server);

  const useHttp = process.env.MCP_TRANSPORT === "http" || !!process.env.PORT;
  if (useHttp) {
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((error) => {
  console.error("Error starting Revit MCP Server:", error);
  process.exit(1);
});
