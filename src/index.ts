#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSayHelloTool } from "./tools/say_hello.js";

const server = new McpServer({
  name: "revit-mcp-server",
  version: "1.0.0",
});

async function main() {
  // Register tools
  registerSayHelloTool(server);

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Revit MCP Server started successfully.");
}

main().catch((error) => {
  console.error("Error starting Revit MCP Server:", error);
  process.exit(1);
});
