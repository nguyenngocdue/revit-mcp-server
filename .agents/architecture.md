# Technical Architecture

## Transport layer

### Local (stdio)
```
VS Code ──stdio──▶ McpServer ──TCP JSON-RPC──▶ RevitClientConnection
                                               (SocketClient.ts)
                                               scans ports 8080–8099
```

- `StdioServerTransport` from `@modelcontextprotocol/sdk`
- `RevitClientConnection` (TCP): sends JSON-RPC 2.0 messages, waits for response via callback map keyed by `requestId`
- Port scanning: tries each port until one accepts connection (Revit plugin listens on first available)
- Mutex ensures sequential Revit access (one request at a time)

### Remote (HTTP on Render)
```
VS Code ──HTTP POST /mcp──▶ Express ──HTTP POST /api/command──▶ ngrok──▶ Revit plugin
         (Streamable HTTP)           (HttpClient.ts, fetch)
```

- `StreamableHTTPServerTransport` — stateless, `sessionIdGenerator: undefined`
- Each POST `/mcp` creates a fresh `McpServer` + `StreamableHTTPServerTransport`
- `registerTools()` uses cached register functions (modules loaded once at startup)
- `HttpClient` wraps `fetch` with 2-minute timeout via `AbortController`
- `REVIT_URL` env var sets target (ngrok URL in production)

---

## Request flow (tool call)

```
1. AI calls tool "get_current_view_info"
2. MCP SDK routes to registered handler in McpServer
3. Handler calls: withRevitConnection(client => client.sendCommand("get_current_view_info", {}))
4. ConnectionManager creates client (TCP or HTTP depending on env)
5. Client sends JSON-RPC:
   { "jsonrpc": "2.0", "method": "get_current_view_info", "params": {}, "id": "16845..." }
6. Revit plugin processes, returns:
   { "jsonrpc": "2.0", "result": { "viewName": "...", "viewType": "..." }, "id": "16845..." }
7. Handler returns result as MCP text content
```

---

## Tool registration (register.ts)

Dynamic loading at startup:
1. Read all `.js` files in `tools/` directory (excluding `register.js`)
2. `import()` each module
3. Find function named `register*` → cache it
4. On each HTTP request: call cached fns on new `McpServer` instance (fast, no re-import)

---

## Database (SQLite via better-sqlite3)

File: `revit-data.db` in `process.cwd()`

Tables:
- `projects` — project metadata (name, path, number, address, client, author)
- `rooms` — room data (project_id FK, room_number, room_name, level, area, perimeter, coordinates, metadata JSON)
- `modules` — saved C# code modules (name, description, code, parameters, tags)

Used by: `store_project_data`, `store_room_data`, `export_room_data`, `query_stored_data`, `search_modules`, `use_module`

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | — | Set by Render; triggers HTTP mode |
| `MCP_TRANSPORT` | — | Set to `http` to force HTTP mode |
| `REVIT_URL` | `http://localhost:8080` | Target Revit plugin URL (HTTP mode) |
| `API_KEY` | auto-generated | Bearer token printed to stderr on startup |
| `NODE_ENV` | — | Set to `production` on Render |

---

## JSON-RPC protocol (MCP Server ↔ Revit Plugin)

Request:
```json
{
  "jsonrpc": "2.0",
  "method": "tool_name",
  "params": { /* tool args */ },
  "id": "unique-request-id"
}
```

Response (success):
```json
{ "jsonrpc": "2.0", "result": { /* data */ }, "id": "unique-request-id" }
```

Response (error):
```json
{ "jsonrpc": "2.0", "error": { "message": "..." }, "id": "unique-request-id" }
```

The Revit plugin (C#) must implement an HTTP server listening at `POST /api/command` that accepts this format.

---

## HTTP endpoints (remote mode)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/` | Landing page with server info | No |
| `GET` | `/health` | `{"status":"ok"}` for Render health check | No |
| `GET` | `/mcp/tools` | JSON list of all registered tools | No |
| `POST` | `/mcp` | MCP Streamable HTTP endpoint | No |
