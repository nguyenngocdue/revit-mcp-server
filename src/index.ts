#!/usr/bin/env node
import { randomBytes } from "crypto";
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

  // Landing page
  app.get("/", (_req, res) => {
    const uptime = process.uptime();
    const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DeepBIM MCP Server</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 16px; padding: 48px; max-width: 560px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    .badge { display: inline-block; background: #22c55e22; color: #22c55e; border: 1px solid #22c55e44; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 24px; }
    h1 { font-size: 28px; font-weight: 700; color: #f8fafc; margin-bottom: 4px; }
    .sub { color: #64748b; font-size: 14px; margin-bottom: 32px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 32px; }
    .meta-item { background: #0f1117; border: 1px solid #2d3148; border-radius: 10px; padding: 14px 16px; }
    .meta-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
    .meta-value { font-size: 15px; font-weight: 600; color: #f1f5f9; }
    .divider { border: none; border-top: 1px solid #2d3148; margin: 0 0 24px; }
    .endpoints { display: flex; flex-direction: column; gap: 8px; }
    .ep { display: flex; align-items: center; gap: 12px; background: #0f1117; border: 1px solid #2d3148; border-radius: 8px; padding: 10px 14px; text-decoration: none; transition: border-color 0.15s; }
    .ep:hover { border-color: #6366f1; }
    .method { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; min-width: 40px; text-align: center; }
    .get { background: #0ea5e922; color: #38bdf8; }
    .post { background: #a855f722; color: #c084fc; }
    .all { background: #f59e0b22; color: #fbbf24; }
    .ep-path { font-size: 13px; font-family: monospace; color: #e2e8f0; }
    .ep-desc { font-size: 12px; color: #64748b; margin-left: auto; }
    .footer { margin-top: 28px; text-align: center; font-size: 12px; color: #475569; }
    .footer a { color: #6366f1; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● ONLINE</div>
    <h1>DeepBIM MCP Server</h1>
    <p class="sub">Model Context Protocol server for Autodesk Revit</p>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">Version</div>
        <div class="meta-value">1.0.0</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Tools</div>
        <div class="meta-value">${toolRegistry.length} registered</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Uptime</div>
        <div class="meta-value">${uptimeStr}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Protocol</div>
        <div class="meta-value">MCP 2024-11</div>
      </div>
    </div>
    <hr class="divider" />
    <div class="endpoints">
      <a class="ep" href="/mcp/tools">
        <span class="method get">GET</span>
        <span class="ep-path">/mcp/tools</span>
        <span class="ep-desc">List all tools</span>
      </a>
      <div class="ep">
        <span class="method all">ALL</span>
        <span class="ep-path">/mcp</span>
        <span class="ep-desc">MCP Streamable HTTP</span>
      </div>
      <a class="ep" href="/health">
        <span class="method get">GET</span>
        <span class="ep-path">/health</span>
        <span class="ep-desc">Health check</span>
      </a>
    </div>
    <div class="footer">
      Built by <a href="https://github.com/deepbim" target="_blank">DeepBIM</a> &mdash; Powered by MCP SDK
    </div>
  </div>
</body>
</html>`);
  });

  // List all registered MCP tools (public, no auth required)
  app.get("/mcp/tools", (_req, res) => {
    res.json({ count: toolRegistry.length, tools: toolRegistry });
  });

  // Debug endpoint — show Revit connection config and test TCP
  app.get("/debug", async (_req, res) => {
    const host = process.env.REVIT_HOST || "localhost";
    const port = process.env.REVIT_PORT || "(scan 8080-8099)";
    const portNum = process.env.REVIT_PORT ? parseInt(process.env.REVIT_PORT, 10) : 8080;

    let tcpStatus = "untested";
    let tcpError = "";
    try {
      const net = await import("net");
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);
        socket.on("connect", () => { socket.destroy(); resolve(); });
        socket.on("timeout", () => { socket.destroy(); reject(new Error("timeout")); });
        socket.on("error", (e) => { socket.destroy(); reject(e); });
        socket.connect(portNum, host);
      });
      tcpStatus = "connected";
    } catch (e: any) {
      tcpStatus = "failed";
      tcpError = e.message;
    }

    res.json({
      revit_host: host,
      revit_port: port,
      tcp_test: tcpStatus,
      tcp_error: tcpError || undefined,
    });
  });

  // Debug send — test full command/response cycle with Revit
  app.get("/debug-send", async (_req, res) => {
    const host = process.env.REVIT_HOST || "localhost";
    const portNum = process.env.REVIT_PORT ? parseInt(process.env.REVIT_PORT, 10) : 8080;
    const net = await import("net");

    const result: any = { host, port: portNum, steps: [] };

    try {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = new net.Socket();
        let buffer = "";
        let connected = false;

        socket.setTimeout(10000);

        socket.on("connect", () => {
          connected = true;
          result.steps.push("TCP connected");
          const cmd = JSON.stringify({ jsonrpc: "2.0", method: "say_hello", params: { message: "debug-test" }, id: "debug1" });
          socket.write(cmd);
          result.steps.push(`Sent: ${cmd}`);
        });

        socket.on("data", (data) => {
          buffer += data.toString();
          result.steps.push(`Received data: ${data.toString()}`);
          try {
            JSON.parse(buffer);
            socket.destroy();
            resolve(buffer);
          } catch { /* incomplete */ }
        });

        socket.on("timeout", () => {
          socket.destroy();
          result.steps.push("Timed out waiting for response");
          reject(new Error(`Timeout after 10s. Connected=${connected}. Buffer="${buffer}"`));
        });

        socket.on("error", (e) => {
          result.steps.push(`Error: ${e.message}`);
          reject(e);
        });

        socket.on("close", () => {
          result.steps.push("Socket closed");
          if (buffer) resolve(buffer);
        });

        socket.connect(portNum, host);
      });

      result.success = true;
      result.response = JSON.parse(response);
    } catch (e: any) {
      result.success = false;
      result.error = e.message;
    }

    res.json(result);
  });

  // MCP Streamable HTTP — stateless: fresh server per request
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    const sessionServer = new McpServer({
      name: "revit-mcp-server",
      version: "1.0.0",
    });
    await registerTools(sessionServer);
    await sessionServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (_req, res) => {
    res.status(405).json({ error: "Use POST for MCP Streamable HTTP" });
  });

  const port = parseInt(process.env.PORT || "3000");
  app.listen(port, () => {
    console.error(`Revit MCP Server (HTTP/Streamable) listening on port ${port}`);
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
