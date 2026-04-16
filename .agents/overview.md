# DeepBIM MCP Server — Project Overview

## What is this?

DeepBIM MCP Server is a **Model Context Protocol (MCP) server** that bridges AI assistants (Claude, VS Code Copilot, etc.) with **Autodesk Revit** via a Revit plugin running locally.

AI assistants can call tools defined here to read/write Revit model data, execute C# code inside Revit, create elements, tag rooms, export data, and more.

---

## Architecture

```
AI Assistant (Claude / VS Code)
        │
        │  MCP Protocol (stdio local | HTTP remote)
        ▼
DeepBIM MCP Server  [this repo — Node.js / TypeScript]
        │
        │  JSON-RPC over TCP (local) or HTTP (remote/Render)
        ▼
Revit Plugin  [C# — runs inside Autodesk Revit]
        │
        ▼
Autodesk Revit document
```

---

## Two deployment modes

| Mode | Transport | Revit connection | When to use |
|---|---|---|---|
| **Local (stdio)** | `StdioServerTransport` | TCP socket scan ports 8080–8099 | Development, same machine |
| **Remote (HTTP)** | `StreamableHTTPServerTransport` | HTTP POST via `REVIT_URL` env var (ngrok) | Deployed on Render |

The server auto-detects: if `PORT` env var exists → HTTP mode; otherwise → stdio.

---

## Key technologies

| Technology | Role |
|---|---|
| `@modelcontextprotocol/sdk` v1.27+ | MCP protocol implementation |
| `Express` | HTTP server for remote mode |
| `better-sqlite3` | Local SQLite DB for persisting project/room data |
| `zod` | Schema validation for tool parameters |
| `TypeScript` | Source language, compiled to `build/` |
| `pnpm` | Package manager |

---

## Repository layout

```
src/
  index.ts                 — Entry point; selects stdio or HTTP transport
  tools/
    register.ts            — Dynamic tool loader with module caching
    *.ts                   — One file per tool (32 tools total)
  utils/
    ConnectionManager.ts   — Creates connection to Revit plugin
    SocketClient.ts        — TCP JSON-RPC client (local mode)
    HttpClient.ts          — HTTP JSON-RPC client (remote mode)
  database/
    service.ts             — SQLite CRUD for project/room/module data
build/                     — Compiled JS output (git-ignored)
render.yaml                — Render.com deploy config
Dockerfile                 — Docker build for Render
.vscode/mcp.json           — VS Code MCP server config (local + remote)
doc/                       — Human-readable guides
```
