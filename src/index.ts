#!/usr/bin/env node
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools/register.js";
import { setRevitHttpUrl, getRevitHttpUrl } from "./utils/RevitHttpClient.js";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsDir = path.join(__dirname, "..", "views");

function renderView(name: string, vars: Record<string, string> = {}): string {
  let html = readFileSync(path.join(viewsDir, name), "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

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
  app.use(express.static(path.join(__dirname, "..", "public")));

  // Health check — Render dùng để kiểm tra service còn sống
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Landing page
  app.get("/", (_req, res) => {
    const uptime = process.uptime();
    const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    res.setHeader("Content-Type", "text/html");
    res.send(renderView("index.html", {
      TOOL_COUNT: String(toolRegistry.length),
      UPTIME: uptimeStr,
    }));
  });

  // UI page to set REVIT_HTTP_URL
  app.get("/connect", (_req, res) => {
    const currentUrl = getRevitHttpUrl() || "";
    res.setHeader("Content-Type", "text/html");
    res.send(renderView("connect.html", {
      CURRENT_URL: currentUrl,
      CURRENT_URL_DISPLAY: currentUrl || "Not set",
    }));
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

  // Set REVIT_HTTP_URL at runtime — không cần redeploy khi Cloudflare URL thay đổi
  app.post("/set-revit-url", (req, res) => {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      res.status(400).json({ error: "Missing or invalid url" });
      return;
    }
    setRevitHttpUrl(url.trim());
    console.error(`[Config] REVIT_HTTP_URL updated to: ${url.trim()}`);
    res.json({ ok: true, url: url.trim() });
  });

  // Get current REVIT_HTTP_URL
  app.get("/revit-url", (_req, res) => {
    res.json({ url: getRevitHttpUrl() || null });
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
