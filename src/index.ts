#!/usr/bin/env node
import { randomBytes } from "crypto";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools/register.js";
import express from "express";
import cors from "cors";

const server = new McpServer({
  name: "revit-mcp-server",
  version: "1.0.0",
});

const API_KEY = process.env.API_KEY || randomBytes(32).toString("hex");
console.error(`API_KEY: ${API_KEY}`);

// Collect tool metadata by intercepting server.tool()
const toolRegistry: Array<{ name: string; description: string }> = [];
const _originalTool = server.tool.bind(server);
(server as any).tool = (name: string, description: string, ...rest: any[]) => {
  toolRegistry.push({ name, description });
  return (_originalTool as any)(name, description, ...rest);
};

async function startHttp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check — Render dùng để kiểm tra service còn sống
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // List all registered MCP tools (public, no auth required)
  app.get("/mcp/tools", (_req, res) => {
    res.json({ count: toolRegistry.length, tools: toolRegistry });
  });

  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Single MCP endpoint — handles GET (stream) and POST (messages)
  app.all("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (!sessionId && req.method === "POST") {
      // New session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      await server.connect(transport);
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
        console.error(`Session closed: ${transport.sessionId}`);
      };
      if (transport.sessionId) {
        transports.set(transport.sessionId, transport);
        console.error(`New session: ${transport.sessionId}`);
      }
    } else {
      res.status(400).json({ error: "Invalid or missing mcp-session-id" });
      return;
    }

    await transport.handleRequest(req, res, req.body);
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
